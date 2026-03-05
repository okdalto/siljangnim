"""Anthropic tool definitions (JSON Schema) for the siljangnim agent."""

import copy

# Tools excluded from the tool list for custom providers (small models).
_CUSTOM_EXCLUDED_TOOLS = {"check_browser_errors"}

# Slim tool schemas for custom providers — shorter descriptions to save tokens.
_CUSTOM_SLIM: dict[str, dict] = {
    "read_file": {
        "description": "Read a file. Workspace JSON files support 'section' for dot-path access.",
        "properties": {
            "path": {"type": "string", "description": "File path (e.g. 'scene.json', 'uploads/img.png')."},
            "section": {"type": "string", "description": "JSON dot-path (e.g. 'script.render'). Workspace JSON only."},
            "offset": {"type": "integer", "description": "Start line (1-based). Source files only."},
            "limit": {"type": "integer", "description": "Max lines. Source files only."},
        },
    },
    "write_file": {
        "description": (
            "Write a file. Use 'content' for full replacement or 'edits' for partial changes. "
            "JSON files: dot-path edits [{\"path\":\"key\",\"value\":\"...\"}]. "
            "Text files: search-replace [{\"old_text\":\"...\",\"new_text\":\"...\"}]."
        ),
        "properties": {
            "path": {"type": "string", "description": "File path (e.g. 'scene.json')."},
            "content": {"type": "string", "description": "Full file content for replacement."},
            "edits": {"type": "string", "description": "JSON array of edit objects."},
        },
    },
    "list_uploaded_files": {
        "description": "List uploaded files.",
    },
    "list_files": {
        "description": "List directory contents.",
        "properties": {
            "path": {"type": "string", "description": "Relative path. Defaults to '.'."},
        },
    },
    "open_panel": {
        "description": "Open a UI panel. Use template='controls' with config.controls for sliders/pickers.",
        "properties": {
            "id": {"type": "string", "description": "Panel ID."},
            "title": {"type": "string", "description": "Panel title."},
            "html": {"type": "string", "description": "HTML content for iframe."},
            "template": {"type": "string", "description": "'controls', 'orbit_camera', or 'pad2d'."},
            "config": {"type": "object", "description": "Config for template."},
            "width": {"type": "number", "description": "Width in px."},
            "height": {"type": "number", "description": "Height in px."},
        },
    },
    "close_panel": {
        "description": "Close a panel by ID.",
    },
    "start_recording": {
        "description": "Start recording canvas to WebM.",
        "properties": {
            "duration": {"type": "number", "description": "Auto-stop after N seconds."},
            "fps": {"type": "number", "description": "FPS (default 30)."},
        },
    },
    "stop_recording": {
        "description": "Stop recording.",
    },
    "run_python": {
        "description": "Run Python code. Working dir: .workspace/projects/<project>/. Timeout: 30s.",
        "properties": {
            "code": {"type": "string", "description": "Python code."},
        },
    },
    "run_command": {
        "description": "Run shell command (pip, ffmpeg, ffprobe, convert, magick only). Timeout: 60s.",
        "properties": {
            "command": {"type": "string", "description": "Command to run."},
        },
    },
    "ask_user": {
        "description": "Ask user a question with 2-4 options.",
        "properties": {
            "question": {"type": "string", "description": "Question text."},
            "options": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "description": {"type": "string"},
                    },
                    "required": ["label", "description"],
                },
                "description": "Options list.",
            },
        },
    },
    "write_scene": {
        "description": "Create/replace scene.json. Pass raw JS code — no escaping needed.",
        "properties": {
            "setup": {"type": "string", "description": "JS for script.setup."},
            "render": {"type": "string", "description": "JS for script.render. REQUIRED."},
            "cleanup": {"type": "string", "description": "JS for script.cleanup."},
            "uniforms": {"type": "object", "description": "Uniform defs."},
            "clearColor": {"type": "array", "description": "[r,g,b,a]."},
        },
    },
}


def _make_slim_tool(tool: dict) -> dict:
    """Create a slim copy of a tool definition using _CUSTOM_SLIM overrides."""
    name = tool["name"]
    slim = _CUSTOM_SLIM.get(name)
    if not slim:
        return tool
    t = copy.deepcopy(tool)
    t["description"] = slim["description"]
    if "properties" in slim:
        t["input_schema"]["properties"] = slim["properties"]
    return t


