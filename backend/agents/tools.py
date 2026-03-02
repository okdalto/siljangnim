"""Anthropic tool definitions (JSON Schema) for the siljangnim agent."""

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
                        "JSON dot-path for workspace JSON files. "
                        "e.g. 'script.render', 'uniforms.u_speed', 'keyframes'. "
                        "Returns only the value at that path."
                    ),
                },
                "offset": {
                    "type": "integer",
                    "description": "Starting line number (1-based). For text file pagination.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of lines to return.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Unified file writer. Writes to workspace files (scene.json, workspace_state.json, "
            "panels.json, ui_config.json, debug_logs.json) and .workspace/ directory. "
            "Use 'content' for full file replacement or 'edits' for partial modifications. "
            "scene.json writes are validated and broadcast to clients. "
            "workspace_state.json writes are broadcast to clients. "
            "Edits support both JSON dot-path operations (for JSON files) and "
            "text search-replace (for any text file)."
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
                        "JSON dot-path edits (when 'path' field present): "
                        "[{\"path\": \"script.render\", \"value\": \"...\", \"op\": \"set\"}]. "
                        "Text search-replace edits (when 'old_text' field present): "
                        "[{\"old_text\": \"function foo()\", \"new_text\": \"function bar()\"}]. "
                        "op can be 'set' (default) or 'delete'."
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
            "Working directory is the active workspace. "
            "Can read project files, but can only write to .workspace/. "
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
            "Working directory is the active workspace. Timeout: 60 seconds."
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
