"""Recipes: "this open-source tool, set up like this, worked on this machine".

A recipe is one markdown file a person can read and an agent can follow
(docs/recipes.md): YAML front matter with the machine-readable parts, then
sections for setup, the run code, verification and notes. This module is
the only place that reads and writes the format.

    ~/Siljangnim/recipes/<id>/recipe.md
"""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import yaml

from .runtime import RuntimeErrorWithHint, validate_packages

_ID = re.compile(r"^[a-z0-9][a-z0-9.-]{1,79}$")
_FRONT = re.compile(r"\A---\n(.*?)\n---\n?(.*)\Z", re.S)
_RUN_BLOCK = re.compile(r"^## Run\s*\n(?:.*?\n)?```(python|json)\n(.*?)\n```", re.S | re.M)
STATUSES = ("draft", "verified", "broken")
TIERS = ("C", "D")
MAX_FAILURES_KEPT = 3


def validate_id(recipe_id: str) -> str:
    if not _ID.match(recipe_id):
        raise RuntimeErrorWithHint(
            f'"{recipe_id}" is not a recipe id; use lowercase letters, digits, dots and dashes, e.g. "trimesh.torus-knot"'
        )
    return recipe_id


def _today() -> str:
    return dt.date.today().isoformat()


def render(meta: dict, *, setup: str, code: str, argv: list[str], verify: str, notes: str, failures: list[str]) -> str:
    """The markdown file for a recipe."""
    front = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True).strip()
    if meta["kind"] == "python":
        run = f"Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.\n\n```python\n{code.rstrip()}\n```"
    else:
        run = f"Runs `{meta.get('program')}` with no shell. Reads `in/`, writes `out/`.\n\n```json\n{json.dumps(argv)}\n```"
    parts = [
        f"---\n{front}\n---\n",
        f"# {meta['title']}\n",
        f"## Setup\n\n{setup.strip() or 'Nothing beyond the packages in the front matter.'}\n",
        f"## Run\n\n{run}\n",
        f"## Verify\n\n{verify.strip() or 'Runs with the `verify` params in the front matter and writes every expected output.'}\n",
    ]
    if notes.strip():
        parts.append(f"## Notes\n\n{notes.strip()}\n")
    if failures:
        parts.append("## Failures\n\n" + "\n\n".join(failures[-MAX_FAILURES_KEPT:]) + "\n")
    return "\n".join(parts)


def parse(text: str) -> dict:
    """Front matter plus the run code (or argv) and the free-text sections."""
    match = _FRONT.match(text.replace("\r\n", "\n"))
    if not match:
        raise RuntimeErrorWithHint("the recipe has no front matter (--- ... ---)")
    meta = yaml.safe_load(match.group(1)) or {}
    if not isinstance(meta, dict):
        raise RuntimeErrorWithHint("the recipe front matter is not a mapping")
    body = match.group(2)
    run = _RUN_BLOCK.search(body)
    if not run:
        raise RuntimeErrorWithHint('the recipe has no "## Run" section with a ```python or ```json block')
    sections = {}
    for name in ("Setup", "Verify", "Notes", "Failures"):
        sec = re.search(rf"^## {name}\s*\n(.*?)(?=^## |\Z)", body, re.S | re.M)
        sections[name.lower()] = sec.group(1).strip() if sec else ""
    recipe = {"meta": meta, **sections, "code": "", "argv": []}
    if run.group(1) == "python":
        recipe["code"] = run.group(2)
    else:
        argv = json.loads(run.group(2))
        if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
            raise RuntimeErrorWithHint("the json run block must be an array of strings (argv)")
        recipe["argv"] = argv
    return recipe


