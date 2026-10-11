from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from siljangnim_hub.app import create_app
from siljangnim_hub.recipes import Recipes, parse
from siljangnim_hub.runtime import Runtime, RuntimeErrorWithHint

TOKEN = "t"
PORT = 47003
AUTH = {"Authorization": f"Bearer {TOKEN}"}

FIELDS = {
    "title": "Torus knot mesh (trimesh)",
    "capability": "mesh-generate torus-knot",
    "kind": "python",
    "packages": ["trimesh==4.5.3", "numpy"],
    "code": "import json, pathlib\nparams = json.loads(pathlib.Path('in/params.json').read_text())\npathlib.Path('out/knot.obj').write_text('o knot')\n",
    "source": {"name": "trimesh", "repo": "https://github.com/mikedh/trimesh", "license": "MIT", "ignored": "x"},
    "io": {"outputs": [{"name": "knot.obj", "media": "model"}]},
    "verify": {"params": {"p": 2, "q": 3}, "expect_outputs": ["knot.obj"]},
    "notes": "fix_normals needs scipy.",
}


@pytest.fixture
def recipes(tmp_path: Path) -> Recipes:
    return Recipes(tmp_path / "recipes", "mac-arm64")


def test_save_writes_a_readable_markdown_recipe(recipes: Recipes):
    recipe = recipes.save({**FIELDS, "id": "trimesh.torus-knot"})
    text = recipe["text"]
    assert text.startswith("---\nid: trimesh.torus-knot\nversion: 1\n")
    assert "## Run" in text and "```python" in text and "## Notes\n\nfix_normals needs scipy." in text
    assert recipe["summary"]["status_here"] == "draft"
    assert recipe["summary"]["origin"] == "local"
    assert recipe["meta"]["source"] == {"name": "trimesh", "repo": "https://github.com/mikedh/trimesh", "license": "MIT"}
    assert recipe["meta"]["packages"] == ["numpy", "trimesh==4.5.3"]
    # Parsing gives back exactly what was stored.
    assert parse(text)["code"] == FIELDS["code"].rstrip()


def test_versions_and_status_follow_the_code(recipes: Recipes):
    recipes.save({**FIELDS, "id": "trimesh.torus-knot"})
    verified = recipes.set_status("trimesh.torus-knot", "verified")
    assert verified["summary"]["status_here"] == "verified"
    assert verified["summary"]["tested_here"]
    # Same code again (e.g. new notes): still version 1 and verified.
    same = recipes.save({**FIELDS, "id": "trimesh.torus-knot", "notes": "more notes"})
    assert (same["meta"]["version"], same["summary"]["status_here"]) == (1, "verified")
    # New code: version 2, back to draft until verified again.
    changed = recipes.save({**FIELDS, "id": "trimesh.torus-knot", "code": FIELDS["code"] + "print('v2')\n"})
    assert (changed["meta"]["version"], changed["summary"]["status_here"]) == (2, "draft")
    broken = recipes.set_status("trimesh.torus-knot", "broken", "Traceback\nValueError: bad")
    assert "## Failures" in broken["text"] and "ValueError: bad" in broken["text"]


def test_search_ranks_verified_first_and_matches_words(recipes: Recipes):
    recipes.save({**FIELDS, "id": "a.knot", "capability": "mesh-generate"})
    recipes.save({**FIELDS, "id": "b.knot", "capability": "mesh-generate"})
    recipes.set_status("b.knot", "verified")
    recipes.save({**FIELDS, "id": "c.audio", "title": "Beat detection", "capability": "audio-beats"})
    assert [r["id"] for r in recipes.search("mesh")] == ["b.knot", "a.knot"]
    assert [r["id"] for r in recipes.search("BEAT audio")] == ["c.audio"]
    assert len(recipes.search("")) == 3


def test_command_recipes_and_validation(recipes: Recipes):
    cmd = recipes.save({"id": "ffmpeg.frames", "title": "Video to frames", "capability": "video-frames", "kind": "command", "argv": ["ffmpeg", "-i", "in/clip.mp4", "out/f_%03d.png"]})
    assert cmd["argv"] == ["ffmpeg", "-i", "in/clip.mp4", "out/f_%03d.png"]
    assert cmd["meta"]["program"] == "ffmpeg" and cmd["meta"]["tier"] == "D"
    for bad in [{"id": "Bad Id"}, {"id": "x.y", "packages": ["git+https://x"]}, {"id": "x.y", "code": "```"}, {"id": "x.y", "title": ""}]:
        with pytest.raises(RuntimeErrorWithHint):
            recipes.save({**FIELDS, **bad})
    with pytest.raises(RuntimeErrorWithHint):
        recipes.get("../etc")


def test_hand_written_files_count_as_imported(recipes: Recipes):
    (recipes.root / "someone.else").mkdir(parents=True)
    (recipes.root / "someone.else" / "recipe.md").write_text(
        "---\nid: someone.else\nversion: 4\ntitle: Shared\ncapability: share\nkind: python\nplatforms:\n  mac-arm64: {status: verified}\n---\n\n## Run\n\n```python\nprint(1)\n```\n"
    )
    summary = recipes.search("share")[0]
    assert summary["origin"] == "imported"
    assert summary["status_here"] == "verified"


def test_starting_leaves_no_folder_behind(tmp_path: Path):
    recipes = Recipes(tmp_path / "nowhere", "mac-arm64")
    assert recipes.search("") == []
    assert not (tmp_path / "nowhere").exists()


def test_recipe_endpoints(tmp_path: Path):
    app = create_app(token=TOKEN, port=PORT, runtime=Runtime(tmp_path / "rt", "uv"), recipes=Recipes(tmp_path / "r", "linux-x64"))
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as c:
        saved = c.put("/recipes/trimesh.torus-knot", json=FIELDS, headers=AUTH)
        assert saved.status_code == 200, saved.text
        assert c.post("/recipes/trimesh.torus-knot/status", json={"status": "verified"}, headers=AUTH).json()["summary"]["status_here"] == "verified"
        found = c.get("/recipes?q=torus", headers=AUTH).json()
        assert found["platform"] == "linux-x64" and [r["id"] for r in found["recipes"]] == ["trimesh.torus-knot"]
        recipe = c.get("/recipes/trimesh.torus-knot", headers=AUTH).json()
        assert recipe["meta"]["verify"]["params"] == {"p": 2, "q": 3}
        assert c.get("/recipes/nope", headers=AUTH).status_code == 400
        assert c.put("/recipes/x", json=FIELDS, headers=AUTH).status_code == 400
