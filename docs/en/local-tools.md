# Running tools on your machine

[한국어](../local-tools.md)

Scenes run in the browser, but for work the browser isn't good at, the agent runs tools directly on your computer:
mesh processing (trimesh), audio analysis (librosa), plotter paths (vpype), video conversion (ffmpeg), ML models and
the like. This only works in the desktop app or when connected over MCP — not in the web version.

## What it runs

- **Python packages** — it installs the packages it needs and runs the code the agent wrote.
- **Installed programs** — it uses programs such as ffmpeg, Blender, OpenSCAD, ImageMagick, Inkscape, vpype and potrace
  if they're already installed.

Output files come into the project's **Assets**, and the scene uses them. You can watch and stop long-running jobs in
the **Jobs** tab.

## It asks first

An approval card appears before anything runs in these cases:

- The first time Python code runs in this project
- Installing a new package (including a new version)
- Running a new program

Choose **Allow for this project** (keep allowing it in this project), **Allow once** (just this time) or **Deny**.
With the built-in agent the card appears in the chat; with an external agent it appears in the **Activity** tab.

## Where things are installed

- Packages are installed into a separate Python environment for each set of packages. Your computer's Python and your
  other projects aren't touched.
- Location: for the desktop app, the app data folder (on macOS `~/Library/Application Support/Siljangnim/runtime`);
  for MCP, `~/.siljangnim/runtime`.
- Python is downloaded once, the first time it's needed (about 120 MB).

## Caution

This keeps files and dependencies separate; **it is not an OS sandbox.** Code that runs can reach your files just like
a program you ran yourself. That's why it asks first. If you're not sure what something does, deny it and ask the agent
what it's trying to do.

## Recipes

A method that worked once is saved as a **recipe**: a short md file that records which packages were installed, how,
and how they were called (`~/Siljangnim/recipes/<id>/recipe.md`). The next time you ask for something similar it runs
right away, and you can share it with others. See [Sharing](sharing.md#sharing-recipes).
