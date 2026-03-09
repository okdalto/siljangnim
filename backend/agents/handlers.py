"""Tool handler + scene helpers for the siljangnim agent."""

import asyncio
import copy
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Callable, Awaitable

import workspace

# ---------------------------------------------------------------------------
# Project path constants
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

_IGNORED_DIRS = {
    ".git", "node_modules", ".venv", "__pycache__", "dist",
    ".next", ".cache", ".DS_Store", ".vite",
}

_ALLOWED_COMMANDS = {"pip", "ffmpeg", "ffprobe", "convert", "magick"}

# Dangerous argument patterns that could be used for injection/escape
_BLOCKED_ARG_PATTERNS = [
    "$(", "`",           # command substitution
    "&&", "||", ";",     # command chaining
    "|",                 # piping
    ">", ">>", "<",     # redirection
    "\n", "\r",          # newline injection
]

_WORKSPACE_FILES = {
    "scene.json", "workspace_state.json", "panels.json",
    "ui_config.json", "debug_logs.json",
}

# Directories where the agent is allowed to write (in addition to workspace files)
_WRITABLE_SOURCE_DIRS = {
    "frontend/src/engine/",
    "backend/agents/",
}

BroadcastCallback = Callable[[dict], Awaitable[None]]


def _resolve_project_path(path: str) -> Path | None:
    """Resolve a path relative to project root. Returns None if outside root."""
    resolved = (_PROJECT_ROOT / path).resolve()
    if not str(resolved).startswith(str(_PROJECT_ROOT.resolve())):
        return None
    return resolved


# ---------------------------------------------------------------------------
# Scene JSON validation
# ---------------------------------------------------------------------------

def _normalize_script_strings(scene: dict) -> None:
    """Fix common JSON escape issues in script strings (setup/render/cleanup).

    LLMs sometimes produce strings with literal tab characters, unescaped
    backslashes before non-escape sequences, or other encoding issues.
    This normalises them in-place so the script evaluates correctly.
    """
    script = scene.get("script")
    if not isinstance(script, dict):
        return
    for key in ("setup", "render", "cleanup"):
        val = script.get(key)
        if not isinstance(val, str):
            continue
        # Replace literal tab characters with \\t escape (common LLM mistake)
        val = val.replace("\t", "    ")
        script[key] = val


def _validate_scene_json(scene: dict) -> list[str]:
    """Validate a scene JSON (script mode only).

    Returns a list of error strings. Empty list = valid.
    """
    errors = []

    if not isinstance(scene, dict):
        return ["Scene JSON is not a dict"]

    script = scene.get("script")
    if not script or not isinstance(script, dict):
        errors.append("Missing 'script' object in scene JSON")
        return errors
    if not script.get("render"):
        errors.append("Missing 'script.render' code in scene JSON")

    return errors


# ---------------------------------------------------------------------------
# Edit mode helpers
# ---------------------------------------------------------------------------

def _get_nested(obj, path):
    """Get a value from a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys:
        if isinstance(obj, dict):
            if key not in obj:
                raise KeyError(f"Key '{key}' not found")
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    return obj


def _delete_nested(obj, path):
    """Delete a key from a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys[:-1]:
        if isinstance(obj, dict):
            if key not in obj:
                raise KeyError(f"Key '{key}' not found")
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    final_key = keys[-1]
    if isinstance(obj, dict) and final_key in obj:
        del obj[final_key]
    else:
        raise KeyError(f"Key '{final_key}' not found")


