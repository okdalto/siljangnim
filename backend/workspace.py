"""
Sandboxed workspace I/O for siljangnim.

All AI-generated outputs MUST be written strictly inside the active workspace dir.
This module enforces path safety so no agent can escape the sandbox.

The active workspace is a folder under .workspace/projects/<name>/.
A pointer file (.active_project) tracks which project is active across restarts.
"""

import json
import logging
import mimetypes
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Base directory constants
# ---------------------------------------------------------------------------

_BASE_DIR = Path(__file__).resolve().parent.parent / ".workspace"
_PROJECTS_DIR = _BASE_DIR / "projects"
_DEFAULT_PROJECT = "_untitled"
_ACTIVE_PROJECT_FILE = _BASE_DIR / ".active_project"

# Dynamic pointer — changed via set_workspace_dir()
_active_workspace_dir: Path = _PROJECTS_DIR / _DEFAULT_PROJECT


# ---------------------------------------------------------------------------
# Public accessors
# ---------------------------------------------------------------------------

def get_workspace_dir() -> Path:
    """Return the currently active workspace directory."""
    return _active_workspace_dir


def get_uploads_dir() -> Path:
    """Return the uploads directory inside the active workspace."""
    return _active_workspace_dir / "uploads"


def get_processed_dir(filename: str) -> Path:
    """Get processed output directory for a file (stem_ext form to avoid collisions).

    Example: logo.png → processed/logo_png/
    """
    p = Path(filename)
    return get_uploads_dir() / "processed" / f"{p.stem}_{p.suffix.lstrip('.')}"


def get_active_project_name() -> str:
    """Return the sanitized name of the currently active project."""
    return _active_workspace_dir.name


def set_workspace_dir(name: str) -> None:
    """Switch the active workspace pointer to projects/<name>/.

    Creates the directory if it doesn't exist, and persists the choice
    to .active_project so it survives server restarts.
    """
    global _active_workspace_dir
    target = _PROJECTS_DIR / name
    target.mkdir(parents=True, exist_ok=True)
    _active_workspace_dir = target
    _persist_active_project(name)
    logger.info("Workspace switched to: %s", name)


# ---------------------------------------------------------------------------
# Initialization & migration
# ---------------------------------------------------------------------------

def init_workspace() -> None:
    """Call once at server startup.

    1. Migrate legacy generated/ → _untitled/ if needed.
    2. Restore the last active project from .active_project.
    3. Ensure the workspace directory exists.
    """
    _PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

    # Migration: move generated/ contents to _untitled/
    legacy_dir = _BASE_DIR / "generated"
    if legacy_dir.exists() and any(legacy_dir.iterdir()):
        untitled = _PROJECTS_DIR / _DEFAULT_PROJECT
        if untitled.exists() and any(untitled.iterdir()):
            # Both exist — merge generated/ into _untitled/ (generated/ wins)
            for item in legacy_dir.iterdir():
                dest = untitled / item.name
                if item.is_dir():
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.copytree(item, dest)
                else:
                    shutil.copy2(item, dest)
            shutil.rmtree(legacy_dir)
        else:
            untitled.parent.mkdir(parents=True, exist_ok=True)
            legacy_dir.rename(untitled)
        logger.info("Migrated generated/ → projects/%s/", _DEFAULT_PROJECT)

    # Clean up empty generated/ dir if it still exists
    if legacy_dir.exists() and not any(legacy_dir.iterdir()):
        legacy_dir.rmdir()

    # Restore last active project
    _restore_active_project()


def new_untitled_workspace() -> None:
    """Reset to a fresh _untitled workspace.

    Removes any existing _untitled/ contents and creates a clean directory.
    """
    untitled = _PROJECTS_DIR / _DEFAULT_PROJECT
    if untitled.exists():
        shutil.rmtree(untitled)
    untitled.mkdir(parents=True, exist_ok=True)
    set_workspace_dir(_DEFAULT_PROJECT)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _persist_active_project(name: str) -> None:
    """Write the active project name to the pointer file."""
    _ACTIVE_PROJECT_FILE.parent.mkdir(parents=True, exist_ok=True)
    _ACTIVE_PROJECT_FILE.write_text(name, encoding="utf-8")


