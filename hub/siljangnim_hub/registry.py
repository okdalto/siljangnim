"""The shared recipe registry: recipes other people verified, fetched on request.

A registry is static files:

    <base>/index.json                  {"version": 1, "recipes": [{id, version, title, capability, kind,
                                         license, verified_on, path, sha256}, ...]}
    <base>/recipes/<id>/recipe.md

<base> is an https URL (default: this project's registry folder on GitHub) or
a local folder. Installing checks the file against the index's sha256 and
adds it as an imported draft (recipes.py), so it is verified on this machine
and runs only after the person agrees, like any recipe from elsewhere.

`python -m siljangnim_hub.registry build <folder>` regenerates index.json.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path


from .recipes import Recipes, parse, validate_id
from .runtime import RuntimeErrorWithHint

DEFAULT_URL = "https://raw.githubusercontent.com/okdalto/siljangnim/main/registry"
INDEX_TTL_S = 600
MAX_BYTES = 512 * 1024


class Registry:
    def __init__(self, base: str, recipes: Recipes):
        self.base = base.rstrip("/")
        self.recipes = recipes
        self._index: tuple[float, dict] | None = None

    def _read(self, path: str) -> bytes:
        if re.match(r"^https?://", self.base):
            if not self.base.startswith("https://"):
                raise RuntimeErrorWithHint("the registry must be served over https")
            try:
                with urllib.request.urlopen(f"{self.base}/{path}", timeout=20) as res:
                    data = res.read(MAX_BYTES + 1)
            except OSError as err:
                raise RuntimeErrorWithHint(f"the recipe registry is unreachable ({self.base}): {err}") from err
        else:
            file = Path(self.base) / path
            if not file.is_file():
                raise RuntimeErrorWithHint(f"the recipe registry has no {path}")
            data = file.read_bytes()[: MAX_BYTES + 1]
        if len(data) > MAX_BYTES:
            raise RuntimeErrorWithHint(f"{path} in the registry is too large")
        return data

    def index(self) -> dict:
        if self._index and time.time() - self._index[0] < INDEX_TTL_S:
            return self._index[1]
        index = json.loads(self._read("index.json"))
        if not isinstance(index.get("recipes"), list):
            raise RuntimeErrorWithHint("the registry index has no recipes list")
        self._index = (time.time(), index)
        return index

    def search(self, query: str = "") -> list[dict]:
        words = [w for w in re.split(r"[\s,]+", query.lower()) if w]
        found = []
        for entry in self.index()["recipes"]:
            haystack = " ".join(str(entry.get(k, "")) for k in ("id", "title", "capability")).lower()
            if all(w in haystack for w in words):
                found.append({k: entry.get(k) for k in ("id", "version", "title", "capability", "kind", "license", "verified_on")})
        return found

    def install(self, recipe_id: str) -> dict:
        validate_id(recipe_id)
        entry = next((e for e in self.index()["recipes"] if e.get("id") == recipe_id), None)
        if not entry:
            raise RuntimeErrorWithHint(f'the registry has no recipe "{recipe_id}"')
        data = self._read(str(entry.get("path") or f"recipes/{recipe_id}/recipe.md"))
        if hashlib.sha256(data).hexdigest() != entry.get("sha256"):
            raise RuntimeErrorWithHint(f'"{recipe_id}" in the registry doesn\'t match its index entry (sha256); not installed')
        text = data.decode("utf-8")
        if parse(text)["meta"].get("id") != recipe_id:
            raise RuntimeErrorWithHint(f'the registry file for "{recipe_id}" has another id')
        return self.recipes.import_text(text)


def build_index(folder: Path) -> dict:
    """index.json for a registry folder: one entry per recipes/<id>/recipe.md."""
    entries = []
    for path in sorted(folder.glob("recipes/*/recipe.md")):
        data = path.read_bytes()
        meta = parse(data.decode("utf-8"))["meta"]
        if meta.get("id") != path.parent.name:
            raise SystemExit(f"{path}: id {meta.get('id')!r} doesn't match its folder")
        verified = sorted(p for p, v in (meta.get("platforms") or {}).items() if (v or {}).get("status") == "verified")
        entries.append(
            {
                "id": meta["id"],
                "version": meta.get("version"),
                "title": meta.get("title"),
                "capability": meta.get("capability"),
                "kind": meta.get("kind"),
                "license": (meta.get("source") or {}).get("license"),
                "verified_on": verified,
                "path": path.relative_to(folder).as_posix(),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    return {"version": 1, "recipes": entries}


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "build":
        raise SystemExit("usage: python -m siljangnim_hub.registry build <registry folder>")
    root = Path(sys.argv[2])
    index = build_index(root)
    (root / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"index.json: {len(index['recipes'])} recipes")
