"""Anthropic tool definitions (JSON Schema) for the siljangnim agent."""

TOOLS = [
    {
        "name": "get_current_scene",
        "description": (
            "Read the current scene.json from workspace. "
            "Returns the full scene JSON or a message if no scene exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "read_scene_section",
        "description": (
            "Read a specific section of scene.json using a dot-path. "
            "Much more efficient than get_current_scene when you only need "
            "a specific part. Examples: 'script.render', 'script.setup', "
            "'uniforms', 'uniforms.u_speed', 'clearColor'. "
            "Returns the value at that path as JSON."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Dot-separated path into scene.json (e.g. 'script.render', 'uniforms.u_speed').",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "update_scene",
        "description": (
            "Validate, save, and broadcast a COMPLETE scene JSON to all clients. "
            "Use this only when creating a new scene from scratch. "
            "For modifying existing scenes, prefer edit_scene instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scene_json": {
                    "type": "string",
                    "description": "Complete scene JSON object as a string.",
                },
            },
            "required": ["scene_json"],
        },
    },
    {
        "name": "edit_scene",
        "description": (
            "Apply targeted edits to the current scene.json without replacing the whole file. "
            "Takes an array of edits, each with a dot-path and new value. "
            "Much more efficient than update_scene for modifications. "
            "The edited scene is validated, saved, and broadcast to clients. "
            "Supports 'set' (default) and 'delete' operations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "edits": {
                    "type": "string",
                    "description": (
                        "JSON array of edit objects. Each has: "
                        "'path' (dot-separated target, e.g. 'script.render'), "
                        "'value' (new value — string, number, object, etc.), "
                        "'op' (optional: 'set' or 'delete', default 'set'). "
                        "Example: [{\"path\": \"script.render\", \"value\": \"const gl = ctx.gl;...\"}, "
                        "{\"path\": \"uniforms.u_new\", \"value\": {\"type\": \"float\", \"value\": 1.0}}]"
                    ),
                },
            },
            "required": ["edits"],
        },
    },
    {
        "name": "get_workspace_state",
        "description": (
            "Read the current workspace state including keyframe animations, "
            "timeline duration, and loop setting. Returns the workspace_state.json "
            "contents, or defaults if no state exists. Use this to check existing "
            "keyframe animations before modifying scenes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_workspace_state",
        "description": (
            "Update the workspace state (keyframes, duration, loop). "
            "The state is saved to workspace_state.json and broadcast to all "
            "connected clients, immediately updating the timeline and keyframe "
            "editor in the UI. You can add/remove/modify keyframe tracks, "
            "change the timeline duration, or toggle looping."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_state": {
                    "type": "string",
                    "description": (
                        "Complete workspace state JSON string with 'version', "
                        "'keyframes', 'duration', and 'loop' fields."
                    ),
                },
            },
            "required": ["workspace_state"],
        },
    },
    {
        "name": "read_uploaded_file",
        "description": (
            "Read an uploaded file from the uploads directory. "
            "For text files (.obj, .mtl, .glsl, .json, .txt, .csv, etc.), returns the file contents as text. "
            "For binary files (images, etc.), returns metadata only. "
            "Use list_uploaded_files first to see available files."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the uploaded file to read.",
                },
            },
            "required": ["filename"],
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
        "name": "read_file",
        "description": (
            "Read a project file by relative path. Returns file contents for text files, "
            "or metadata for binary files. Supports line-based pagination with offset/limit "
            "— use these to read large files in chunks instead of all at once. "
            "Returns total line count so you know if there's more to read."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from project root to the file to read.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Starting line number (1-based). Default: 1.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of lines to return. Default: all lines (up to 50KB).",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write a file to the .workspace/ directory. Only paths under .workspace/ "
            "are writable. Parent directories are created automatically."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path under .workspace/ (e.g. '.workspace/notes.txt').",
                },
                "content": {
                    "type": "string",
                    "description": "File content to write.",
                },
            },
            "required": ["path", "content"],
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
            "Call this AFTER update_scene or edit_scene to verify the scene runs "
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
