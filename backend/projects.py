"""
Project save/load for siljangnim.

Each project is a folder under .workspace/projects/ containing:
  meta.json, scene.json, ui_config.json, chat_history.json, thumbnail.jpg

Projects ARE the workspace — no file copying between generated/ and project folders.
The active workspace pointer (workspace.set_workspace_dir) simply switches
which folder all workspace I/O targets.
"""

import base64
import io
import json
import logging
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import workspace

logger = logging.getLogger(__name__)

PROJECTS_DIR = workspace._PROJECTS_DIR
MANIFEST_FILENAME = "siljangnim-project.json"
CURRENT_SCHEMA_VERSION = 2


def _migrate_v1_to_v2(old_meta: dict) -> dict:
    """Migrate a v1 meta.json to v2 manifest format."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "name": old_meta.get("name", "untitled"),
        "display_name": old_meta.get("display_name", old_meta.get("name", "Untitled")),
        "description": old_meta.get("description", ""),
        "created_at": old_meta.get("created_at", now),
        "updated_at": old_meta.get("updated_at", now),
        "has_thumbnail": old_meta.get("has_thumbnail", False),
        "provenance": old_meta.get("provenance", {
            "source_type": "local",
            "github_repo": None,
            "github_path": None,
            "imported_commit_sha": None,
            "forked_from": None,
            "original_author": None,
        }),
        "trust": old_meta.get("trust", {
            "safe_mode": False,
            "trusted_by": None,
            "trusted_at": None,
        }),
        "assets": old_meta.get("assets", []),
    }


def _read_project_manifest(project_dir: Path) -> dict:
    """Read siljangnim-project.json, falling back to meta.json with auto-migration."""
    manifest_path = project_dir / MANIFEST_FILENAME
    meta_path = project_dir / "meta.json"

    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            sv = manifest.get("schema_version", 0)
            if sv > CURRENT_SCHEMA_VERSION:
                logger.warning("Project %s has schema_version %d (newer than supported %d), loading as-is",
                               project_dir.name, sv, CURRENT_SCHEMA_VERSION)
                return manifest
            if sv >= CURRENT_SCHEMA_VERSION:
                return manifest
            return _migrate_v1_to_v2(manifest)
        except (json.JSONDecodeError, OSError):
            pass

    if meta_path.exists():
        try:
            old_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            manifest = _migrate_v1_to_v2(old_meta)
            # Lazy migration: write the new manifest
            try:
                manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            except OSError:
                pass
            return manifest
        except (json.JSONDecodeError, OSError):
            pass

    return _migrate_v1_to_v2({"name": project_dir.name})


def _write_project_manifest(project_dir: Path, manifest: dict) -> None:
    """Write siljangnim-project.json and also meta.json for backwards compat."""
    manifest_path = project_dir / MANIFEST_FILENAME
    meta_path = project_dir / "meta.json"
    manifest["schema_version"] = CURRENT_SCHEMA_VERSION
    manifest_json = json.dumps(manifest, indent=2)
    manifest_path.write_text(manifest_json, encoding="utf-8")
    # Also write meta.json for backwards compat
    meta_path.write_text(manifest_json, encoding="utf-8")


def _sanitize_name(name: str) -> str:
    """Convert a display name into a safe directory name."""
    s = name.strip().lower()[:128]
    s = re.sub(r"[^a-z0-9_]+", "-", s)
    s = s.strip("-")
    return s or "untitled"


def _strip_version_suffix(sanitized: str) -> str:
    """my-project_2 → my-project"""
    return re.sub(r"_\d+$", "", sanitized)


def _next_version_name(base: str) -> str:
    """my-project → my-project_1 (next available suffix)"""
    counter = 1
    while (PROJECTS_DIR / f"{base}_{counter}").exists():
        counter += 1
    return f"{base}_{counter}"


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
    base = _strip_version_suffix(sanitized)
    current_dir = workspace.get_workspace_dir()
    current_name = workspace.get_active_project_name()

    # Determine target directory name
    # If re-saving the currently active project, overwrite in place
    if current_name == sanitized or current_name == base:
        target_name = current_name
    elif (PROJECTS_DIR / base).exists():
        target_name = _next_version_name(base)
    else:
        target_name = base

    project_dir = PROJECTS_DIR / target_name

    if target_name == current_name:
        # Re-saving in place — no file copy needed
        pass
    elif current_name == workspace._DEFAULT_PROJECT and target_name != workspace._DEFAULT_PROJECT:
        # First save: _untitled → named project (move)
        project_dir.parent.mkdir(parents=True, exist_ok=True)
        current_dir.rename(project_dir)
        workspace.set_workspace_dir(target_name)
    else:
        # Copy current workspace to new version
        shutil.copytree(current_dir, project_dir)
        workspace.set_workspace_dir(target_name)

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

    # Build manifest (v2)
    now = datetime.now(timezone.utc).isoformat()

    # Preserve existing manifest data if project already exists
    existing_manifest = _read_project_manifest(project_dir) if project_dir.exists() else {}
    created_at = existing_manifest.get("created_at", now)

    # Build display_name: use base project's display_name + new version suffix
    display_name = name.strip()
    if target_name != base:
        base_dir = PROJECTS_DIR / base
        if base_dir.exists():
            try:
                base_manifest = _read_project_manifest(base_dir)
                base_display = base_manifest.get("display_name", name.strip())
                base_display = re.sub(r"_\d+$", "", base_display)
                suffix = target_name[len(base):]
                display_name = f"{base_display}{suffix}"
            except Exception:
                pass

    manifest = {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "name": target_name,
        "display_name": display_name,
        "description": description,
        "created_at": created_at,
        "updated_at": now,
        "has_thumbnail": has_thumbnail,
        "provenance": existing_manifest.get("provenance", {
            "source_type": "local",
            "github_repo": None,
            "github_path": None,
            "imported_commit_sha": None,
            "forked_from": None,
            "original_author": None,
        }),
        "trust": existing_manifest.get("trust", {
            "safe_mode": False,
            "trusted_by": None,
            "trusted_at": None,
        }),
        "assets": existing_manifest.get("assets", []),
    }

    _write_project_manifest(project_dir, manifest)

    return manifest


def load_project(name: str) -> dict:
    """Switch to a saved project and return its data. No file copying."""
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")

    sanitized = _sanitize_name(name)

    # Switch workspace pointer — this is the key change (no file copying)
    workspace.set_workspace_dir(sanitized)

    meta = _read_project_manifest(project_dir)

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

    debug_logs = []
    dl_path = project_dir / "debug_logs.json"
    if dl_path.exists():
        try:
            debug_logs = json.loads(dl_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    # Fallback: if no panels but ui_config has controls, create a default controls panel
    if not panels and ui_config.get("controls"):
        panels = {
            "controls": {
                "title": "Controls",
                "controls": ui_config["controls"],
                "width": 320,
                "height": 300,
            }
        }
        # Persist so the fallback doesn't repeat
        workspace.write_json("panels.json", panels)

    return {
        "meta": meta,
        "chat_history": chat_history,
        "scene_json": scene_json,
        "ui_config": ui_config,
        "workspace_state": workspace_state,
        "panels": panels,
        "debug_logs": debug_logs,
    }


def list_projects() -> list[dict]:
    """Return all project metadata, sorted by updated_at descending."""
    if not PROJECTS_DIR.exists():
        return []
    projects = []
    for d in PROJECTS_DIR.iterdir():
        manifest_path = d / MANIFEST_FILENAME
        meta_path = d / "meta.json"
        if d.is_dir() and (manifest_path.exists() or meta_path.exists()):
            try:
                meta = _read_project_manifest(d)
                projects.append(meta)
            except Exception:
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


def export_project_zip(name: str, *, exclude_chat: bool = False) -> bytes:
    """Export a project folder as a ZIP archive (in-memory)."""
    project_dir = _safe_project_path(name)
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {name}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in project_dir.rglob("*"):
            if p.is_file():
                if exclude_chat and p.name == "chat_history.json":
                    continue
                zf.write(p, p.relative_to(project_dir))
    return buf.getvalue()


def _import_json_bundle(raw: bytes) -> dict:
    """Import a project from legacy JSON bundle format (IndexedDB export)."""
    data = json.loads(raw)
    meta = data.get("meta", {})
    files = data.get("files", {})
    if not meta and not files:
        raise ValueError("Invalid project bundle")

    project_name = meta.get("name") or meta.get("display_name") or "imported"
    sanitized = _sanitize_name(project_name)
    candidate = sanitized
    counter = 2
    while (PROJECTS_DIR / candidate).exists():
        candidate = f"{sanitized}-{counter}"
        counter += 1

    project_dir = PROJECTS_DIR / candidate
    project_dir.mkdir(parents=True, exist_ok=True)

    # Write each file
    for rel_path, content in files.items():
        file_path = (project_dir / rel_path).resolve()
        if not str(file_path).startswith(str(project_dir.resolve())):
            continue  # skip path traversal
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, (dict, list)):
            file_path.write_text(json.dumps(content, indent=2), encoding="utf-8")
        elif isinstance(content, str):
            file_path.write_text(content, encoding="utf-8")

    return candidate, project_dir


def import_project_zip(zip_bytes: bytes) -> dict:
    """Import a project from ZIP bytes or JSON bundle. Returns the new project's meta dict."""
    buf = io.BytesIO(zip_bytes)
    is_zip = zipfile.is_zipfile(buf)
    buf.seek(0)

    if is_zip:
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            if "meta.json" not in names and "scene.json" not in names:
                raise ValueError("ZIP must contain meta.json or scene.json")

            project_name = "imported"
            if "meta.json" in names:
                try:
                    meta = json.loads(zf.read("meta.json"))
                    project_name = meta.get("name") or "imported"
                except (json.JSONDecodeError, KeyError):
                    pass

            sanitized = _sanitize_name(project_name)
            candidate = sanitized
            counter = 2
            while (PROJECTS_DIR / candidate).exists():
                candidate = f"{sanitized}-{counter}"
                counter += 1

            project_dir = PROJECTS_DIR / candidate
            project_dir.mkdir(parents=True, exist_ok=True)

            # Extract member-by-member with path validation (no extractall)
            project_dir_str = str(project_dir.resolve())
            for member in zf.infolist():
                member_path = (project_dir / member.filename).resolve()
                if not str(member_path).startswith(project_dir_str):
                    raise ValueError("ZIP contains path traversal entry")
                # Skip symlinks
                if ((member.external_attr >> 16) & 0o170000) == 0o120000:
                    raise ValueError("ZIP contains symbolic links")
                if member.is_dir():
                    member_path.mkdir(parents=True, exist_ok=True)
                else:
                    member_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(member_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
    else:
        # Try legacy JSON bundle format
        try:
            candidate, project_dir = _import_json_bundle(zip_bytes)
        except (json.JSONDecodeError, KeyError, TypeError):
            raise ValueError("Invalid file: not a ZIP archive or JSON bundle")

    # Read and migrate manifest
    now = datetime.now(timezone.utc).isoformat()
    manifest = _read_project_manifest(project_dir)

    manifest["name"] = candidate
    if not manifest.get("display_name"):
        manifest["display_name"] = candidate
    manifest["updated_at"] = now
    if not manifest.get("created_at"):
        manifest["created_at"] = now
    manifest["has_thumbnail"] = (project_dir / "thumbnail.jpg").exists()

    # External imports get safe_mode enabled
    manifest["trust"] = {
        "safe_mode": True,
        "trusted_by": None,
        "trusted_at": None,
    }
    if not manifest.get("provenance") or manifest["provenance"].get("source_type") == "local":
        manifest["provenance"] = {
            "source_type": "zip",
            "github_repo": None,
            "github_path": None,
            "imported_commit_sha": None,
            "forked_from": None,
            "original_author": None,
        }

    _write_project_manifest(project_dir, manifest)

    return manifest


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