def _restore_active_project() -> None:
    """Read the pointer file and switch to that project (if it exists)."""
    global _active_workspace_dir
    if _ACTIVE_PROJECT_FILE.exists():
        try:
            name = _ACTIVE_PROJECT_FILE.read_text(encoding="utf-8").strip()
            target = _PROJECTS_DIR / name
            if target.exists():
                _active_workspace_dir = target
                logger.info("Restored active project: %s", name)
                return
        except OSError:
            pass

    # Fallback to _untitled
    _active_workspace_dir = _PROJECTS_DIR / _DEFAULT_PROJECT
    _active_workspace_dir.mkdir(parents=True, exist_ok=True)
    _persist_active_project(_DEFAULT_PROJECT)


# ---------------------------------------------------------------------------
# Sandboxed path resolution
# ---------------------------------------------------------------------------

def _safe_path(filename: str) -> Path:
    """Resolve a filename inside the sandbox and reject directory traversal."""
    ws = get_workspace_dir()
    resolved = (ws / filename).resolve()
    if not str(resolved).startswith(str(ws.resolve())):
        raise PermissionError(f"Path escapes sandbox: {filename}")
    return resolved


def safe_path(filename: str) -> Path:
    """Public alias for _safe_path."""
    return _safe_path(filename)


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------

def write_file(filename: str, content: str) -> Path:
    """Write content to a file inside the active workspace."""
    path = _safe_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def read_file(filename: str) -> str:
    """Read a file from the active workspace."""
    path = _safe_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"File not found in workspace: {filename}")
    return path.read_text(encoding="utf-8")


def list_files() -> list[str]:
    """List all files in the active workspace (relative paths)."""
    ws = get_workspace_dir()
    if not ws.exists():
        return []
    return [
        str(p.relative_to(ws))
        for p in ws.rglob("*")
        if p.is_file() and p.name != ".gitkeep"
    ]


def list_files_detailed() -> list[dict]:
    """List all files with size, mime_type, modified metadata."""
    ws = get_workspace_dir()
    if not ws.exists():
        return []
    files = []
    for p in ws.rglob("*"):
        if not p.is_file() or p.name == ".gitkeep":
            continue
        stat = p.stat()
        mime, _ = mimetypes.guess_type(str(p))
        files.append({
            "path": str(p.relative_to(ws)),
            "size": stat.st_size,
            "mime_type": mime or "application/octet-stream",
            "modified": stat.st_mtime,
        })
    files.sort(key=lambda f: f["path"])
    return files


def delete_file(filename: str) -> None:
    """Delete a file from the workspace."""
    path = _safe_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filename}")
    path.unlink()


def write_json(filename: str, data: dict) -> Path:
    """Write a dict as JSON to the workspace."""
    return write_file(filename, json.dumps(data, indent=2))


def read_json(filename: str) -> dict:
    """Read a JSON file from the workspace."""
    return json.loads(read_file(filename))


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------

def _safe_upload_path(filename: str) -> Path:
    """Resolve a filename inside the uploads dir and reject directory traversal."""
    uploads = get_uploads_dir()
    resolved = (uploads / filename).resolve()
    if not str(resolved).startswith(str(uploads.resolve())):
        raise PermissionError(f"Path escapes upload sandbox: {filename}")
    return resolved


def save_upload(filename: str, data: bytes) -> Path:
    """Save uploaded file data to the uploads directory."""
    path = _safe_upload_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def read_upload(filename: str) -> bytes:
    """Read an uploaded file as bytes."""
    path = _safe_upload_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"Upload not found: {filename}")
    return path.read_bytes()


def read_upload_text(filename: str) -> str:
    """Read an uploaded file as text (for text-based files)."""
    path = _safe_upload_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"Upload not found: {filename}")
    return path.read_text(encoding="utf-8", errors="replace")


