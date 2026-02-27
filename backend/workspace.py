"""
Sandboxed workspace I/O for PromptGL.

All AI-generated outputs MUST be written strictly inside WORKSPACE_DIR.
This module enforces path safety so no agent can escape the sandbox.
"""

import json
from pathlib import Path

WORKSPACE_DIR = Path(__file__).resolve().parent.parent / ".workspace" / "generated"


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
