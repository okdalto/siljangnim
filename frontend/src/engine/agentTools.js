/**
 * Tool definitions for the siljangnim agent — ported from tools.py.
 * Removed: run_python, run_command (browser-incompatible).
 */

const TOOLS = [
  {
    name: "read_file",
    description:
      "Unified file reader. Reads workspace files (scene.json, workspace_state.json, " +
      "panels.json, ui_config.json, debug_logs.json), uploaded files (uploads/xxx). " +
      "For JSON workspace files, use 'section' to read a specific dot-path " +
      "(e.g. 'script.render', 'uniforms.u_speed').",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path. Examples: 'scene.json', 'workspace_state.json', 'uploads/model.obj'.",
        },
        section: {
          type: "string",
          description:
            "JSON dot-path. ONLY works for workspace JSON files. " +
            "e.g. 'script.render', 'uniforms.u_speed'.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Unified file writer. Writes to workspace files (scene.json, workspace_state.json, " +
      "panels.json, ui_config.json, debug_logs.json) and .workspace/ directory. " +
      "Use 'content' for full file replacement or 'edits' for partial modifications. " +
      "scene.json writes are validated and broadcast. " +
      "IMPORTANT: Workspace JSON files support ONLY dot-path edits. " +
      "Text files (.workspace/*) support ONLY text search-replace edits. " +
      "For scene.json: prefer write_scene for full creation/replacement (easier, no escaping). " +
      "Use this tool with edits for targeted modifications to specific sections (e.g., changing just the render function). " +
      "NEVER use write_file(path='scene.json', content=...) for full replacement — use write_scene instead.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path. Examples: 'scene.json', '.workspace/notes.txt'.",
        },
        content: {
          type: "string",
          description: "Complete file content for full replacement.",
        },
        edits: {
          type: "string",
          description:
            'JSON array of edit objects. ' +
            'For workspace JSON files: [{\"path\": \"script.render\", \"value\": \"...\", \"op\": \"set\"}]. ' +
            'For .workspace/* text files: [{\"old_text\": \"...\", \"new_text\": \"...\"}].',
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_uploaded_files",
    description: "List all files uploaded by the user. Returns filenames and metadata.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_files",
    description:
      "List workspace file contents. " +
      "Useful for exploring what files exist in the current project.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional prefix filter. Defaults to listing all files.",
        },
      },
    },
  },
  {
    name: "search_code",
    description:
      "Search for a string or regex pattern across all workspace files " +
      "(scene.json script sections, ui_config.json, .workspace/* text files, etc.). " +
      "Returns matching lines with file paths and line numbers. " +
      "Useful for finding where a variable, uniform, function, or string is used.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search string or regex pattern. Examples: 'u_time', 'getUniformLocation', 'createBuffer'.",
        },
        case_sensitive: {
          type: "boolean",
          description: "Case-sensitive search (default false).",
        },
        max_results: {
          type: "number",
          description: "Maximum number of matches to return (default 50, max 200).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "open_panel",
    description:
      "Open a panel as a draggable node in the UI. " +
      "Use template='controls' with config.controls array to render native " +
      "React controls (sliders, color pickers, toggles, etc.). " +
      "Use 'html' for custom HTML panels or 'url' for external URL panels.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier for this panel.",
        },
        title: {
          type: "string",
          description: "Title shown in the panel header.",
        },
        html: {
          type: "string",
          description: "Complete HTML document to render in the panel iframe.",
        },
        url: {
          type: "string",
          description: "External URL to load in the panel iframe (alternative to html).",
        },
        template: {
          type: "string",
          description: "'controls' for native React controls.",
        },
        config: {
          type: "object",
          description: "Configuration object. For template='controls', must contain a 'controls' array.",
        },
        width: {
          type: "number",
          description: "Initial width in pixels (default 320).",
        },
        height: {
          type: "number",
          description: "Initial height in pixels (default 300).",
        },
      },
      required: ["id", "title"],
    },
  },
  {
    name: "close_panel",
    description: "Close a previously opened custom panel by its ID.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the panel to close.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "start_recording",
    description:
      "Start recording the WebGL canvas to a WebM video file. " +
      "If duration is specified, recording stops automatically. " +
      "By default, the timeline resets to the beginning before recording starts.",
    input_schema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Optional duration in seconds.",
        },
        fps: {
          type: "number",
          description: "Frames per second (default 30).",
        },
        resetTimeline: {
          type: "boolean",
          description: "Reset timeline to the beginning before recording (default true).",
        },
      },
    },
  },
  {
    name: "stop_recording",
    description: "Stop an in-progress canvas recording.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_browser_errors",
    description:
      "Wait ~2 seconds for the browser to render and report any runtime errors, " +
      "then return them. Call this AFTER writing scene.json to verify the scene runs " +
      "without errors.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "write_scene",
    description:
      "Create or fully replace scene.json. Pass raw JS code directly as " +
      "separate parameters — NO JSON escaping needed. " +
      "USE THIS for: creating new scenes, full rewrites, or when changing multiple sections at once. " +
      "For targeted modifications to a single section, prefer write_file with dot-path edits instead.",
    input_schema: {
      type: "object",
      properties: {
        setup: { type: "string", description: "JS code for script.setup (runs once on load)." },
        render: { type: "string", description: "JS code for script.render (runs every frame). REQUIRED." },
        cleanup: { type: "string", description: "JS code for script.cleanup (runs on dispose)." },
        uniforms: { type: "object", description: 'Uniform definitions, e.g. {"u_speed": {"type": "float", "value": 1.0}}' },
        clearColor: { type: "array", items: { type: "number" }, description: "[r,g,b,a] clear color (0-1). Default: [0,0,0,1]" },
        backendTarget: { type: "string", enum: ["auto", "webgl", "webgpu"], description: 'Set to "webgpu" when using WebGPU/compute shaders. Default: "auto" (WebGL2).' },
      },
      required: ["render"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user a clarifying question when their request is ambiguous. " +
      "Provide 2-4 options. The agent will pause until the user responds.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user.",
        },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short option name" },
              description: { type: "string", description: "What this option means" },
            },
            required: ["label", "description"],
          },
          description: "2-4 options for the user to choose from.",
        },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "set_timeline",
    description:
      "Set timeline properties: duration (seconds) and/or loop (true/false). " +
      "Use this to match timeline duration to video length or adjust playback behavior.",
    input_schema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Timeline duration in seconds.",
        },
        loop: {
          type: "boolean",
          description: "Whether the timeline loops.",
        },
      },
    },
  },
  {
    name: "run_preprocess",
    description:
      "Run a preprocessing script in the engine context BEFORE writing the scene. " +
      "Use this for heavy operations like analyzing video duration, pre-computing detection caches, " +
      "reading file contents, etc. The script has access to ctx.uploads (blob URLs), " +
      "ctx.gl, ctx.canvas, ctx.utils, and ctx.state. The script must RETURN a value — " +
      "the returned value is sent back to you as JSON. " +
      "IMPORTANT: Data stored in ctx.state PERSISTS into the next scene's ctx.state — " +
      "use this to pre-compute heavy data that setup/render can access directly via s.key " +
      "(where s = ctx.state).",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript code to execute. Must return a value. " +
            "Example: 'const v = document.createElement(\"video\"); v.src = ctx.uploads[\"clip.mp4\"]; " +
            "await new Promise(r => { v.onloadedmetadata = r; }); " +
            "return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };'",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a web page or API endpoint and return its content as text. " +
      "Use this to read documentation, GitHub repos, API responses, or any public URL. " +
      "HTML pages are converted to readable text. JSON responses are returned as-is.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch (must be a full URL starting with http:// or https://).",
        },
        max_length: {
          type: "number",
          description: "Maximum number of characters to return (default 50000). Truncated if longer.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "delete_asset",
    description:
      "Delete an uploaded asset from the workspace by filename. " +
      "Use list_uploaded_files first to see available assets.",
    input_schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The filename of the asset to delete (e.g. 'texture.png').",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "unzip_asset",
    description:
      "Extract a ZIP file from uploads and save its contents as individual upload files. " +
      "Returns a list of extracted filenames. Use list_uploaded_files to see the ZIP file first.",
    input_schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The filename of the ZIP archive in uploads (e.g. 'models.zip').",
        },
        prefix: {
          type: "string",
          description: "Optional prefix folder for extracted files (e.g. 'models/'). Default: no prefix.",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "capture_viewport",
    description:
      "Capture a screenshot of the current viewport canvas and return it as an image. " +
      "Use this to visually inspect what is currently rendered — check colors, layout, " +
      "artifacts, or verify that your scene looks correct. " +
      "The image is returned as a JPEG snapshot of the current frame.",
    input_schema: {
      type: "object",
      properties: {
        width: {
          type: "number",
          description: "Capture width in pixels (default: current canvas width, max 1024). Downscaled if larger.",
        },
        height: {
          type: "number",
          description: "Capture height in pixels (default: current canvas height, max 1024). Downscaled if larger.",
        },
      },
    },
  },
  {
    name: "debug_with_subagent",
    description:
      "Spawn a debug sub-agent to analyze complex errors. The sub-agent has its own " +
      "conversation context and can read files, search code, and check browser errors. " +
      "It returns a detailed diagnosis with root cause, location, and suggested fix. " +
      "Use this when you encounter errors that are hard to diagnose from the error " +
      "message alone, or when multiple interacting issues make debugging complex. " +
      "Do NOT use for simple, obvious errors — just fix those directly.",
    input_schema: {
      type: "object",
      properties: {
        error_context: {
          type: "string",
          description:
            "Description of the problem for the debug agent. Include: " +
            "the error message(s), what you were trying to do, and any " +
            "relevant context. The more detail, the better the diagnosis.",
        },
      },
      required: ["error_context"],
    },
  },
];

export default TOOLS;