def list_uploads() -> list[str]:
    """List all files in the uploads directory."""
    uploads = get_uploads_dir()
    if not uploads.exists():
        return []
    return [
        str(p.relative_to(uploads))
        for p in uploads.rglob("*")
        if p.is_file()
    ]


def get_upload_info(filename: str) -> dict:
    """Get metadata for an uploaded file."""
    path = _safe_upload_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"Upload not found: {filename}")
    mime, _ = mimetypes.guess_type(str(path))
    return {
        "filename": filename,
        "size": path.stat().st_size,
        "mime_type": mime or "application/octet-stream",
    }


def clear_uploads() -> None:
    """Remove all files from the uploads directory."""
    uploads = get_uploads_dir()
    if uploads.exists():
        shutil.rmtree(uploads)
    uploads.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Processed file derivatives
# ---------------------------------------------------------------------------

def read_processed_manifest(filename: str) -> dict | None:
    """Read the processing manifest for a file, or None if not processed."""
    manifest = get_processed_dir(filename) / "manifest.json"
    if not manifest.exists():
        return None
    return json.loads(manifest.read_text())


def is_processed(filename: str) -> bool:
    """Check if a file has been processed (manifest exists)."""
    return (get_processed_dir(filename) / "manifest.json").exists()


# ---------------------------------------------------------------------------
# Default scene / UI config (shared by main.py and ws_handlers.py)
# ---------------------------------------------------------------------------

DEFAULT_SCENE_JSON = {
    "version": 1,
    "render_mode": "script",
    "script": {
        "setup": (
            "const gl = ctx.gl;\n"
            "const prog = ctx.utils.createProgram(\n"
            "  ctx.utils.DEFAULT_QUAD_VERTEX_SHADER,\n"
            "  `#version 300 es\n"
            "precision highp float;\n"
            "in vec2 v_uv;\n"
            "uniform float u_time;\n"
            "out vec4 fragColor;\n"
            "void main() {\n"
            "  vec2 uv = v_uv;\n"
            "  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));\n"
            "  fragColor = vec4(col, 1.0);\n"
            "}\n"
            "`);\n"
            "const quad = ctx.utils.createQuadGeometry();\n"
            "const vao = gl.createVertexArray();\n"
            "gl.bindVertexArray(vao);\n"
            "const buf = gl.createBuffer();\n"
            "gl.bindBuffer(gl.ARRAY_BUFFER, buf);\n"
            "gl.bufferData(gl.ARRAY_BUFFER, quad.positions, gl.STATIC_DRAW);\n"
            "const loc = gl.getAttribLocation(prog, 'a_position');\n"
            "gl.enableVertexAttribArray(loc);\n"
            "gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);\n"
            "gl.bindVertexArray(null);\n"
            "ctx.state.prog = prog;\n"
            "ctx.state.vao = vao;\n"
            "ctx.state.buf = buf;\n"
        ),
        "render": (
            "const gl = ctx.gl;\n"
            "gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);\n"
            "gl.clearColor(0.08, 0.08, 0.12, 1.0);\n"
            "gl.clear(gl.COLOR_BUFFER_BIT);\n"
            "gl.useProgram(ctx.state.prog);\n"
            "const tLoc = gl.getUniformLocation(ctx.state.prog, 'u_time');\n"
            "if (tLoc) gl.uniform1f(tLoc, ctx.time);\n"
            "gl.bindVertexArray(ctx.state.vao);\n"
            "gl.drawArrays(gl.TRIANGLES, 0, 6);\n"
            "gl.bindVertexArray(null);\n"
        ),
        "cleanup": (
            "const gl = ctx.gl;\n"
            "gl.deleteProgram(ctx.state.prog);\n"
            "gl.deleteVertexArray(ctx.state.vao);\n"
            "gl.deleteBuffer(ctx.state.buf);\n"
        ),
    },
    "uniforms": {},
    "clearColor": [0.08, 0.08, 0.12, 1.0],
}

DEFAULT_UI_CONFIG = {"controls": [], "inspectable_buffers": []}
