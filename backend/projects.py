"""
Project save/load for siljangnim.

Each project is a folder under .workspace/projects/ containing:
  meta.json, scene.json, ui_config.json, chat_history.json, thumbnail.jpg

Projects ARE the workspace — no file copying between generated/ and project folders.
The active workspace pointer (workspace.set_workspace_dir) simply switches
which folder all workspace I/O targets.
"""

import base64
import json
import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import workspace

logger = logging.getLogger(__name__)

PROJECTS_DIR = workspace._PROJECTS_DIR


def _sanitize_name(name: str) -> str:
    """Convert a display name into a safe directory name."""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "untitled"


def _safe_project_path(name: str) -> Path:
    """Resolve a project name to a path, rejecting directory traversal."""
    sanitized = _sanitize_name(name)
    resolved = (PROJECTS_DIR / sanitized).resolve()
    if not str(resolved).startswith(str(PROJECTS_DIR.resolve())):
        raise PermissionError(f"Path escapes projects sandbox: {name}")
    return resolved


def save_project(
    name: str,
    chat_history: list[dict],
    description: str = "",
    thumbnail_b64: str | None = None,
) -> dict:
    """Save the current workspace as a named project.

    - If the active workspace is _untitled and name is new, MOVE the folder.
    - If re-saving the same project, just update metadata.
    - If saving to a different name, COPY the current workspace.
    """
    sanitized = _sanitize_name(name)
    project_dir = _safe_project_path(name)
    current_dir = workspace.get_workspace_dir()
    current_name = workspace.get_active_project_name()

    # First save: _untitled → named project (move)
    if current_name == workspace._DEFAULT_PROJECT and sanitized != workspace._DEFAULT_PROJECT:
        if project_dir.exists():
            # Target already exists — merge current into it
            for item in current_dir.iterdir():
                dest = project_dir / item.name
                if item.is_dir():
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.copytree(item, dest)
                else:
                    shutil.copy2(item, dest)
            # Clean up _untitled
            shutil.rmtree(current_dir)
            current_dir.mkdir(parents=True, exist_ok=True)
        else:
            # Simple rename
            project_dir.parent.mkdir(parents=True, exist_ok=True)
            current_dir.rename(project_dir)
        # Switch pointer to the new project
        workspace.set_workspace_dir(sanitized)
    elif current_name != sanitized:
        # Saving active project under a different name (copy)
        if project_dir.exists():
            shutil.rmtree(project_dir)
        shutil.copytree(current_dir, project_dir)
        workspace.set_workspace_dir(sanitized)
    else:
        # Re-saving the same project — workspace already points here
        project_dir.mkdir(parents=True, exist_ok=True)

    # Save chat history
    (project_dir / "chat_history.json").write_text(
        json.dumps(chat_history, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Save thumbnail from base64 (sent by frontend from canvas.toDataURL)
    has_thumbnail = False
    if thumbnail_b64:
        try:
            if "," in thumbnail_b64:
                thumbnail_b64 = thumbnail_b64.split(",", 1)[1]
            thumb_bytes = base64.b64decode(thumbnail_b64)
            (project_dir / "thumbnail.jpg").write_bytes(thumb_bytes)
            has_thumbnail = True
        except Exception:
            pass

    # Write meta.json
    now = datetime.now(timezone.utc).isoformat()

    # Preserve created_at if project already exists
    meta_path = project_dir / "meta.json"
    created_at = now
    if meta_path.exists():
        try:
            old = json.loads(meta_path.read_text(encoding="utf-8"))
            created_at = old.get("created_at", now)
        except (json.JSONDecodeError, OSError):
            pass

    meta = {
        "name": sanitized,
        "display_name": name.strip(),
        "description": description,
        "created_at": created_at,
        "updated_at": now,
        "has_thumbnail": has_thumbnail,
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    return meta


def load_project(name: str) -> dict:
    """Switch to a saved project and return its data. No file copying."""
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")

    sanitized = _sanitize_name(name)

    # Switch workspace pointer — this is the key change (no file copying)
    workspace.set_workspace_dir(sanitized)

    meta = json.loads(
        (project_dir / "meta.json").read_text(encoding="utf-8")
    )

    chat_history = []
    ch_path = project_dir / "chat_history.json"
    if ch_path.exists():
        chat_history = json.loads(ch_path.read_text(encoding="utf-8"))

    scene_json = {}
    sj_path = project_dir / "scene.json"
    if sj_path.exists():
        scene_json = json.loads(sj_path.read_text(encoding="utf-8"))

    ui_config = {"controls": [], "inspectable_buffers": []}
    uc_path = project_dir / "ui_config.json"
    if uc_path.exists():
        ui_config = json.loads(uc_path.read_text(encoding="utf-8"))

    workspace_state = {}
    ws_path = project_dir / "workspace_state.json"
    if ws_path.exists():
        try:
            workspace_state = json.loads(ws_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    panels = {}
    panels_path = project_dir / "panels.json"
    if panels_path.exists():
        try:
            panels = json.loads(panels_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "meta": meta,
        "chat_history": chat_history,
        "scene_json": scene_json,
        "ui_config": ui_config,
        "workspace_state": workspace_state,
        "panels": panels,
    }


def list_projects() -> list[dict]:
    """Return all project metadata, sorted by updated_at descending."""
    if not PROJECTS_DIR.exists():
        return []
    projects = []
    for d in PROJECTS_DIR.iterdir():
        meta_path = d / "meta.json"
        if d.is_dir() and meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                projects.append(meta)
            except (json.JSONDecodeError, OSError):
                continue
    projects.sort(key=lambda m: m.get("updated_at", ""), reverse=True)
    return projects


def delete_project(name: str) -> None:
    """Delete a project folder entirely.

    If the deleted project is currently active, switch to _untitled.
    """
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")

    sanitized = _sanitize_name(name)
    is_active = (workspace.get_active_project_name() == sanitized)

    shutil.rmtree(project_dir)

    if is_active:
        workspace.new_untitled_workspace()


def _safe_project_file_path(project_name: str, filepath: str) -> Path:
    """Resolve a file path inside a project, rejecting directory traversal."""
    project_dir = _safe_project_path(project_name)
    resolved = (project_dir / filepath).resolve()
    if not str(resolved).startswith(str(project_dir.resolve())):
        raise PermissionError(f"Path escapes project sandbox: {filepath}")
    return resolved


def list_project_files(name: str) -> list[dict]:
    """List all files in a project with metadata."""
    import mimetypes
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")
    files = []
    for p in project_dir.rglob("*"):
        if not p.is_file():
            continue
        stat = p.stat()
        mime, _ = mimetypes.guess_type(str(p))
        files.append({
            "path": str(p.relative_to(project_dir)),
            "size": stat.st_size,
            "mime_type": mime or "application/octet-stream",
            "modified": stat.st_mtime,
        })
    files.sort(key=lambda f: f["path"])
    return files
