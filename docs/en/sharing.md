# Sharing

[한국어](../sharing.md)

## Exporting a project

From the project menu (next to the project name at the top):

- **Export project (.zip)** — bundles the whole project: `project.md`, a preview image, the code (`code/`), assets and
  the recipes used.
- **Import project (project.md or .zip)…** — opens a file you received as a new project.

In the **Assets** tab you can read the scene's code and shaders directly, and the button at the bottom takes the project
out as files. In the desktop app, it writes them to a folder under `~/Siljangnim/projects/` and opens it in Finder
(Explorer on Windows). On the web, you download a zip. The files are a copy, so editing them doesn't change the project.

## project.md

`project.md` is a document about **how the project was made**, more than the code itself. The recipient's agent reads it
and rebuilds the project.

```
# Title
## Intent            What was asked for at the start
## Assets            List of assets and where each came from (added by you / made in step N)
## Pipeline          For each step: packages used (exact versions), inputs, outputs, code
## Scene             The whole scene
## Rebuilding        The order to rebuild it in
```

- Sending just the md is fine. If assets are missing, importing it tells you what's missing and how to remake it.
- If a model with a weights license was used, its terms of use are included too.
- You can also ask the agent: "export this project as project.md."

## Sharing recipes

Recipes are shared in this repository's [registry/](../../registry/). When the agent looks for a tool it needs, it
searches here too, and downloads and uses what it finds.

- A downloaded recipe asks for approval again the first time it runs on this computer. If the file has changed (the
  checksum doesn't match), it isn't installed.
- **Contributing:** copy `~/Siljangnim/recipes/<id>/recipe.md` to `registry/recipes/<id>/`, rebuild the index from
  the `hub/` folder with `python -m siljangnim_hub.registry build ../registry`, then send a PR.
  A recipe contains only the integration code. Other people's code is listed only by package name and version.

## Example links

Every example has a **Link** button. Opening the link opens that example right away (for example
`siljangnim.vercel.app/#example=oss-three`).