def get_tools(provider: str = "anthropic") -> list[dict]:
    """Return tool definitions, optionally filtered/slimmed by provider."""
    if provider == "custom":
        return [
            _make_slim_tool(t)
            for t in TOOLS
            if t["name"] not in _CUSTOM_EXCLUDED_TOOLS
        ]
    return TOOLS


TOOLS = [
    {
        "name": "read_file",
        "description": (
            "Unified file reader. Reads workspace files (scene.json, workspace_state.json, "
            "panels.json, ui_config.json, debug_logs.json), uploaded files (uploads/xxx), "
            "and project source files. For JSON workspace files, use 'section' to read a "
            "specific dot-path (e.g. 'script.render', 'uniforms.u_speed'). "
            "For large text files, use offset/limit for pagination. "
            "Upload files include processed derivative metadata."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "File path. Examples: 'scene.json', 'workspace_state.json', "
                        "'uploads/model.obj', 'frontend/src/App.jsx'."
                    ),
                },
                "section": {
                    "type": "string",
                    "description": (
                        "JSON dot-path. ONLY works for workspace JSON files "
                        "(scene.json, workspace_state.json, etc.). "
                        "Ignored for upload files and project source files. "
                        "e.g. 'script.render', 'uniforms.u_speed', 'keyframes'."
                    ),
                },
                "offset": {
                    "type": "integer",
                    "description": (
                        "Starting line number (1-based). ONLY works for project source files. "
                        "Ignored for workspace JSON and upload files."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": (
                        "Max number of lines to return. ONLY works for project source files. "
                        "Ignored for workspace JSON and upload files."
                    ),
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Unified file writer. Writes to workspace files (scene.json, workspace_state.json, "
            "panels.json, ui_config.json, debug_logs.json), .workspace/ directory, "
            "and engine source files (frontend/src/engine/*, backend/agents/*). "
            "Use 'content' for full file replacement or 'edits' for partial modifications. "
            "scene.json writes are validated and broadcast to clients. "
            "workspace_state.json writes are broadcast to clients. "
            "IMPORTANT: Workspace JSON files support ONLY dot-path edits. "
            "Text files (.workspace/*, source files) support ONLY text search-replace edits. "
            "Edits require the target file to already exist (use content to create new files)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "File path. Examples: 'scene.json', 'workspace_state.json', "
                        "'.workspace/notes.txt'."
                    ),
                },
                "content": {
                    "type": "string",
                    "description": (
                        "Complete file content for full replacement. "
                        "For JSON files, provide a JSON string."
                    ),
                },
                "edits": {
                    "type": "string",
                    "description": (
                        "JSON array of edit objects for partial modification. "
                        "For workspace JSON files (scene.json, workspace_state.json, etc.): "
                        "use dot-path edits ONLY — [{\"path\": \"script.render\", \"value\": \"...\", \"op\": \"set\"}]. "
                        "op can be 'set' (default) or 'delete'. "
                        "Text search-replace (old_text/new_text) is NOT supported for JSON files. "
                        "For .workspace/* text files: use text search-replace ONLY — "
                        "[{\"old_text\": \"function foo()\", \"new_text\": \"function bar()\"}]."
                    ),
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_uploaded_files",
        "description": "List all files uploaded by the user. Returns filenames and metadata.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "list_files",
        "description": (
            "List directory contents relative to the project root. "
            "Useful for exploring the project structure (source code, etc.). "
            "Directories show a trailing /, files show their size."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from project root. Defaults to '.' (root).",
                },
            },
        },
    },
    {
        "name": "open_panel",
        "description": (
            "Open a panel as a draggable node in the UI. "
            "Use template='controls' with config.controls array to render native "
            "React controls (sliders, color pickers, toggles, etc.) that integrate "
            "with undo/redo and keyframe editing — this is the preferred method for "
            "parameter UI. You can mix native controls with {\"type\":\"html\"} blocks "
            "in the same controls array for hybrid panels (native + custom HTML). "
            "All iframes get app theme CSS auto-injected. "
            "Use raw html or other templates (orbit_camera, pad2d) only "
            "for fully custom interactive panels."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique identifier for this panel (e.g. 'controls', 'info', 'viz').",
                },
                "title": {
                    "type": "string",
                    "description": "Title shown in the panel header.",
                },
                "html": {
                    "type": "string",
                    "description": "Complete HTML document to render in the panel iframe. Can include <style> and <script> tags. If template is provided, this is ignored.",
                },
                "template": {
                    "type": "string",
                    "description": (
                        "Panel template name. Use 'controls' for native React controls "
                        "(sliders, color pickers, toggles, etc.) — pass controls array in config.controls. "
                        "Other templates: 'orbit_camera', 'pad2d' (loaded from backend/panel_templates/{name}.html)."
                    ),
                },
                "config": {
                    "type": "object",
                    "description": (
                        "Configuration object. For template='controls', must contain a 'controls' array "
                        "(same format as ui_config controls). For other templates, injected as `const CONFIG = {...};`."
                    ),
                },
                "width": {
                    "type": "number",
                    "description": "Initial width in pixels (default 320).",
                },
                "height": {
                    "type": "number",
                    "description": "Initial height in pixels (default 300).",
                },
            },
            "required": ["id", "title"],
        },
    },
    {
        "name": "close_panel",
        "description": "Close a previously opened custom panel by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The ID of the panel to close.",
                },
            },
            "required": ["id"],
        },
    },
    {
        "name": "start_recording",
        "description": (
            "Start recording the WebGL canvas to a WebM video file. "
            "The recording runs in the browser and auto-downloads when stopped. "
            "If duration is specified, recording stops automatically after that many seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "duration": {
                    "type": "number",
                    "description": "Optional duration in seconds. Recording stops automatically after this time.",
                },
                "fps": {
                    "type": "number",
                    "description": "Frames per second for the recording (default 30).",
                },
            },
        },
    },
    {
        "name": "stop_recording",
        "description": "Stop an in-progress canvas recording. The WebM file will auto-download in the browser.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "run_python",
        "description": (
            "Execute Python code in a sandboxed subprocess. "
            "Working directory is .workspace/projects/<active_project>/, NOT the project root. "
            "Upload files are at ./uploads/. Use the read_file tool for project source files. "
            "Has access to installed packages (fonttools, numpy, Pillow, etc). "
            "Returns stdout and stderr. Timeout: 30 seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute.",
                },
            },
            "required": ["code"],
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run a whitelisted shell command. "
            "Allowed commands: pip, ffmpeg, ffprobe, convert, magick. "
            "Working directory is .workspace/projects/<active_project>/. Timeout: 60 seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (must start with an allowed command).",
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "check_browser_errors",
        "description": (
            "Wait ~2 seconds for the browser to render and report any runtime errors "
            "(WebGL shader errors, JavaScript exceptions, etc.), then return them. "
            "Call this AFTER write_file(path='scene.json', ...) to verify the scene runs "
            "without errors. If errors are found, fix them immediately."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "write_scene",
        "description": (
            "Create or fully replace scene.json. Pass raw JS code directly as "
            "separate parameters — NO JSON escaping needed. The server assembles "
            "the scene JSON automatically. Use this for new scenes or full rewrites. "
            "For partial edits to an existing scene, use write_file with dot-path edits."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "setup": {"type": "string", "description": "JS code for script.setup (runs once on load)."},
                "render": {"type": "string", "description": "JS code for script.render (runs every frame). REQUIRED."},
                "cleanup": {"type": "string", "description": "JS code for script.cleanup (runs on dispose)."},
                "uniforms": {"type": "object", "description": "Uniform definitions, e.g. {\"u_speed\": {\"type\": \"float\", \"value\": 1.0}}"},
                "clearColor": {"type": "array", "items": {"type": "number"}, "description": "[r,g,b,a] clear color (0-1). Default: [0,0,0,1]"},
            },
            "required": ["render"],
        },
    },
    {
        "name": "ask_user",
        "description": (
            "Ask the user a clarifying question when their request is ambiguous "
            "or could be interpreted in multiple ways. Provide 2-4 options. "
            "The agent will pause until the user responds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user.",
                },
                "options": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Short option name"},
                            "description": {"type": "string", "description": "What this option means"},
                        },
                        "required": ["label", "description"],
                    },
                    "description": "2-4 options for the user to choose from.",
                },
            },
            "required": ["question", "options"],
        },
    },
]