def _set_nested(obj, path, value):
    """Set a value in a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys[:-1]:
        if isinstance(obj, dict):
            if key not in obj:
                obj[key] = {}
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    final_key = keys[-1]
    if isinstance(obj, dict):
        obj[final_key] = value
    else:
        raise TypeError(f"Cannot set key '{final_key}' on non-dict")


# ---------------------------------------------------------------------------
# Individual tool handlers
# ---------------------------------------------------------------------------

async def _tool_read_file(input_data: dict, broadcast: BroadcastCallback) -> str:
    rel_path = input_data.get("path", "")
    if not rel_path:
        return "Error: 'path' is required."
    section = input_data.get("section")
    offset = input_data.get("offset")
    limit = input_data.get("limit")

    # --- Workspace JSON files ---
    if rel_path in _WORKSPACE_FILES:
        try:
            data = workspace.read_json(rel_path)
        except FileNotFoundError:
            if rel_path == "workspace_state.json":
                data = {"version": 1, "keyframes": {}, "duration": 30, "loop": True}
            else:
                return f"No {rel_path} exists yet. Create a new one."
        if section:
            try:
                value = _get_nested(data, section)
                if isinstance(value, str):
                    return value
                return json.dumps(value, indent=2)
            except (KeyError, TypeError) as e:
                return f"Section '{section}' not found: {e}"
        return json.dumps(data, indent=2)

    # --- Upload files (uploads/xxx) ---
    if rel_path.startswith("uploads/"):
        filename = rel_path[len("uploads/"):]
        try:
            info = workspace.get_upload_info(filename)
            mime = info["mime_type"]
            text_types = (
                "text/", "application/json", "application/xml",
                "application/javascript", "model/obj",
            )
            text_extensions = (
                ".obj", ".mtl", ".glsl", ".vert", ".frag", ".txt",
                ".csv", ".json", ".xml", ".html", ".css", ".js",
                ".py", ".md", ".yaml", ".yml", ".toml", ".svg",
            )
            is_text = any(mime.startswith(t) for t in text_types) or \
                      any(filename.lower().endswith(ext) for ext in text_extensions)

            if is_text:
                content = workspace.read_upload_text(filename)
                if len(content) > 50000:
                    content = content[:50000] + "\n... (truncated)"
                result_text = f"File: {filename} ({info['size']} bytes, {mime})\n\n{content}"
            else:
                result_text = (
                    f"Binary file: {filename}\n"
                    f"Size: {info['size']} bytes\n"
                    f"MIME type: {mime}\n"
                    f"This is a binary file. Its contents cannot be displayed as text.\n"
                    f"If it's an image, the user may have sent it via vision (check the conversation).\n"
                    f"The file is accessible at: /api/uploads/{filename}"
                )

            # Append processed derivatives info
            manifest = workspace.read_processed_manifest(filename)
            if manifest:
                proc_name = manifest.get("processor_name", "Unknown")
                status = manifest.get("status", "unknown")
                stem = workspace.get_processed_dir(filename).name
                result_text += f"\n\n--- Processed Derivatives ---\n"
                result_text += f"Processor: {proc_name} ({status})\n"
                for out in manifest.get("outputs", []):
                    out_url = f"/api/uploads/processed/{stem}/{out['filename']}"
                    result_text += f"- {out['filename']}: {out['description']}\n"
                    result_text += f"  URL: {out_url}\n"
                meta = manifest.get("metadata", {})
                if meta:
                    result_text += f"Metadata: {json.dumps(meta)}\n"

            return result_text
        except FileNotFoundError:
            return f"File not found: {filename}"

    # --- General project files (read-only) ---
    resolved = _resolve_project_path(rel_path)
    if resolved is None:
        return "Error: path is outside the project root."
    if not resolved.is_file():
        return f"Error: '{rel_path}' is not a file or does not exist."
    binary_extensions = {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        ".zip", ".tar", ".gz", ".bz2", ".7z",
        ".pdf", ".exe", ".dll", ".so", ".dylib",
        ".mp3", ".mp4", ".wav", ".ogg", ".webm",
        ".pyc", ".pyo", ".class",
    }
    suffix = resolved.suffix.lower()
    file_size = resolved.stat().st_size
    if suffix in binary_extensions:
        return (
            f"Binary file: {rel_path}\n"
            f"Size: {file_size} bytes\n"
            f"Type: {suffix}\n"
            f"Binary files cannot be displayed as text."
        )
    try:
        file_content = resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return f"Error reading '{rel_path}': {e}"

    lines = file_content.splitlines(keepends=True)
    total_lines = len(lines)
    eff_offset = max(1, offset if offset is not None else 1)
    eff_limit = limit

    start_idx = eff_offset - 1
    if eff_limit is not None and eff_limit > 0:
        end_idx = min(start_idx + eff_limit, total_lines)
    else:
        end_idx = total_lines

    selected = lines[start_idx:end_idx]
    result = "".join(selected)

    max_size = 50_000
    truncated = ""
    if len(result) > max_size:
        result = result[:max_size]
        truncated = "\n... (truncated at 50KB)"

    header = f"File: {rel_path} ({file_size} bytes, {total_lines} lines)"
    if eff_limit is not None or eff_offset > 1:
        shown_start = eff_offset
        shown_end = start_idx + len(selected)
        header += f" [showing lines {shown_start}-{shown_end}]"
        if shown_end < total_lines:
            header += f" — use offset={shown_end + 1} to read more"
    return f"{header}\n\n{result}{truncated}"


async def _tool_write_scene(input_data: dict, broadcast: BroadcastCallback) -> str:
    """Create/replace scene.json from raw script parameters."""
    scene = {"version": 1, "render_mode": "script", "script": {}}

    for key in ("setup", "render", "cleanup"):
        val = input_data.get(key)
        if val:
            scene["script"][key] = val

    if not scene["script"].get("render"):
        return "Error: 'render' is required."

    if "uniforms" in input_data:
        scene["uniforms"] = input_data["uniforms"]
    if "clearColor" in input_data:
        scene["clearColor"] = input_data["clearColor"]

    _normalize_script_strings(scene)
    errors = _validate_scene_json(scene)
    if errors:
        return "Validation errors:\n" + "\n".join(f"  - {e}" for e in errors)

    try:
        workspace.write_json("scene.json", scene)
    except OSError as e:
        return f"Error writing scene.json: {e}"
    await broadcast({"type": "scene_update", "scene_json": scene})
    return "ok — scene saved and broadcast."


async def _tool_write_file(input_data: dict, broadcast: BroadcastCallback) -> str:
    rel_path = input_data.get("path", "")
    if not rel_path:
        return "Error: 'path' is required."
    raw_content = input_data.get("content")
    raw_edits = input_data.get("edits")

    if raw_content is None and raw_edits is None:
        return "Error: either 'content' or 'edits' is required."

    # --- Write permission check ---
    is_workspace_file = rel_path in _WORKSPACE_FILES
    is_under_workspace_dir = rel_path.startswith(".workspace/") or rel_path.startswith(".workspace\\")
    is_writable_source = any(rel_path.startswith(d) for d in _WRITABLE_SOURCE_DIRS)
    if not is_workspace_file and not is_under_workspace_dir and not is_writable_source:
        return "Write access denied. Only workspace files, .workspace/, and engine source files are writable."

    # --- Full replacement (content mode) ---
    if raw_content is not None:
        if is_workspace_file:
            # Parse as JSON for workspace files
            try:
                if isinstance(raw_content, str):
                    data = json.loads(raw_content)
                else:
                    data = raw_content
            except json.JSONDecodeError as e:
                return f"Invalid JSON: {e}"

            # scene.json: normalize + validate + broadcast
            if rel_path == "scene.json":
                _normalize_script_strings(data)
                errors = _validate_scene_json(data)
                if errors:
                    error_text = "Validation errors (fix these and try again):\n"
                    error_text += "\n".join(f"  - {e}" for e in errors)
                    return error_text
                try:
                    workspace.write_json("scene.json", data)
                except OSError as e:
                    return f"Error writing scene.json: {e}"
                await broadcast({"type": "scene_update", "scene_json": data})
                return "ok — scene saved and broadcast."

            # workspace_state.json: ensure version + broadcast
            if rel_path == "workspace_state.json":
                if "version" not in data:
                    data["version"] = 1
                try:
                    workspace.write_json("workspace_state.json", data)
                except OSError as e:
                    return f"Error writing workspace_state.json: {e}"
                await broadcast({"type": "workspace_state_update", "workspace_state": data})
                return "ok — workspace state saved and broadcast."

            # Other workspace files: just save
            try:
                workspace.write_json(rel_path, data)
            except OSError as e:
                return f"Error writing {rel_path}: {e}"
            return f"ok — {rel_path} saved."

        else:
            # .workspace/* or writable source file write
            resolved = _resolve_project_path(rel_path)
            if resolved is None:
                return "Error: path is outside the project root."
            try:
                resolved.parent.mkdir(parents=True, exist_ok=True)
                resolved.write_text(raw_content if isinstance(raw_content, str) else json.dumps(raw_content), encoding="utf-8")
            except OSError as e:
                return f"Error writing '{rel_path}': {e}"
            content_len = len(raw_content) if isinstance(raw_content, str) else len(json.dumps(raw_content))
            return f"ok — wrote {content_len} bytes to {rel_path}"

    # --- Partial edit (edits mode) ---
    try:
        if isinstance(raw_edits, str):
            edits = json.loads(raw_edits)
        else:
            edits = raw_edits
    except json.JSONDecodeError as e:
        return f"Invalid edits JSON: {e}"

    if not isinstance(edits, list):
        return "Error: 'edits' must be a JSON array."

    if is_workspace_file:
        # JSON dot-path editing for workspace files
        try:
            data = workspace.read_json(rel_path)
        except FileNotFoundError:
            if rel_path == "scene.json":
                return "No scene.json exists. Use write_file with content to create one first."
            if rel_path == "workspace_state.json":
                data = {"version": 1, "keyframes": {}, "duration": 30, "loop": True}
            else:
                data = {}

        data = copy.deepcopy(data)
        warnings = []
        applied_count = 0
        for i, edit in enumerate(edits):
            # Detect edit type: dot-path (has 'path') vs text search-replace (has 'old_text')
            if "path" in edit:
                dot_path = edit["path"]
                op = edit.get("op", "set")
                if not dot_path:
                    warnings.append(f"Edit {i}: empty path, skipped")
                    continue
                try:
                    if op == "delete":
                        _delete_nested(data, dot_path)
                    else:
                        _set_nested(data, dot_path, edit.get("value"))
                    applied_count += 1
                except (KeyError, TypeError) as e:
                    warnings.append(f"Edit {i} ({op} '{dot_path}'): {e}")
            else:
                warnings.append(f"Edit {i}: JSON workspace files only support dot-path edits (need 'path' field). Use edits with 'path' key for dot-path operations.")

        # If no edits were actually applied, return error
        if applied_count == 0 and warnings:
            return "Error: no edits applied.\n" + "\n".join(f"  - {w}" for w in warnings)

        # scene.json: normalize + validate + broadcast
        if rel_path == "scene.json":
            _normalize_script_strings(data)
            errors = _validate_scene_json(data)
            if errors:
                error_text = "Validation errors after edits:\n"
                error_text += "\n".join(f"  - {e}" for e in errors)
                if warnings:
                    error_text += "\nEdit warnings:\n" + "\n".join(f"  - {w}" for w in warnings)
                return error_text
            try:
                workspace.write_json("scene.json", data)
            except OSError as e:
                return f"Error writing scene.json: {e}"
            await broadcast({"type": "scene_update", "scene_json": data})
            result = f"ok — {len(edits)} edit(s) applied to scene.json and broadcast."
            if warnings:
                result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return result

        # workspace_state.json: ensure version + broadcast
        if rel_path == "workspace_state.json":
            if "version" not in data:
                data["version"] = 1
            try:
                workspace.write_json("workspace_state.json", data)
            except OSError as e:
                return f"Error writing workspace_state.json: {e}"
            await broadcast({"type": "workspace_state_update", "workspace_state": data})
            result = f"ok — {len(edits)} edit(s) applied to workspace_state.json and broadcast."
            if warnings:
                result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return result

        # Other workspace JSON files: just save
        try:
            workspace.write_json(rel_path, data)
        except OSError as e:
            return f"Error writing {rel_path}: {e}"
        result = f"ok — {len(edits)} edit(s) applied to {rel_path}."
        if warnings:
            result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
        return result

    else:
        # Text search-replace editing for .workspace/* files
        resolved = _resolve_project_path(rel_path)
        if resolved is None:
            return "Error: path is outside the project root."
        if not resolved.is_file():
            return f"Error: '{rel_path}' does not exist."
        try:
            file_text = resolved.read_text(encoding="utf-8")
        except OSError as e:
            return f"Error reading '{rel_path}': {e}"

        warnings = []
        for i, edit in enumerate(edits):
            if "old_text" in edit:
                old_text = edit["old_text"]
                new_text = edit.get("new_text", "")
                if old_text not in file_text:
                    warnings.append(f"Edit {i}: old_text not found, skipped")
                    continue
                file_text = file_text.replace(old_text, new_text, 1)
            else:
                warnings.append(f"Edit {i}: text files require 'old_text' field for edits")

        try:
            resolved.write_text(file_text, encoding="utf-8")
        except OSError as e:
            return f"Error writing '{rel_path}': {e}"
        result = f"ok — {len(edits)} edit(s) applied to {rel_path}."
        if warnings:
            result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
        return result


async def _tool_list_uploaded_files(input_data: dict, broadcast: BroadcastCallback) -> str:
    files = workspace.list_uploads()
    if not files:
        return "No files have been uploaded yet."
    main_files = [f for f in files if not f.startswith("processed/")]
    if not main_files:
        return "No files have been uploaded yet."
    info_lines = []
    for f in main_files:
        try:
            info = workspace.get_upload_info(f)
            line = f"- {f} ({info['size']} bytes, {info['mime_type']})"
            manifest = workspace.read_processed_manifest(f)
            if manifest:
                proc_name = manifest.get("processor_name", "Unknown")
                status = manifest.get("status", "unknown")
                line += f"\n  Processed by: {proc_name} ({status})"
                stem = workspace.get_processed_dir(f).name
                for out in manifest.get("outputs", []):
                    out_url = f"/api/uploads/processed/{stem}/{out['filename']}"
                    line += f"\n    - {out['filename']}: {out['description']} ({out_url})"
            info_lines.append(line)
        except FileNotFoundError:
            info_lines.append(f"- {f} (info unavailable)")
    return "Uploaded files:\n" + "\n".join(info_lines)


async def _tool_list_files(input_data: dict, broadcast: BroadcastCallback) -> str:
    rel_path = input_data.get("path", ".")
    resolved = _resolve_project_path(rel_path)
    if resolved is None:
        return "Error: path is outside the project root."
    if not resolved.is_dir():
        return f"Error: '{rel_path}' is not a directory."
    try:
        entries = sorted(os.listdir(resolved))
    except PermissionError:
        return f"Error: permission denied for '{rel_path}'."
    lines = []
    for entry in entries:
        if entry in _IGNORED_DIRS or entry.startswith("."):
            continue
        full = resolved / entry
        if full.is_dir():
            lines.append(f"  {entry}/")
        else:
            try:
                size = full.stat().st_size
                lines.append(f"  {entry}  ({size} bytes)")
            except OSError:
                lines.append(f"  {entry}")
    if not lines:
        return f"Directory '{rel_path}' is empty (after filtering)."
    return f"Contents of '{rel_path}':\n" + "\n".join(lines)


async def _tool_open_panel(input_data: dict, broadcast: BroadcastCallback) -> str:
    panel_id = input_data.get("id", "")
    title = input_data.get("title", "Panel")
    html = input_data.get("html", "")
    template = input_data.get("template", "")
    config_obj = input_data.get("config", {})
    width = input_data.get("width", 320)
    height = input_data.get("height", 300)
    if not panel_id:
        return "Error: 'id' is required."

    # Native controls mode — no iframe, React renders the controls
    if template == "controls":
        controls = config_obj.get("controls", [])
        if not controls:
            return "Error: config.controls array is required for template='controls'."
        panel_data = {
            "type": "open_panel",
            "id": panel_id,
            "title": title,
            "controls": controls,
            "width": width,
            "height": height,
        }
        await broadcast(panel_data)
        # Persist to panels.json
        try:
            panels = workspace.read_json("panels.json")
        except (FileNotFoundError, json.JSONDecodeError):
            panels = {}
        panels[panel_id] = {
            "title": title,
            "controls": controls,
            "width": width,
            "height": height,
        }
        workspace.write_json("panels.json", panels)
        return f"ok — native controls panel '{panel_id}' opened."

    # Template takes priority over raw html
    if template:
        template_dir = Path(__file__).resolve().parent.parent / "panel_templates"
        template_path = template_dir / f"{template}.html"
        if not template_path.exists():
            available = [f.stem for f in template_dir.glob("*.html")] if template_dir.exists() else []
            return f"Error: template '{template}' not found. Available: {available}"
        html = template_path.read_text(encoding="utf-8")
        # Inject config into the template
        if config_obj:
            config_json = json.dumps(config_obj, ensure_ascii=False)
            html = html.replace("const CONFIG = {};", f"const CONFIG = {config_json};", 1)

    if not html:
        return "Error: either 'html' or 'template' is required."

    panel_msg = {
        "type": "open_panel",
        "id": panel_id,
        "title": title,
        "html": html,
        "width": width,
        "height": height,
    }
    await broadcast(panel_msg)
    # Persist to panels.json
    try:
        panels = workspace.read_json("panels.json")
    except (FileNotFoundError, json.JSONDecodeError):
        panels = {}
    panels[panel_id] = {
        "title": title,
        "html": html,
        "width": width,
        "height": height,
    }
    workspace.write_json("panels.json", panels)
    return f"ok — panel '{panel_id}' opened."


async def _tool_close_panel(input_data: dict, broadcast: BroadcastCallback) -> str:
    panel_id = input_data.get("id", "")
    if not panel_id:
        return "Error: 'id' is required."
    await broadcast({
        "type": "close_panel",
        "id": panel_id,
    })
    # Remove from panels.json
    try:
        panels = workspace.read_json("panels.json")
        if panel_id in panels:
            del panels[panel_id]
            workspace.write_json("panels.json", panels)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return f"ok — panel '{panel_id}' closed."


async def _tool_start_recording(input_data: dict, broadcast: BroadcastCallback) -> str:
    msg = {"type": "start_recording"}
    duration = input_data.get("duration")
    fps = input_data.get("fps")
    if duration is not None:
        msg["duration"] = duration
    if fps is not None:
        msg["fps"] = fps
    await broadcast(msg)
    duration_str = f" for {duration}s" if duration else ""
    return f"ok — recording started{duration_str}."


async def _tool_stop_recording(input_data: dict, broadcast: BroadcastCallback) -> str:
    await broadcast({"type": "stop_recording"})
    return "ok — recording stopped. The WebM file will auto-download in the user's browser."


_BLOCKED_PYTHON_PATTERNS = [
    # OS command execution
    "os.system", "os.popen", "os.exec",
    "subprocess.call", "subprocess.run", "subprocess.Popen", "subprocess.check_output",
    # File deletion
    "shutil.rmtree", "os.remove", "os.unlink", "os.rmdir",
    # Dynamic code execution
    "exec(", "compile(", "eval(",
    # Import smuggling (any quote style)
    "__import__(",
    "importlib",
    # Attribute tricks for obfuscation
    "getattr(", "setattr(",
    # Network access
    "import socket", "import requests", "import urllib", "import http",
    # Low-level system access
    "import ctypes", "import signal",
    # File system access outside workspace
    "open('/", 'open("/', "open(\\",
    "pathlib.Path('/", 'pathlib.Path("/',
]

async def _tool_run_python(input_data: dict, broadcast: BroadcastCallback) -> str:
    code = input_data.get("code", "")
    if not code.strip():
        return "Error: empty code."
    # Block dangerous patterns
    code_lower = code.lower()
    for pattern in _BLOCKED_PYTHON_PATTERNS:
        if pattern.lower() in code_lower:
            return f"Error: blocked pattern '{pattern}' detected. This operation is not allowed."
    gen_dir = workspace.get_workspace_dir()
    gen_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = gen_dir / "_run_tmp.py"
    try:
        tmp_file.write_text(code, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(tmp_file)],
            cwd=str(gen_dir),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout + result.stderr
        if len(output) > 50_000:
            output = output[:50_000] + "\n... (truncated at 50KB)"
        if not output.strip():
            output = "(no output)"
        return output
    except subprocess.TimeoutExpired:
        return "Error: execution timed out after 30 seconds."
    except Exception as e:
        return f"Error running Python code: {e}"
    finally:
        if tmp_file.exists():
            tmp_file.unlink()


async def _tool_run_command(input_data: dict, broadcast: BroadcastCallback) -> str:
    command = input_data.get("command", "")
    if not command.strip():
        return "Error: empty command."
    try:
        args = shlex.split(command)
    except ValueError as e:
        return f"Error parsing command: {e}"
    if not args:
        return "Error: empty command after parsing."
    cmd_name = args[0]
    if cmd_name not in _ALLOWED_COMMANDS:
        return (
            f"Error: '{cmd_name}' is not allowed. "
            f"Allowed commands: {', '.join(sorted(_ALLOWED_COMMANDS))}"
        )
    # Validate individual arguments for injection patterns
    for i, arg in enumerate(args[1:], 1):
        for pattern in _BLOCKED_ARG_PATTERNS:
            if pattern in arg:
                return f"Error: argument {i} contains blocked pattern '{pattern}'."
    # Rewrite pip to use the current Python interpreter
    if cmd_name == "pip":
        args = [sys.executable, "-m", "pip"] + args[1:]
    gen_dir = workspace.get_workspace_dir()
    gen_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            args,
            cwd=str(gen_dir),
            capture_output=True,
            text=True,
            timeout=60,
        )
        output = result.stdout + result.stderr
        if len(output) > 50_000:
            output = output[:50_000] + "\n... (truncated at 50KB)"
        if not output.strip():
            output = "(no output)"
        return output
    except subprocess.TimeoutExpired:
        return "Error: command timed out after 60 seconds."
    except FileNotFoundError:
        return f"Error: command '{cmd_name}' not found on this system."
    except Exception as e:
        return f"Error running command: {e}"


async def _tool_check_browser_errors(input_data: dict, broadcast: BroadcastCallback, ws_id: int = 0) -> str:
    # Return any browser errors that have arrived (before or during the wait).
    from agents import executor
    errors_list = executor._browser_errors.setdefault(ws_id, [])
    event = executor._browser_error_events.setdefault(ws_id, asyncio.Event())
    event.clear()

    # If errors already queued, return immediately.
    # Otherwise wait up to 3 seconds for one to arrive.
    if not errors_list:
        try:
            await asyncio.wait_for(event.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            pass

    errors = list(errors_list)
    errors_list.clear()
    if not errors:
        return "No browser errors detected."
    # Separate engine errors from script errors
    engine_errors = [e for e in errors if e.startswith("[engine]")]
    script_errors = [e for e in errors if not e.startswith("[engine]")]
    parts = []
    if script_errors:
        parts.append("Script errors (fix these in scene.json):\n" + "\n".join(f"  - {e}" for e in script_errors))
    if engine_errors:
        parts.append("Engine/infrastructure errors (NOT caused by your script — do NOT try to fix these):\n" + "\n".join(f"  - {e}" for e in engine_errors))
    return "\n\n".join(parts)


async def _tool_ask_user(input_data: dict, broadcast: BroadcastCallback, ws_id: int = 0) -> str:
    # Local import to avoid circular dependency (executor → handlers → executor)
    from agents import executor
    question = input_data.get("question", "")
    options = input_data.get("options", [])
    future = asyncio.get_running_loop().create_future()
    executor._user_answer_futures[ws_id] = future
    await broadcast({
        "type": "agent_question",
        "question": question,
        "options": options,
    })
    answer = await future
    executor._user_answer_futures.pop(ws_id, None)
    return f"The user answered: {answer}"


# ---------------------------------------------------------------------------
# Dispatch table & dispatcher
# ---------------------------------------------------------------------------

_TOOL_HANDLERS = {
    "read_file": _tool_read_file,
    "write_scene": _tool_write_scene,
    "write_file": _tool_write_file,
    "list_uploaded_files": _tool_list_uploaded_files,
    "list_files": _tool_list_files,
    "open_panel": _tool_open_panel,
    "close_panel": _tool_close_panel,
    "start_recording": _tool_start_recording,
    "stop_recording": _tool_stop_recording,
    "run_python": _tool_run_python,
    "run_command": _tool_run_command,
    "check_browser_errors": _tool_check_browser_errors,
    "ask_user": _tool_ask_user,
}


async def _handle_tool(
    name: str,
    input_data: dict,
    broadcast: BroadcastCallback,
    ws_id: int = 0,
) -> str:
    """Execute a tool call and return the result as a plain string."""
    handler = _TOOL_HANDLERS.get(name)
    if handler:
        if name in ("check_browser_errors", "ask_user"):
            return await handler(input_data, broadcast, ws_id)
        return await handler(input_data, broadcast)
    return f"Unknown tool: {name}"
