"""
PromptGL 3-agent pipeline: Art Director -> Tech Agent -> TA Agent.

Each agent calls Anthropic Claude directly via the async SDK.
"""

import json
import re
from typing import Callable, Awaitable

import anthropic

import workspace

# Type alias for the real-time log callback
LogCallback = Callable[[str, str, str], Awaitable[None]]

MODEL = "claude-sonnet-4-20250514"

# ---------------------------------------------------------------------------
# Helper: extract JSON from a Claude response (handles markdown fences)
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict:
    """Extract the first JSON object from text, stripping optional markdown fences."""
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code fences
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1).strip())

    # Try finding first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return json.loads(text[start : end + 1])

    raise json.JSONDecodeError("No JSON object found in response", text, 0)


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

ART_DIRECTOR_SYSTEM = """\
You are the Art Director agent for PromptGL, a visual shader creation tool.

Your job: analyze the user's creative request and produce a structured brief.

You MUST respond with ONLY a JSON object (no markdown, no explanation):
{
  "intent": "create" | "modify" | "explain",
  "description": "1-2 sentence plain-English description of the desired visual",
  "style_hints": ["keyword1", "keyword2"],
  "pipeline_mode": "mesh" | "fullscreen",
  "complexity": "simple" | "medium" | "complex"
}

Guidelines:
- "mesh" mode: 3D object with vertex+fragment shaders (default for objects, spheres, shapes)
- "fullscreen" mode: full-screen quad fragment shader (for backgrounds, patterns, post-processing)
- Keep style_hints to 3-5 keywords that capture the visual aesthetic
- For simple color changes or basic shapes, use "simple" complexity
- For animated effects or multiple visual elements, use "medium"
- For particle systems, complex math, or multi-pass effects, use "complex"
"""

TECH_AGENT_SYSTEM = """\
You are the Tech Agent for PromptGL. You write GLSL shaders for Three.js ShaderMaterial.

Input: a creative brief (JSON from the Art Director).
Output: ONLY a JSON object (no markdown, no explanation):
{
  "vertex_shader": "...GLSL code...",
  "fragment_shader": "...GLSL code...",
  "pipeline_mode": "mesh" | "fullscreen",
  "uniforms": {
    "uniform_name": {"type": "float", "value": 0.0},
    ...
  }
}

Three.js built-in uniforms (do NOT declare these):
- projectionMatrix, modelViewMatrix, modelMatrix, viewMatrix, normalMatrix
- cameraPosition

Three.js built-in attributes (do NOT declare these):
- position, normal, uv

Rules:
- Always include `uniform float u_time;` for animation
- Use `varying` to pass data from vertex to fragment shader
- Use GLSL ES 1.0 syntax (no #version directive, no `in`/`out`)
- Fragment shader must write to `gl_FragColor`
- Vertex shader must write to `gl_Position`
- Keep shaders under 100 lines each
- All custom uniforms must be listed in the "uniforms" object
- The u_time uniform is auto-incremented by the engine, do not include it in uniforms
"""

TA_AGENT_SYSTEM = """\
You are the TA (Technical Artist) Agent for PromptGL. You generate UI control definitions.

Input: shader code and uniforms from the Tech Agent.
Output: ONLY a JSON object (no markdown, no explanation):
{
  "controls": [
    {
      "type": "slider",
      "label": "Human-readable label",
      "uniform": "u_uniformName",
      "min": 0.0,
      "max": 1.0,
      "step": 0.01,
      "default": 0.5
    }
  ]
}

Control types: "slider", "color", "toggle"
- "slider": needs min, max, step, default
- "color": needs default (hex string like "#ff0000")
- "toggle": needs default (boolean)

Rules:
- Do NOT create a control for u_time (it's auto-driven)
- Create intuitive labels (e.g. "Glow Intensity" not "u_glow")
- Set sensible min/max ranges based on how the uniform is used in the shader
- If there are no custom uniforms (only u_time), return {"controls": []}
"""


# ---------------------------------------------------------------------------
# Individual agent calls
# ---------------------------------------------------------------------------

