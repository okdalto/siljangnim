"""Tool handler + scene helpers for the siljangnim agent."""

import asyncio
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

def _apply_edits(current_scene: dict, edits: list[dict]) -> tuple[dict, list[str]]:
    """Apply a list of path-based edits to the current scene JSON."""
    scene = json.loads(json.dumps(current_scene))
    warnings = []
    for i, edit in enumerate(edits):
        target = edit.get("target", "")
        value = edit.get("value")
        if not target:
            warnings.append(f"Edit {i}: empty target path, skipped")
            continue
        try:
            _set_nested(scene, target, value)
        except (KeyError, IndexError, TypeError) as e:
            warnings.append(f"Edit {i}: failed to set '{target}': {e}")
    return scene, warnings


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
# Tool handler
# ---------------------------------------------------------------------------

async def _handle_tool(
    name: str,
    input_data: dict,
    broadcast: BroadcastCallback,
) -> str:
    """Execute a tool call and return the result as a plain string."""

    if name == "get_current_scene":
        try:
            scene = workspace.read_json("scene.json")
            return json.dumps(scene, indent=2)
        except FileNotFoundError:
            return "No scene.json exists yet. Create a new one."

    elif name == "read_scene_section":
        path = input_data.get("path", "")
        if not path:
            return "Error: 'path' is required."
        try:
            scene = workspace.read_json("scene.json")
        except FileNotFoundError:
            return "No scene.json exists yet."
        try:
            value = _get_nested(scene, path)
            if isinstance(value, str):
                return value
            return json.dumps(value, indent=2)
        except (KeyError, TypeError) as e:
            return f"Path '{path}' not found: {e}"

    elif name == "update_scene":
        raw = input_data.get("scene_json", "")
        try:
            if isinstance(raw, str):
                scene = json.loads(raw)
            else:
                scene = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        errors = _validate_scene_json(scene)
        if errors:
            error_text = "Validation errors (fix these and call update_scene again):\n"
            error_text += "\n".join(f"  - {e}" for e in errors)
            return error_text

        try:
            workspace.write_json("scene.json", scene)
        except OSError as e:
            return f"Error writing scene.json: {e}"

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        return "ok — script mode scene saved and broadcast."

    elif name == "edit_scene":
        raw = input_data.get("edits", "")
        try:
            if isinstance(raw, str):
                edits = json.loads(raw)
            else:
                edits = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        if not isinstance(edits, list):
            return "Error: 'edits' must be a JSON array."

        try:
            scene = workspace.read_json("scene.json")
        except FileNotFoundError:
            return "No scene.json exists. Use update_scene to create one first."

        # Apply edits
        scene = json.loads(json.dumps(scene))  # deep copy
        warnings = []
        for i, edit in enumerate(edits):
            path = edit.get("path", "")
            op = edit.get("op", "set")
            if not path:
                warnings.append(f"Edit {i}: empty path, skipped")
                continue
            try:
                if op == "delete":
                    _delete_nested(scene, path)
                else:
                    _set_nested(scene, path, edit.get("value"))
            except (KeyError, TypeError) as e:
                warnings.append(f"Edit {i} ({op} '{path}'): {e}")

        errors = _validate_scene_json(scene)
        if errors:
            error_text = "Validation errors after edits:\n"
            error_text += "\n".join(f"  - {e}" for e in errors)
            if warnings:
                error_text += "\nEdit warnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return error_text

        try:
            workspace.write_json("scene.json", scene)
        except OSError as e:
            return f"Error writing scene.json: {e}"

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        result = f"ok — {len(edits)} edit(s) applied and broadcast."
        if warnings:
            result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
        return result

    elif name == "update_ui_config":
        raw = input_data.get("ui_config", "")
        try:
            if isinstance(raw, str):
                ui_config = json.loads(raw)
            else:
                ui_config = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        try:
            workspace.write_json("ui_config.json", ui_config)
        except OSError as e:
            return f"Error writing ui_config.json: {e}"
        await broadcast({
            "type": "scene_update",
            "ui_config": ui_config,
        })
        return "ok — ui_config saved and broadcast to clients."

    elif name == "get_workspace_state":
        try:
            ws_state = workspace.read_json("workspace_state.json")
            return json.dumps(ws_state, indent=2)
        except FileNotFoundError:
            return json.dumps({"version": 1, "keyframes": {}, "duration": 30, "loop": True}, indent=2)

    elif name == "update_workspace_state":
        raw = input_data.get("workspace_state", "")
        try:
            if isinstance(raw, str):
                ws_state = json.loads(raw)
            else:
                ws_state = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        # Ensure version field
        if "version" not in ws_state:
            ws_state["version"] = 1

        try:
            workspace.write_json("workspace_state.json", ws_state)
        except OSError as e:
            return f"Error writing workspace_state.json: {e}"

        await broadcast({
            "type": "workspace_state_update",
            "workspace_state": ws_state,
        })
        return "ok — workspace state saved and broadcast to clients."

    elif name == "read_uploaded_file":
        filename = input_data.get("filename", "")
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

    elif name == "list_uploaded_files":
        files = workspace.list_uploads()
        if not files:
            return "No files have been uploaded yet."
        # Filter out processed/ subdirectory files from the main listing
        main_files = [f for f in files if not f.startswith("processed/")]
        if not main_files:
            return "No files have been uploaded yet."
        info_lines = []
        for f in main_files:
            try:
                info = workspace.get_upload_info(f)
                line = f"- {f} ({info['size']} bytes, {info['mime_type']})"

                # Check for processed derivatives
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

    elif name == "list_files":
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

    elif name == "read_file":
        rel_path = input_data.get("path", "")
        if not rel_path:
            return "Error: 'path' is required."
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
            content = resolved.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            return f"Error reading '{rel_path}': {e}"

        lines = content.splitlines(keepends=True)
        total_lines = len(lines)
        offset = max(1, input_data.get("offset", 1))
        limit = input_data.get("limit")

        # Apply pagination
        start_idx = offset - 1  # 1-based to 0-based
        if limit is not None and limit > 0:
            end_idx = min(start_idx + limit, total_lines)
        else:
            end_idx = total_lines

        selected = lines[start_idx:end_idx]
        result = "".join(selected)

        # Truncate if still too large
        max_size = 50_000
        truncated = ""
        if len(result) > max_size:
            result = result[:max_size]
            truncated = "\n... (truncated at 50KB)"

        header = f"File: {rel_path} ({file_size} bytes, {total_lines} lines)"
        if limit is not None or offset > 1:
            shown_start = offset
            shown_end = start_idx + len(selected)
            header += f" [showing lines {shown_start}-{shown_end}]"
            if shown_end < total_lines:
                header += f" — use offset={shown_end + 1} to read more"
        return f"{header}\n\n{result}{truncated}"

    elif name == "write_file":
        rel_path = input_data.get("path", "")
        content = input_data.get("content", "")
        if not rel_path:
            return "Error: 'path' is required."
        resolved = _resolve_project_path(rel_path)
        if resolved is None:
            return "Error: path is outside the project root."
        # Check that the path is under .workspace/
        try:
            resolved.relative_to(workspace._BASE_DIR.resolve())
        except ValueError:
            return "Write access denied. Only .workspace/ is writable."
        try:
            resolved.parent.mkdir(parents=True, exist_ok=True)
            resolved.write_text(content, encoding="utf-8")
        except OSError as e:
            return f"Error writing '{rel_path}': {e}"
        return f"ok — wrote {len(content)} bytes to {rel_path}"

    elif name == "open_panel":
        panel_id = input_data.get("id", "")
        title = input_data.get("title", "Panel")
        html = input_data.get("html", "")
        template = input_data.get("template", "")
        config_obj = input_data.get("config", {})
        width = input_data.get("width", 320)
        height = input_data.get("height", 300)
        if not panel_id:
            return "Error: 'id' is required."

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

        await broadcast({
            "type": "open_panel",
            "id": panel_id,
            "title": title,
            "html": html,
            "width": width,
            "height": height,
        })
        return f"ok — panel '{panel_id}' opened."

    elif name == "close_panel":
        panel_id = input_data.get("id", "")
        if not panel_id:
            return "Error: 'id' is required."
        await broadcast({
            "type": "close_panel",
            "id": panel_id,
        })
        return f"ok — panel '{panel_id}' closed."

    elif name == "start_recording":
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

    elif name == "stop_recording":
        await broadcast({"type": "stop_recording"})
        return "ok — recording stopped. The WebM file will auto-download in the user's browser."

    elif name == "run_python":
        code = input_data.get("code", "")
        if not code.strip():
            return "Error: empty code."
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

    elif name == "run_command":
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

    elif name == "ask_user":
        # Local import to avoid circular dependency (executor → handlers → executor)
        from agents import executor
        question = input_data.get("question", "")
        options = input_data.get("options", [])
        executor._user_answer_future = asyncio.get_event_loop().create_future()
        await broadcast({
            "type": "agent_question",
            "question": question,
            "options": options,
        })
        answer = await executor._user_answer_future
        executor._user_answer_future = None
        return f"The user answered: {answer}"

    else:
        return f"Unknown tool: {name}"
