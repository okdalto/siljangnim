"""
Project save/load for siljangnim.

Each project is a folder under .workspace/projects/ containing:
  meta.json, scene.json, ui_config.json, chat_history.json, thumbnail.jpg
"""

import base64
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_DIR = Path(__file__).resolve().parent.parent / ".workspace"
GENERATED_DIR = WORKSPACE_DIR / "generated"
PROJECTS_DIR = WORKSPACE_DIR / "projects"

# Files to copy between generated/ and project folders
_COPY_FILES = [
    "scene.json",
    "ui_config.json",
    "workspace_state.json",
]


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
    """Copy current generated/ state into a named project folder."""
    project_dir = _safe_project_path(name)
    project_dir.mkdir(parents=True, exist_ok=True)

    # Copy workspace files
    for fname in _COPY_FILES:
        src = GENERATED_DIR / fname
        if src.exists():
            shutil.copy2(src, project_dir / fname)

    # Copy uploads directory
    src_uploads = GENERATED_DIR / "uploads"
    dst_uploads = project_dir / "uploads"
    if src_uploads.exists() and any(src_uploads.iterdir()):
        if dst_uploads.exists():
            shutil.rmtree(dst_uploads)
        shutil.copytree(src_uploads, dst_uploads)
    elif dst_uploads.exists():
        shutil.rmtree(dst_uploads)

    # Save chat history
    (project_dir / "chat_history.json").write_text(
        json.dumps(chat_history, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Save thumbnail from base64 (sent by frontend from canvas.toDataURL)
    has_thumbnail = False
    if thumbnail_b64:
        try:
            # Strip data URL prefix if present
            if "," in thumbnail_b64:
                thumbnail_b64 = thumbnail_b64.split(",", 1)[1]
            thumb_bytes = base64.b64decode(thumbnail_b64)
            (project_dir / "thumbnail.jpg").write_bytes(thumb_bytes)
            has_thumbnail = True
        except Exception:
            pass

    # Write meta.json
    now = datetime.now(timezone.utc).isoformat()
    sanitized = _sanitize_name(name)

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
    """Restore a saved project into generated/ and return its data."""
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")

    meta = json.loads(
        (project_dir / "meta.json").read_text(encoding="utf-8")
    )

    # Copy files back to generated/
    for fname in _COPY_FILES:
        src = project_dir / fname
        if src.exists():
            shutil.copy2(src, GENERATED_DIR / fname)

    # Restore uploads directory
    src_uploads = project_dir / "uploads"
    dst_uploads = GENERATED_DIR / "uploads"
    if dst_uploads.exists():
        shutil.rmtree(dst_uploads)
    if src_uploads.exists():
        shutil.copytree(src_uploads, dst_uploads)
    else:
        dst_uploads.mkdir(parents=True, exist_ok=True)

    # Read data to return to frontend
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

    return {
        "meta": meta,
        "chat_history": chat_history,
        "scene_json": scene_json,
        "ui_config": ui_config,
        "workspace_state": workspace_state,
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
    """Delete a project folder entirely."""
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")
    shutil.rmtree(project_dir)


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