class Recipes:
    def __init__(self, root: Path, platform: str):
        self.root = root
        self.platform = platform
        # Created on the first save, so starting the hub leaves no folder behind.

    def _path(self, recipe_id: str) -> Path:
        return self.root / validate_id(recipe_id) / "recipe.md"

    def get(self, recipe_id: str) -> dict:
        path = self._path(recipe_id)
        if not path.is_file():
            raise RuntimeErrorWithHint(f'no recipe "{recipe_id}"; use recipe_search to find one')
        text = path.read_text(encoding="utf-8")
        recipe = parse(text)
        recipe["text"] = text
        recipe["summary"] = self._summary(recipe["meta"])
        return recipe

    def search(self, query: str = "") -> list[dict]:
        words = [w for w in re.split(r"[\s,]+", query.lower()) if w]
        found = []
        for path in self.root.glob("*/recipe.md"):
            try:
                meta = parse(path.read_text(encoding="utf-8"))["meta"]
            except (RuntimeErrorWithHint, ValueError, yaml.YAMLError):
                continue
            haystack = " ".join(str(meta.get(k, "")) for k in ("id", "title", "capability", "tags")).lower()
            if all(w in haystack for w in words):
                found.append(self._summary(meta))
        rank = {"verified": 0, "draft": 1, "broken": 2}
        # Verified here first, then the most recently tested.
        found.sort(key=lambda r: (rank.get(r["status_here"], 3), -(dt.date.fromisoformat(r["tested_here"]).toordinal() if r["tested_here"] else 0), r["id"]))
        return found

    def _summary(self, meta: dict) -> dict:
        here = (meta.get("platforms") or {}).get(self.platform) or {}
        return {
            "id": meta.get("id"),
            "version": meta.get("version"),
            "title": meta.get("title"),
            "capability": meta.get("capability"),
            "tier": meta.get("tier"),
            "kind": meta.get("kind"),
            "packages": meta.get("packages") or [],
            "program": meta.get("program"),
            "io": meta.get("io") or {},
            "license": (meta.get("source") or {}).get("license"),
            "origin": meta.get("origin", "imported"),
            "status_here": here.get("status", "draft"),
            "tested_here": here.get("tested"),
        }

    def save(self, fields: dict) -> dict:
        """Create or update a recipe from structured fields. Always lands as draft here."""
        recipe_id = validate_id(str(fields.get("id", "")))
        kind = fields.get("kind")
        if kind not in ("python", "command"):
            raise RuntimeErrorWithHint('kind must be "python" or "command"')
        packages = validate_packages(fields.get("packages") or []) if kind == "python" else []
        code = str(fields.get("code") or "")
        argv = [str(a) for a in fields.get("argv") or []]
        if kind == "python" and not code.strip():
            raise RuntimeErrorWithHint("a python recipe needs code")
        if kind == "command" and not argv:
            raise RuntimeErrorWithHint("a command recipe needs argv")
        if "```" in code:
            raise RuntimeErrorWithHint("code can't contain ``` (it is stored in a fenced block)")
        for key in ("title", "capability"):
            if not str(fields.get(key) or "").strip():
                raise RuntimeErrorWithHint(f"{key} is required")

        path = self._path(recipe_id)
        previous = None
        if path.is_file():
            try:
                previous = parse(path.read_text(encoding="utf-8"))
            except (RuntimeErrorWithHint, ValueError, yaml.YAMLError):
                previous = None
        old_meta = previous["meta"] if previous else {}
        # The file keeps code without trailing whitespace; compare the same way.
        changed = not previous or previous["code"].rstrip() != code.rstrip() or previous["argv"] != argv or (old_meta.get("packages") or []) != packages
        version = int(old_meta.get("version", 0)) + (1 if changed else 0) or 1
        platforms = dict(old_meta.get("platforms") or {})
        if changed:
            # New code hasn't been checked anywhere yet.
            platforms = {p: {**v, "status": "draft"} for p, v in platforms.items()}
        platforms.setdefault(self.platform, {"status": "draft"})
        meta = {
            "id": recipe_id,
            "version": version,
            "title": str(fields["title"]).strip(),
            "capability": str(fields["capability"]).strip(),
            "tier": "C" if kind == "python" else "D",
            "kind": kind,
            **({"packages": packages} if kind == "python" else {"program": Path(argv[0]).name}),
            "source": {k: v for k, v in (fields.get("source") or {}).items() if k in ("name", "repo", "ref", "license", "weights_license") and v},
            "io": fields.get("io") or {},
            "verify": {"params": (fields.get("verify") or {}).get("params") or {}, "expect_outputs": (fields.get("verify") or {}).get("expect_outputs") or []},
            "platforms": platforms,
            "status": "draft" if changed else old_meta.get("status", "draft"),
            # Written through recipe_save on this machine (imported files say otherwise or nothing).
            "origin": "local",
            "updated": _today(),
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        failures = [] if changed else _split_failures(previous["failures"] if previous else "")
        path.write_text(
            render(meta, setup=str(fields.get("setup") or ""), code=code, argv=argv, verify=str(fields.get("verify_text") or ""), notes=str(fields.get("notes") or ""), failures=failures),
            encoding="utf-8",
        )
        return self.get(recipe_id)

    def set_status(self, recipe_id: str, status: str, log: str = "") -> dict:
        """Record a verification result for this platform (and a failure log when broken)."""
        if status not in ("verified", "broken"):
            raise RuntimeErrorWithHint('status must be "verified" or "broken"')
        recipe = self.get(recipe_id)
        meta = recipe["meta"]
        platforms = dict(meta.get("platforms") or {})
        platforms[self.platform] = {**(platforms.get(self.platform) or {}), "status": status, "tested": _today(), "version": meta.get("version")}
        meta["platforms"] = platforms
        meta["status"] = status
        failures = _split_failures(recipe["failures"])
        if status == "broken":
            tail = "\n".join(log.strip().splitlines()[-20:])
            failures.append(f"### {_today()} · {self.platform} · v{meta.get('version')}\n\n```\n{tail.replace('```', "'''")}\n```")
        self._path(recipe_id).write_text(
            render(meta, setup=recipe["setup"], code=recipe["code"], argv=recipe["argv"], verify=recipe["verify"], notes=recipe["notes"], failures=failures),
            encoding="utf-8",
        )
        return self.get(recipe_id)


def _split_failures(text: str) -> list[str]:
    return [f"### {chunk.strip()}" for chunk in re.split(r"^### ", text, flags=re.M) if chunk.strip()]