async def _call_agent(
    client: anthropic.AsyncAnthropic,
    system: str,
    user_content: str,
    agent_name: str,
    log: LogCallback,
    retries: int = 2,
) -> dict:
    """Call a single agent and parse its JSON response, with retries."""
    await log(agent_name, "Thinking...", "thinking")

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": user_content}],
            )
            raw = response.content[0].text
            result = _extract_json(raw)
            await log(agent_name, "Done", "result")
            return result
        except json.JSONDecodeError as e:
            last_error = e
            if attempt < retries:
                await log(agent_name, f"JSON parse failed, retrying ({attempt + 1}/{retries})...", "error")
                continue
        except anthropic.APIError as e:
            last_error = e
            await log(agent_name, f"API error: {e}", "error")
            raise

    await log(agent_name, f"Failed after {retries + 1} attempts: {last_error}", "error")
    raise last_error


async def art_director(
    client: anthropic.AsyncAnthropic, prompt: str, log: LogCallback
) -> dict:
    """Art Director: classify intent and produce creative brief."""
    return await _call_agent(client, ART_DIRECTOR_SYSTEM, prompt, "Art Director", log)


async def tech_agent(
    client: anthropic.AsyncAnthropic, brief: dict, log: LogCallback
) -> dict:
    """Tech Agent: write GLSL shaders from the brief."""
    return await _call_agent(
        client, TECH_AGENT_SYSTEM, json.dumps(brief), "Tech Agent", log
    )


async def ta_agent(
    client: anthropic.AsyncAnthropic, tech_output: dict, log: LogCallback
) -> dict:
    """TA Agent: generate UI controls from shader code."""
    return await _call_agent(
        client, TA_AGENT_SYSTEM, json.dumps(tech_output), "TA Agent", log
    )


# ---------------------------------------------------------------------------
# Pipeline orchestrator
# ---------------------------------------------------------------------------

async def run_pipeline(
    api_key: str,
    user_prompt: str,
    log: LogCallback,
) -> dict:
    """
    Run the full 3-agent pipeline: Art Director -> Tech Agent -> TA Agent.

    Returns dict with keys: brief, shaders, ui_config, pipeline, chat_text.
    Writes generated files to .workspace/generated/ via workspace module.
    """
    client = anthropic.AsyncAnthropic(api_key=api_key)

    await log("System", f"Starting pipeline for: \"{user_prompt}\"", "info")

    # 1) Art Director
    brief = await art_director(client, user_prompt, log)
    await log("Art Director", json.dumps(brief, indent=2), "result")

    # 2) Tech Agent
    tech_output = await tech_agent(client, brief, log)
    await log("Tech Agent", "Shaders generated", "result")

    # 3) TA Agent
    ui_config = await ta_agent(client, tech_output, log)
    await log("TA Agent", json.dumps(ui_config, indent=2), "result")

    # Build pipeline config
    pipeline = {
        "mode": tech_output.get("pipeline_mode", brief.get("pipeline_mode", "mesh")),
        "shader": {"vertex": "shader.vert", "fragment": "shader.frag"},
        "uniforms": tech_output.get("uniforms", {}),
    }
    # Ensure u_time exists
    pipeline["uniforms"].setdefault("u_time", {"type": "float", "value": 0.0})

    # Write to workspace
    workspace.write_file("shader.vert", tech_output.get("vertex_shader", ""))
    workspace.write_file("shader.frag", tech_output.get("fragment_shader", ""))
    workspace.write_json("pipeline.json", pipeline)
    workspace.write_json("ui_config.json", ui_config)

    await log("System", "Pipeline complete — files written", "info")

    # Build a friendly chat summary
    chat_text = (
        f"Created a {brief.get('complexity', 'medium')}-complexity "
        f"{brief.get('pipeline_mode', 'mesh')} shader: {brief.get('description', user_prompt)}"
    )

    return {
        "brief": brief,
        "shaders": {
            "vertex": tech_output.get("vertex_shader", ""),
            "fragment": tech_output.get("fragment_shader", ""),
        },
        "ui_config": ui_config,
        "pipeline": pipeline,
        "chat_text": chat_text,
    }
