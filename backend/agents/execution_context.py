"""
Execution Context Rebuild — Plan-based generation (server mode).

Mirrors the frontend executionContext.js logic for server-mode agent calls.
When the conversation grows long, the planner produces a structured plan,
and the generator runs with a fresh, minimal context.
"""

import json
import logging
from pathlib import Path

import anthropic

import workspace

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Planner configuration
# ---------------------------------------------------------------------------

PLANNER_SYSTEM = """\
You are the planning module of siljangnim, a real-time WebGL2 visual creation tool.

Your job: analyse the user's request in the context of the current workspace and produce a structured JSON execution plan. A separate generator module will execute this plan — it will have NO access to the conversation history, only your plan and a workspace snapshot.

Output ONLY a JSON object (no markdown fences):
{
  "intent": "create" | "modify" | "fix" | "explain" | "configure",
  "summary": "1-2 sentence description of what to accomplish",
  "steps": ["concise step 1", "concise step 2", ...],
  "relevant_state": {
    "needs_current_scene": true/false,
    "needs_panels": true/false,
    "needs_assets": true/false
  },
  "constraints": ["things to preserve or avoid"],
  "style_notes": "visual / artistic direction if any"
}

Guidelines:
- Focus on WHAT to do, not HOW (the generator knows the tools).
- Keep steps actionable and ordered.
- If the request modifies existing work, set needs_current_scene=true.
- If the request references uploaded assets, set needs_assets=true.
- constraints should mention things the user explicitly wants preserved.
- Be concise — every token in the plan costs context for the generator."""

PLANNER_MODEL = "claude-haiku-4-5-20251001"
PLANNER_MAX_TOKENS = 2048

# Minimum conversation length before planning kicks in
_MIN_CONVERSATION_LENGTH = 10


# ---------------------------------------------------------------------------
# Should we plan?
# ---------------------------------------------------------------------------

def should_plan(conversation_length: int, user_prompt: str) -> bool:
    """Heuristic: planning is valuable when the conversation is long."""
    if conversation_length < _MIN_CONVERSATION_LENGTH:
        return False

    trimmed = user_prompt.strip()
    if len(trimmed) < 10:
        return False

    simple = {"yes", "no", "ok", "ㅇㅇ", "ㄴㄴ", "네", "아니요", "응", "ㅇ", "ㄴ"}
    if trimmed.lower() in simple:
        return False

    return True


# ---------------------------------------------------------------------------
# Build planner messages
# ---------------------------------------------------------------------------

def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, str):
                return block
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")
    return ""


def build_planner_messages(
    user_prompt: str,
    conversation: list[dict],
    current_state: dict,
) -> list[dict]:
    """Build messages for the planner call."""
    messages = []

    # Recent conversation (condensed)
    recent = conversation[-8:]
    for msg in recent:
        role = msg.get("role")
        if role == "user":
            text = _extract_text(msg.get("content", ""))
            if text:
                messages.append({"role": "user", "content": text[:400]})
        elif role == "assistant":
            text = _extract_text(msg.get("content", ""))
            if text:
                messages.append({"role": "assistant", "content": text[:300]})

    # State summary
    parts = ["[Current workspace state]"]
    scene = current_state.get("scene_json")
    if scene and scene.get("script", {}).get("render"):
        render_len = len(scene["script"]["render"])
        parts.append(f"Scene: active (render {render_len} chars)")
        if scene.get("uniforms"):
            parts.append(f"Uniforms: {', '.join(scene['uniforms'].keys())}")
    else:
        parts.append("Scene: empty")

    assets = current_state.get("assets", [])
    if assets:
        names = [a.get("semanticName") or a.get("filename", "?") for a in assets]
        parts.append(f"Assets: {', '.join(names)}")

    panels = current_state.get("panels", {})
    if panels:
        parts.append(f"Panels: {', '.join(panels.keys())}")

    messages.append({
        "role": "user",
        "content": f"{chr(10).join(parts)}\n\n[New request]\n{user_prompt}",
    })

    return messages


# ---------------------------------------------------------------------------
# Parse plan
# ---------------------------------------------------------------------------

