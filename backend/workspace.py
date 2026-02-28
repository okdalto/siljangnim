"""
Sandboxed workspace I/O for PromptGL.

All AI-generated outputs MUST be written strictly inside WORKSPACE_DIR.
This module enforces path safety so no agent can escape the sandbox.
"""

import json
import mimetypes
import shutil
from pathlib import Path

WORKSPACE_DIR = Path(__file__).resolve().parent.parent / ".workspace" / "generated"
UPLOADS_DIR = WORKSPACE_DIR / "uploads"


def _safe_path(filename: str) -> Path:
    """Resolve a filename inside the sandbox and reject directory traversal."""
    resolved = (WORKSPACE_DIR / filename).resolve()
    if not str(resolved).startswith(str(WORKSPACE_DIR.resolve())):
        raise PermissionError(f"Path escapes sandbox: {filename}")
    return resolved


def write_file(filename: str, content: str) -> Path:
    """Write content to a file inside the generated workspace."""
    path = _safe_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def read_file(filename: str) -> str:
    """Read a file from the generated workspace."""
    path = _safe_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"File not found in workspace: {filename}")
    return path.read_text(encoding="utf-8")


def list_files() -> list[str]:
    """List all files in the generated workspace (relative paths)."""
    if not WORKSPACE_DIR.exists():
        return []
    return [
        str(p.relative_to(WORKSPACE_DIR))
        for p in WORKSPACE_DIR.rglob("*")
        if p.is_file() and p.name != ".gitkeep"
    ]


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
    """Resolve a filename inside UPLOADS_DIR and reject directory traversal."""
    resolved = (UPLOADS_DIR / filename).resolve()
    if not str(resolved).startswith(str(UPLOADS_DIR.resolve())):
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
    if not UPLOADS_DIR.exists():
        return []
    return [
        str(p.relative_to(UPLOADS_DIR))
        for p in UPLOADS_DIR.rglob("*")
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
    if UPLOADS_DIR.exists():
        shutil.rmtree(UPLOADS_DIR)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Processed file derivatives
# ---------------------------------------------------------------------------

PROCESSED_DIR = UPLOADS_DIR / "processed"


def get_processed_dir(filename: str) -> Path:
    """Get processed output directory for a file (stem_ext form to avoid collisions).

    Example: logo.png → processed/logo_png/
    """
    p = Path(filename)
    return PROCESSED_DIR / f"{p.stem}_{p.suffix.lstrip('.')}"


def read_processed_manifest(filename: str) -> dict | None:
    """Read the processing manifest for a file, or None if not processed."""
    manifest = get_processed_dir(filename) / "manifest.json"
    if not manifest.exists():
        return None
    return json.loads(manifest.read_text())


def is_processed(filename: str) -> bool:
    """Check if a file has been processed (manifest exists)."""
    return (get_processed_dir(filename) / "manifest.json").exists()
