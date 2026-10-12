# Recipe registry

Recipes (open-source tool setups that worked, see [docs/local-tools.md](../docs/local-tools.md#레시피)) shared between
Siljangnim users. Agents find them with `recipe_search` and add them with `recipe_install`; an installed
recipe is a draft on the new machine until `recipe_verify` passes there, and it asks the person before
its code first runs.

To contribute: copy `~/Siljangnim/recipes/<id>/recipe.md` to `recipes/<id>/recipe.md`, rebuild the
index from `hub/` with `uv run python -m siljangnim_hub.registry build ../registry`, and open a pull
request. Recipes hold the glue code an agent wrote; third-party code is referenced only by package
name and version. How to contribute: [docs/sharing.md](../docs/sharing.md#레시피-나누기).