def parse_plan(text: str) -> dict | None:
    """Extract JSON plan from planner response."""
    import re
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        plan = json.loads(match.group(0))
        if not plan.get("intent") or not plan.get("summary") or not isinstance(plan.get("steps"), list):
            return None
        plan.setdefault("relevant_state", {})
        plan.setdefault("constraints", [])
        plan.setdefault("style_notes", "")
        return plan
    except (json.JSONDecodeError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Run planner
# ---------------------------------------------------------------------------

async def run_planner(
    user_prompt: str,
    conversation: list[dict],
    current_state: dict,
    log,
) -> dict | None:
    """Run the planner and return parsed plan, or None on failure."""
    await log("System", "Running planner for execution context rebuild", "info")

    planner_messages = build_planner_messages(user_prompt, conversation, current_state)

    try:
        client = anthropic.AsyncAnthropic()
        response = await client.messages.create(
            model=PLANNER_MODEL,
            max_tokens=PLANNER_MAX_TOKENS,
            system=PLANNER_SYSTEM,
            messages=planner_messages,
        )

        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        if not text:
            await log("System", "Planner returned empty response — falling back", "info")
            return None

        plan = parse_plan(text)
        if not plan:
            await log("System", "Failed to parse planner output — falling back", "info")
            return None

        await log("System", f"Plan: [{plan['intent']}] {plan['summary']} ({len(plan['steps'])} steps)", "info")
        return plan

    except Exception as e:
        await log("System", f"Planner error: {e} — falling back to direct execution", "info")
        return None


# ---------------------------------------------------------------------------
# Build execution context
# ---------------------------------------------------------------------------

def build_execution_context(
    plan: dict,
    current_state: dict,
    base_system_prompt: str,
) -> tuple[str, list[dict]]:
    """
    Build a fresh system prompt + messages for the generator.

    Returns (system_prompt, messages).
    """
    # Enhanced system prompt with plan
    plan_lines = [
        "\n\n## EXECUTION PLAN (APPROVED)",
        f"Intent: {plan['intent']}",
        f"Summary: {plan['summary']}",
        "",
        "Steps:",
    ]
    for i, step in enumerate(plan["steps"], 1):
        plan_lines.append(f"{i}. {step}")

    if plan["constraints"]:
        plan_lines.append("")
        plan_lines.append("Constraints:")
        for c in plan["constraints"]:
            plan_lines.append(f"- {c}")

    if plan["style_notes"]:
        plan_lines.append("")
        plan_lines.append(f"Style direction: {plan['style_notes']}")

    plan_lines.extend([
        "",
        "Execute this plan step by step. Do not deviate from the approved steps.",
        "You do NOT have access to prior conversation — all relevant context is provided below.",
    ])

    system_prompt = base_system_prompt + "\n".join(plan_lines)

    # Build user message with relevant state
    relevant = plan.get("relevant_state", {})
    context_parts = []

    if relevant.get("needs_current_scene") and current_state.get("scene_json"):
        scene_str = json.dumps(current_state["scene_json"], indent=2, ensure_ascii=False)
        if len(scene_str) > 8000:
            scene_str = scene_str[:8000] + "\n...(truncated)"
        context_parts.append(f"Current scene.json:\n```json\n{scene_str}\n```")

    if relevant.get("needs_panels") and current_state.get("panels"):
        panel_keys = list(current_state["panels"].keys())
        if panel_keys:
            context_parts.append(f"Active panels: {', '.join(panel_keys)}")

    if relevant.get("needs_assets") and current_state.get("assets"):
        asset_lines = [
            f'- "{a.get("semanticName", a.get("filename", "?"))}" ({a.get("filename")}, {a.get("category")})'
            for a in current_state["assets"]
        ]
        context_parts.append(f"Workspace assets:\n{chr(10).join(asset_lines)}")

    user_content = (
        f"{chr(10).join(context_parts)}\n\nProceed with the execution plan."
        if context_parts
        else "Proceed with the execution plan."
    )

    messages = [{"role": "user", "content": user_content}]

    return system_prompt, messages


# ---------------------------------------------------------------------------
# Get current workspace state
# ---------------------------------------------------------------------------

def get_current_state() -> dict:
    """Read current workspace state from disk for the planner."""
    ws_dir = workspace.get_workspace_dir()
    state = {"scene_json": None, "ui_config": None, "panels": {}, "assets": []}

    for key, filename in [("scene_json", "scene.json"), ("ui_config", "ui_config.json"), ("panels", "panels.json")]:
        path = ws_dir / filename
        if path.exists():
            try:
                state[key] = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass

    # Asset info from uploads directory
    uploads_dir = ws_dir / "uploads"
    if uploads_dir.is_dir():
        for f in uploads_dir.iterdir():
            if f.is_file() and not f.name.startswith("."):
                state["assets"].append({
                    "filename": f.name,
                    "semanticName": f.stem,
                    "category": _guess_category(f.suffix),
                })

    return state


def _guess_category(ext: str) -> str:
    ext = ext.lower()
    if ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"):
        return "image"
    if ext in (".mp3", ".wav", ".ogg", ".flac", ".aac"):
        return "audio"
    if ext in (".mp4", ".webm", ".mov", ".avi"):
        return "video"
    if ext in (".obj", ".gltf", ".glb", ".fbx", ".stl"):
        return "model_3d"
    if ext in (".ttf", ".otf", ".woff", ".woff2"):
        return "font"
    if ext == ".svg":
        return "svg"
    return "other"
