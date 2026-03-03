"""Agent execution loop, conversation management, and public API."""

import asyncio
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Callable, Awaitable

import anthropic
import openai as openai_lib

_logger = logging.getLogger(__name__)

import config as app_config
import workspace
from agents.prompts import SYSTEM_PROMPT, build_system_prompt
from agents.tools import TOOLS, get_tools
from agents.handlers import _handle_tool, BroadcastCallback

# ---------------------------------------------------------------------------
# Callback types
# ---------------------------------------------------------------------------

LogCallback = Callable[[str, str, str], Awaitable[None]]
StatusCallback = Callable[[str, str], Awaitable[None]]  # (status_type, detail)

# ---------------------------------------------------------------------------
# Conversation history: WebSocket ID → message list (persisted to disk)
# ---------------------------------------------------------------------------

_conversations: dict[int, list[dict]] = {}

# Per-session futures for ask_user tool — resolved when the user answers
_user_answer_futures: dict[int, asyncio.Future] = {}

# Per-session browser errors collected during the agent's turn
_browser_errors: dict[int, list[str]] = {}

# Per-session events signalling that a browser error has arrived
_browser_error_events: dict[int, asyncio.Event] = {}


def _get_conversation_file() -> Path:
    """Return the conversation file path inside the active workspace."""
    return workspace.get_workspace_dir() / "conversation.json"


def _save_conversations() -> None:
    """Persist conversation history to disk."""
    try:
        conv_file = _get_conversation_file()
        conv_file.parent.mkdir(parents=True, exist_ok=True)
        conv_file.write_text(
            json.dumps(_conversations, ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def load_conversations() -> None:
    """Load conversation history from disk.

    Called after workspace.init_workspace() so the active workspace is set.
    """
    global _conversations
    try:
        conv_file = _get_conversation_file()
        if conv_file.exists():
            data = json.loads(conv_file.read_text(encoding="utf-8"))
            # JSON keys are strings — convert back to int
            _conversations = {int(k): v for k, v in data.items()}
        else:
            _conversations = {}
    except (OSError, json.JSONDecodeError, ValueError):
        _conversations = {}


# ---------------------------------------------------------------------------
# Multimodal content builder
# ---------------------------------------------------------------------------

def _build_multimodal_content(user_prompt: str, files: list[dict]) -> list[dict]:
    """Build a multimodal content block list from user prompt + attached files.

    Returns a list of Anthropic content blocks (image / text).
    """
    image_mimes = {"image/png", "image/jpeg", "image/gif", "image/webp"}
    content_blocks: list[dict] = []
    non_image_descriptions: list[str] = []

    for f in files:
        mime = f.get("mime_type", "")
        name = f.get("name", "unknown")
        data_b64 = f.get("data_b64", "")

        if mime in image_mimes and data_b64:
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime,
                    "data": data_b64,
                },
            })
            content_blocks.append({
                "type": "text",
                "text": f"[Uploaded image: {name} ({f.get('size', 0)} bytes)]",
            })
        else:
            non_image_descriptions.append(
                f"[Uploaded file: {name} ({f.get('size', 0)} bytes, {mime}) — "
                f"use read_file tool with path='uploads/<filename>' to read its contents. "
                f"The file is accessible at /api/uploads/{name}]"
            )

    # Compose user text
    extra_text = "\n".join(non_image_descriptions)
    prompt_text = user_prompt or "The user uploaded these files."
    if extra_text:
        prompt_text += "\n\n" + extra_text

    content_blocks.append({"type": "text", "text": prompt_text})
    return content_blocks


# ---------------------------------------------------------------------------
# Conversation compaction — reduce token usage when max_tokens is hit
# ---------------------------------------------------------------------------

_MAX_TURNS = 30
_MAX_COMPACT_RETRIES = 2
_MAX_OVERLOAD_RETRIES = 5

# Loop detection: break when the same tool+args pattern repeats too often.
_LOOP_WARN_THRESHOLD = 3   # inject warning after this many identical calls
_LOOP_BREAK_THRESHOLD = 5  # force stop after this many
# Stricter thresholds for custom/small models that loop more easily
_LOOP_WARN_THRESHOLD_CUSTOM = 2
_LOOP_BREAK_THRESHOLD_CUSTOM = 3
# Max unique tool calls to execute per single API response (custom providers)
_MAX_TOOLS_PER_RESPONSE_CUSTOM = 4


# ---------------------------------------------------------------------------
# Prompt classifier — routes to appropriate model (Anthropic only)
# ---------------------------------------------------------------------------

_CLASSIFY_SYSTEM = """\
You classify user requests for a WebGL/shader coding assistant.
Reply with ONLY one word — STANDARD or COMPLEX.

STANDARD: simple parameter changes (change color, speed, size), toggling options, \
asking questions about existing code, reading/listing files, simple one-line fixes
COMPLEX: anything that creates, generates, or builds something new; \
modifying logic or algorithms; adding features; creative requests; \
multi-step tasks; debugging non-trivial errors; refactoring; \
any request that involves writing more than a few lines of code

When in doubt, reply COMPLEX."""


async def _classify_prompt(client: anthropic.AsyncAnthropic, user_prompt: str) -> str:
    """Classify prompt complexity. Returns 'standard' or 'complex'."""
    try:
        resp = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=16,
            system=_CLASSIFY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt[:500]}],
        )
        if "STANDARD" in resp.content[0].text.strip().upper():
            return "standard"
    except Exception as e:
        _logger.debug("Prompt classification failed: %s", e)
    return "complex"


def _strip_thinking(messages: list[dict]) -> None:
    """Remove thinking blocks from all assistant messages in-place."""
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        filtered = [
            block for block in content
            if not (isinstance(block, dict) and block.get("type") == "thinking")
        ]
        if not filtered:
            filtered = [{"type": "text", "text": "(continued)"}]
        msg["content"] = filtered


def _compact_messages(messages: list[dict]) -> None:
    """Compact conversation history in-place to reduce token usage.

    1. Remove thinking blocks from assistant messages
    2. Truncate long tool_use inputs and tool_result contents
    3. Trim old turns, keeping first user message + recent turns
    4. Repeat trimming until estimated tokens are under the safe limit
    """
    _TRUNC = 200
    _SAFE_TOKENS = 120_000  # target after compaction (~4 chars/token)

    # Strip all thinking blocks up front (reuses _strip_thinking)
    _strip_thinking(messages)

    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            # Truncate plain-string user messages if very long
            if isinstance(content, str) and len(content) > 10_000:
                msg["content"] = content[:10_000] + "\n...(truncated)"
            continue

        # --- Truncate large payloads ---
        for block in content:
            if not isinstance(block, dict):
                continue

            # tool_use: truncate input values
            if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
                for key, val in block["input"].items():
                    if isinstance(val, str) and len(val) > _TRUNC:
                        block["input"][key] = val[:_TRUNC] + "...(truncated)"

            # tool_result: truncate content string
            if block.get("type") == "tool_result" and isinstance(block.get("content"), str):
                if len(block["content"]) > _TRUNC:
                    block["content"] = block["content"][:_TRUNC] + "...(truncated)"

    # --- Progressively trim old turns until under token budget ---
    keep_recent = 6
    while len(messages) > 4:
        est = len(json.dumps(messages, ensure_ascii=False)) // 4
        if est <= _SAFE_TOKENS:
            break
        kept = [messages[0]] + messages[-keep_recent:]
        if len(kept) >= len(messages):
            # Can't trim further
            break
        messages.clear()
        messages.extend(kept)
        keep_recent = max(2, keep_recent - 2)


# ---------------------------------------------------------------------------
# GLM (OpenAI-compatible) conversion helpers
# ---------------------------------------------------------------------------

def _convert_messages_to_openai(system: str, messages: list[dict]) -> list[dict]:
    """Convert internal (Anthropic-format) messages to OpenAI chat format."""
    result = [{"role": "system", "content": system}]

    for msg in messages:
        role = msg["role"]
        content = msg.get("content")

        if role == "user":
            if isinstance(content, str):
                result.append({"role": "user", "content": content})
            elif isinstance(content, list):
                tool_results = [
                    b for b in content
                    if isinstance(b, dict) and b.get("type") == "tool_result"
                ]
                other_blocks = [
                    b for b in content
                    if not (isinstance(b, dict) and b.get("type") == "tool_result")
                ]

                for tr in tool_results:
                    result.append({
                        "role": "tool",
                        "tool_call_id": tr.get("tool_use_id", ""),
                        "content": tr.get("content", ""),
                    })

                if other_blocks:
                    parts = []
                    for block in other_blocks:
                        if not isinstance(block, dict):
                            continue
                        if block.get("type") == "text":
                            parts.append({"type": "text", "text": block["text"]})
                        elif block.get("type") == "image":
                            source = block.get("source", {})
                            mime = source.get("media_type", "image/png")
                            data = source.get("data", "")
                            parts.append({
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime};base64,{data}"},
                            })
                    if parts:
                        if len(parts) == 1 and parts[0].get("type") == "text":
                            result.append({"role": "user", "content": parts[0]["text"]})
                        else:
                            result.append({"role": "user", "content": parts})

        elif role == "assistant":
            if isinstance(content, str):
                result.append({"role": "assistant", "content": content})
            elif isinstance(content, list):
                text_parts = []
                tool_calls = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        text_parts.append(block["text"])
                    elif block.get("type") == "tool_use":
                        tool_calls.append({
                            "id": block["id"],
                            "type": "function",
                            "function": {
                                "name": block["name"],
                                "arguments": json.dumps(block.get("input", {})),
                            },
                        })
                    # Skip thinking blocks

                text_content = "\n".join(text_parts) if text_parts else None
                if not text_content and not tool_calls:
                    text_content = "(continued)"
                msg_dict = {"role": "assistant", "content": text_content}
                if tool_calls:
                    msg_dict["tool_calls"] = tool_calls
                result.append(msg_dict)

    return result


def _convert_tools_to_openai(tools: list[dict]) -> list[dict]:
    """Convert Anthropic tool definitions to OpenAI function-calling format."""
    result = []
    for tool in tools:
        result.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
            },
        })
    return result


# ---------------------------------------------------------------------------
# Provider-specific API call functions
# ---------------------------------------------------------------------------

async def _call_anthropic(
    client: anthropic.AsyncAnthropic,
    model_name: str,
    max_tokens: int,
    messages: list[dict],
    log: LogCallback,
    on_status: StatusCallback | None,
    system_prompt: str = SYSTEM_PROMPT,
    tools: list[dict] = TOOLS,
) -> tuple[list[dict], str]:
    """Stream Anthropic API call. Returns (content_blocks, stop_reason).

    content_blocks: list of dicts with 'type' and type-specific fields.
    stop_reason: 'end_turn', 'tool_use', or 'max_tokens'.
    Raises anthropic exceptions on error (handled by caller).
    """
    current_block_type = None
    thinking_chunks: list[str] = []
    thinking_len = 0

    async with client.messages.stream(
        model=model_name,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=system_prompt,
        tools=tools,
        messages=messages,
    ) as stream:
        async for event in stream:
            if event.type == "content_block_start":
                current_block_type = event.content_block.type
                if current_block_type == "thinking":
                    thinking_chunks = []
                    thinking_len = 0
                    await log("Agent", "[Thinking started]", "thinking")
                    if on_status:
                        await on_status("thinking", "")
                elif current_block_type == "tool_use":
                    tool_name = getattr(event.content_block, "name", "")
                    if on_status:
                        await on_status("tool_use", tool_name)

            elif event.type == "content_block_delta":
                delta = event.delta
                delta_type = getattr(delta, "type", "")
                if delta_type == "thinking_delta":
                    chunk = getattr(delta, "thinking", "")
                    if chunk:
                        thinking_chunks.append(chunk)
                        thinking_len += len(chunk)
                        if thinking_len % 300 < len(chunk):
                            if on_status:
                                await on_status("thinking", "".join(thinking_chunks))

            elif event.type == "content_block_stop":
                if current_block_type == "thinking" and thinking_chunks:
                    full_thinking = "".join(thinking_chunks)
                    await log("Agent", full_thinking, "thinking")
                    if on_status:
                        await on_status("thinking", full_thinking)
                current_block_type = None

        response = await stream.get_final_message()

    # Serialize content blocks to internal dict format
    content_blocks = []
    for block in response.content:
        if block.type == "thinking":
            content_blocks.append({
                "type": "thinking",
                "thinking": block.thinking,
                "signature": block.signature,
            })
        elif block.type == "text":
            content_blocks.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            content_blocks.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })

    return content_blocks, response.stop_reason


# Model configuration for OpenAI-compatible providers
_OPENAI_COMPAT_MODELS = {
    "openai": {"model": "gpt-5.2", "max_tokens": 32768},
    "gemini": {"model": "gemini-2.5-pro", "max_tokens": 65536},
    "glm":    {"model": "glm-4-plus", "max_tokens": 4096},
}


def _strip_think_tags(text: str) -> tuple[str, str]:
    """Extract and remove <think>...</think> blocks from text.

    Returns (clean_content, thinking_text).
    """
    thinking_parts: list[str] = []
    clean = text
    while "<think>" in clean:
        start = clean.find("<think>")
        end = clean.find("</think>", start)
        if end == -1:
            # Unclosed tag — everything after <think> is thinking
            thinking_parts.append(clean[start + len("<think>"):])
            clean = clean[:start]
            break
        thinking_parts.append(clean[start + len("<think>"):end])
        clean = clean[:start] + clean[end + len("</think>"):]
    return clean.strip(), "\n".join(thinking_parts)


async def _call_openai_compat(
    provider: str,
    messages: list[dict],
    log: LogCallback,
    on_status: StatusCallback | None,
    system_prompt: str = SYSTEM_PROMPT,
    tools: list[dict] = TOOLS,
    tool_choice: str = "auto",
    use_stream: bool = True,
) -> tuple[list[dict], str]:
    """Call an OpenAI-compatible API. Returns (content_blocks, stop_reason).

    use_stream: True for SSE streaming (real-time progress), False for a single
        HTTP request (more reliable — no mid-stream disconnections).
    tool_choice: "auto" (default), "required" (force tool use), or "none".
    Works for openai, gemini, glm, and custom providers.
    """
    api_key = app_config.get_api_key(provider) or "not-needed"
    base_url = app_config.get_base_url(provider)

    import httpx
    client_kwargs = {
        "api_key": api_key,
        # Long timeout for reasoning models (Qwen3.5, DeepSeek R1, etc.)
        # that may take minutes to generate thinking tokens before responding.
        "timeout": httpx.Timeout(timeout=600.0, connect=10.0),
    }
    if base_url:
        client_kwargs["base_url"] = base_url
    client = openai_lib.AsyncOpenAI(**client_kwargs)

    if provider == "custom":
        model_name = app_config.get_custom_model()
        max_tokens = app_config.get_custom_max_tokens()
    else:
        model_cfg = _OPENAI_COMPAT_MODELS[provider]
        model_name = model_cfg["model"]
        max_tokens = model_cfg["max_tokens"]

    openai_messages = _convert_messages_to_openai(system_prompt, messages)
    openai_tools = _convert_tools_to_openai(tools)

    # For custom providers, cap output tokens so input + output fits the context window.
    _effective_max = max_tokens
    if provider == "custom":
        _context_window = app_config.get_custom_context_window()
        _input_chars = len(json.dumps(openai_messages, ensure_ascii=False))
        if openai_tools:
            _input_chars += len(json.dumps(openai_tools, ensure_ascii=False))
        _est_input_tokens = int(_input_chars / 3.5)
        _available = _context_window - _est_input_tokens
        _effective_max = min(max_tokens, _available)
        _effective_max = max(_effective_max, 1024)

    if provider == "custom":
        await log("System",
            f"[API call] tokens: ~{_est_input_tokens} in / {_effective_max} out "
            f"(ctx_window={_context_window}, max_tokens={max_tokens})",
            "info")

    if on_status:
        await on_status("thinking", f"Calling {provider} API...")

    # Build tool_choice kwarg
    _tc_kwarg = {}
    if openai_tools:
        _tc_kwarg["tools"] = openai_tools
        if tool_choice != "auto":
            _tc_kwarg["tool_choice"] = tool_choice
    else:
        _tc_kwarg["tools"] = openai_lib.NOT_GIVEN

    # Shared state populated by either streaming or non-streaming path
    content_text = ""
    thinking_text = ""
    tool_calls_acc: dict[int, dict] = {}
    finish_reason = None
    _stream_interrupted = False

    # OpenAI and Gemini newer models require max_completion_tokens instead of max_tokens.
    _token_kwarg = (
        {"max_completion_tokens": _effective_max}
        if provider in ("openai", "gemini")
        else {"max_tokens": _effective_max}
    )

    if not use_stream:
        # ----- Non-streaming path (reliable, no mid-stream drops) -----
        if on_status:
            await on_status("thinking", f"Calling {provider} API...")

        response = await client.chat.completions.create(
            model=model_name,
            messages=openai_messages,
            stream=False,
            **_token_kwarg,
            **_tc_kwarg,
        )

        if not response.choices:
            return [], "end_turn"

        choice = response.choices[0]
        finish_reason = choice.finish_reason
        content_text = choice.message.content or ""

        # Extract reasoning_content (vLLM for Qwen/DeepSeek)
        _reasoning = getattr(choice.message, "reasoning_content", None)
        if _reasoning:
            thinking_text = _reasoning

        # Strip <think>...</think> tags from content
        content_text, _think_from_tags = _strip_think_tags(content_text)
        if _think_from_tags:
            thinking_text = (thinking_text + "\n" + _think_from_tags).strip()

        # Extract tool calls
        for i, tc in enumerate(choice.message.tool_calls or []):
            tool_calls_acc[i] = {
                "id": tc.id or f"call_{i}",
                "name": tc.function.name or "",
                "arguments": tc.function.arguments or "",
            }

        if on_status and content_text.strip():
            await on_status("thinking", content_text.strip())

    else:
        # ----- Streaming path (real-time progress) -----
        stream = await client.chat.completions.create(
            model=model_name,
            messages=openai_messages,
            stream=True,
            **_token_kwarg,
            **_tc_kwarg,
        )

        _in_think_tag = False
        _status_chars = 0
        _status_think_chars = 0
        _status_tool_chars = 0

        try:
            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta

                # Some providers (vLLM for Qwen/DeepSeek) expose reasoning via
                # a dedicated `reasoning_content` field on the delta.
                _reasoning = getattr(delta, "reasoning_content", None)
                if _reasoning:
                    thinking_text += _reasoning
                    if on_status and (len(thinking_text) - _status_think_chars >= 40 or _status_think_chars == 0):
                        _status_think_chars = len(thinking_text)
                        await on_status("thinking", thinking_text)

                if delta and delta.content:
                    raw = delta.content

                    # Parse <think>...</think> tags inline during streaming.
                    # Models like Qwen3.5 and DeepSeek R1 wrap reasoning in these.
                    if _in_think_tag:
                        close_idx = raw.find("</think>")
                        if close_idx != -1:
                            thinking_text += raw[:close_idx]
                            _in_think_tag = False
                            remainder = raw[close_idx + len("</think>"):]
                            if remainder:
                                content_text += remainder
                        else:
                            thinking_text += raw
                        if on_status and thinking_text and (len(thinking_text) - _status_think_chars >= 40 or _status_think_chars == 0):
                            _status_think_chars = len(thinking_text)
                            await on_status("thinking", thinking_text)
                        continue
                    else:
                        open_idx = raw.find("<think>")
                        if open_idx != -1:
                            # Text before <think> is content
                            before = raw[:open_idx]
                            if before:
                                content_text += before
                            after = raw[open_idx + len("<think>"):]
                            close_idx = after.find("</think>")
                            if close_idx != -1:
                                thinking_text += after[:close_idx]
                                remainder = after[close_idx + len("</think>"):]
                                if remainder:
                                    content_text += remainder
                            else:
                                thinking_text += after
                                _in_think_tag = True
                            if on_status and thinking_text and (len(thinking_text) - _status_think_chars >= 40 or _status_think_chars == 0):
                                _status_think_chars = len(thinking_text)
                                await on_status("thinking", thinking_text)
                            continue

                        content_text += raw

                    # Stream partial text as "thinking" status so the UI shows progress.
                    # First chunk sent immediately, then throttled every 40 chars.
                    if on_status and (_status_chars == 0 or len(content_text) - _status_chars >= 40):
                        _status_chars = len(content_text)
                        await on_status("thinking", content_text)

                if delta and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_acc[idx]["name"] = tc.function.name
                                if on_status:
                                    await on_status("tool_use", tc.function.name)
                            if tc.function.arguments:
                                tool_calls_acc[idx]["arguments"] += tc.function.arguments
                                # Show progress while tool arguments stream in
                                total_args = sum(len(t["arguments"]) for t in tool_calls_acc.values())
                                if on_status and total_args - _status_tool_chars >= 200:
                                    _status_tool_chars = total_args
                                    name = tool_calls_acc[idx]["name"] or "tool"
                                    await on_status("thinking", f"Generating {name} arguments...")

                if choice.finish_reason:
                    finish_reason = choice.finish_reason

        except Exception as stream_err:
            # If the stream breaks mid-way (e.g. vLLM drops the connection after
            # finishing generation but before properly closing the SSE stream),
            # use whatever content we already accumulated instead of failing.
            _has_partial = bool(content_text.strip() or tool_calls_acc)
            if _has_partial:
                if log:
                    await log("System", f"Stream interrupted but partial response recovered: {stream_err}", "info")
                _stream_interrupted = True
            else:
                raise  # nothing received — propagate the error

    # ----- Shared post-processing -----

    # Log thinking if captured (either from <think> tags or reasoning_content)
    if thinking_text.strip() and log:
        await log("Agent", thinking_text.strip(), "thinking")
    if on_status and thinking_text.strip():
        await on_status("thinking", thinking_text.strip())

    # Build normalized content blocks (same format as Anthropic)
    content_blocks = []
    if content_text and content_text.strip():
        content_blocks.append({"type": "text", "text": content_text.strip()})

    _dropped_tools = 0
    for idx in sorted(tool_calls_acc.keys()):
        tc = tool_calls_acc[idx]
        try:
            args = json.loads(tc["arguments"]) if tc["arguments"] else {}
        except json.JSONDecodeError:
            if _stream_interrupted:
                # Stream broke mid-generation — arguments are truncated JSON.
                # Drop this tool call entirely instead of executing with empty args.
                _dropped_tools += 1
                if log:
                    await log("System", f"Dropped truncated tool call: {tc['name']} (stream interrupted)", "info")
                continue
            args = {}
        content_blocks.append({
            "type": "tool_use",
            "id": tc["id"],
            "name": tc["name"],
            "input": args,
        })

    # If all tool calls were dropped due to stream interruption, treat as
    # max_tokens so the caller retries cleanly instead of executing garbage.
    if _stream_interrupted and _dropped_tools and not any(
        b["type"] == "tool_use" for b in content_blocks
    ):
        if log:
            await log("System", f"All {_dropped_tools} tool call(s) had truncated arguments — treating as max_tokens", "info")
        # Keep any text content that was successfully received
        return content_blocks, "max_tokens"

    # Map OpenAI finish_reason to Anthropic stop_reason.
    # If the stream was interrupted, infer the reason from content:
    # tool calls present → "tool_use", otherwise "end_turn".
    _REASON_MAP = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens"}
    if _stream_interrupted and finish_reason is None:
        stop_reason = "tool_use" if tool_calls_acc else "end_turn"
    else:
        stop_reason = _REASON_MAP.get(finish_reason, "end_turn")

    return content_blocks, stop_reason


# ---------------------------------------------------------------------------
# Agent execution loop
# ---------------------------------------------------------------------------

def _drain_injected(queue: asyncio.Queue | None) -> list[str]:
    """Drain all pending messages from the injection queue."""
    items = []
    if queue is None:
        return items
    while not queue.empty():
        try:
            items.append(queue.get_nowait())
        except asyncio.QueueEmpty:
            break
    return items


async def run_agent(
    ws_id: int,
    user_prompt: str,
    log: LogCallback,
    broadcast: BroadcastCallback,
    on_text: Callable[[str], Awaitable[None]] | None = None,
    on_status: StatusCallback | None = None,
    files: list[dict] | None = None,
    injected_queue: asyncio.Queue | None = None,
) -> dict:
    """Run the agent for one user prompt.

    Supports Anthropic, OpenAI, Gemini, and GLM providers (selected via config).
    Returns {"chat_text": str} with the agent's conversational reply.
    """
    await log("System", f"Starting agent for: \"{user_prompt}\"", "info")
    if files:
        file_names = ", ".join(f["name"] for f in files)
        await log("System", f"Files attached: {file_names}", "info")

    provider = app_config.get_provider()

    # Provider-specific setup
    if provider == "custom":
        model_name = app_config.get_custom_model()
        max_tokens = app_config.get_custom_max_tokens()
        client = None
    elif provider in _OPENAI_COMPAT_MODELS:
        model_cfg = _OPENAI_COMPAT_MODELS[provider]
        model_name = model_cfg["model"]
        max_tokens = model_cfg["max_tokens"]
        client = None  # OpenAI-compat providers create their own client
    else:
        client = anthropic.AsyncAnthropic()
        tier = await _classify_prompt(client, user_prompt)
        if tier == "complex":
            model_name = "claude-opus-4-6"
            max_tokens = 65536
        else:
            model_name = "claude-sonnet-4-6"
            max_tokens = 16384

    await log("System", f"Provider: {provider} | Model: {model_name}", "info")

    # Build dynamic system prompt and tool list (filtered for custom providers)
    system_prompt = build_system_prompt(provider, user_prompt, has_files=bool(files))
    tools = get_tools(provider)

    # Build user message content
    if files:
        content = _build_multimodal_content(user_prompt, files)
    else:
        content = user_prompt

    messages = _conversations.setdefault(ws_id, [])
    messages.append({"role": "user", "content": content})

    last_text = ""
    turns = 0
    compact_retries = 0
    overload_retries = 0
    connection_retries = 0  # separate counter for transient connection drops
    force_tool_retries = 0
    _MAX_FORCE_TOOL = 1
    _MAX_CONNECTION_RETRIES = 3
    _force_tool_choice = "auto"  # escalated to "required" after empty/text-only response
    recent_tool_sigs: list[str] = []  # track (name|input_hash) for loop detection
    _use_stream = True  # auto-switched to False after stream interruptions

    # Cumulative message size for token estimation (avoids re-serialising every turn)
    _msg_size_acc = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)

    try:
        while turns < _MAX_TURNS:
            turns += 1

            # Pre-flight compaction: estimate token count (~4 chars/token)
            # and compact if approaching the context limit.
            _est_tokens = _msg_size_acc // 4

            if provider == "custom":
                await log("System",
                    f"[Turn {turns}/{_MAX_TURNS}] tool_choice={_force_tool_choice}, "
                    f"msg_tokens~{_est_tokens}, stream={_use_stream}",
                    "info")
            if provider == "custom":
                _ctx_win = app_config.get_custom_context_window()
                _compact_threshold = max(int(_ctx_win * 0.6), 4000)
            elif provider in _OPENAI_COMPAT_MODELS:
                _model_cfg = _OPENAI_COMPAT_MODELS[provider]
                _compact_threshold = max(_model_cfg["max_tokens"] * 4, 30_000)
            else:
                _compact_threshold = 150_000
            if _est_tokens > _compact_threshold:
                await log("System", f"Estimated ~{_est_tokens} tokens (limit ~{_compact_threshold}) — compacting...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)
                _msg_size_acc = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)

            # Sanitize: remove any messages with empty content before API call
            messages[:] = [
                m for m in messages
                if m.get("content") not in (None, "", [], [{}])
            ]

            # --- Call the appropriate provider ---
            try:
                if provider in _OPENAI_COMPAT_MODELS or provider == "custom":
                    content_blocks, stop_reason = await _call_openai_compat(
                        provider, messages, log, on_status,
                        system_prompt=system_prompt,
                        tools=tools,
                        tool_choice=_force_tool_choice,
                        use_stream=_use_stream,
                    )
                else:
                    content_blocks, stop_reason = await _call_anthropic(
                        client, model_name, max_tokens, messages, log, on_status,
                        system_prompt=system_prompt,
                        tools=tools,
                    )

            # --- Anthropic-specific error handling ---
            except anthropic.BadRequestError as e:
                err_msg = str(e)
                if "thinking" in err_msg.lower() or "signature" in err_msg.lower():
                    await log("System", "Stripping thinking blocks for model compatibility...", "info")
                    _strip_thinking(messages)
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        raise
                    continue
                if "prompt is too long" in err_msg or "non-empty content" in err_msg:
                    await log("System", f"Bad request — compacting and retrying: {err_msg[:200]}", "info")
                    if on_status:
                        await on_status("thinking", "Compacting conversation...")
                    _compact_messages(messages)
                    _msg_size_acc = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        await log("System", "Max compact retries — cannot reduce further", "error")
                        break
                    continue
                raise
            except (anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.APIStatusError) as e:
                # Check the error body for server-side errors that arrive via SSE
                # streaming (status_code may be 200 even though the body is a 500/529).
                _err_body = str(e).lower()
                _is_body_server_error = any(k in _err_body for k in (
                    "api_error", "overloaded_error", "internal server error",
                    "server_error", "rate_limit_error",
                ))
                if isinstance(e, anthropic.APIStatusError) and e.status_code < 500 and not _is_body_server_error:
                    raise
                is_overloaded = (
                    (isinstance(e, anthropic.APIStatusError) and e.status_code == 529)
                    or "overloaded" in _err_body
                )
                if is_overloaded:
                    overload_retries += 1
                    # Fallback: Opus → Sonnet after 2 failed attempts
                    if overload_retries >= 2 and model_name == "claude-opus-4-6":
                        model_name = "claude-sonnet-4-6"
                        max_tokens = 16384
                        await log("System", f"Falling back to {model_name} due to overload", "info")
                    if overload_retries > _MAX_OVERLOAD_RETRIES:
                        await log("System", f"API overloaded after {_MAX_OVERLOAD_RETRIES} retries — giving up", "error")
                        raise
                    delay = min(2 ** overload_retries, 30)
                    await log("System", f"API overloaded — retrying in {delay}s ({overload_retries}/{_MAX_OVERLOAD_RETRIES})...", "info")
                    if on_status:
                        await on_status("thinking", f"Server busy, retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    continue
                connection_retries += 1
                # Fallback: Opus → Sonnet after 2 failed server errors
                if connection_retries >= 2 and model_name == "claude-opus-4-6":
                    model_name = "claude-sonnet-4-6"
                    max_tokens = 16384
                    await log("System", f"Falling back to {model_name} due to server errors", "info")
                if connection_retries > _MAX_CONNECTION_RETRIES:
                    await log("System", f"API server error after {_MAX_CONNECTION_RETRIES} retries: {e}", "error")
                    raise
                delay = min(2 ** connection_retries, 10)
                await log("System", f"API error — retrying in {delay}s ({connection_retries}/{_MAX_CONNECTION_RETRIES})...", "info")
                if on_status:
                    await on_status("thinking", f"Server error, retrying in {delay}s...")
                await asyncio.sleep(delay)
                continue

            # --- Generic error handling (covers GLM + transient errors) ---
            except Exception as e:
                err_str = str(e).lower()

                # OpenAI-compatible provider retries (openai, gemini, glm, custom)
                if provider in _OPENAI_COMPAT_MODELS or provider == "custom":
                    if isinstance(e, openai_lib.APIStatusError):
                        if e.status_code == 400:
                            err_body = str(e).lower()
                            if ("context length" in err_body
                                    or ("input" in err_body and "token" in err_body)
                                    or "reduce the length" in err_body):
                                compact_retries += 1
                                if compact_retries > _MAX_COMPACT_RETRIES:
                                    await log("System", f"Context too long after {_MAX_COMPACT_RETRIES} compactions — giving up", "error")
                                    raise
                                await log("System", f"Context length exceeded — compacting ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                                if on_status:
                                    await on_status("thinking", "Context too long, compacting...")
                                _compact_messages(messages)
                                _msg_size_acc = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
                                continue
                            raise
                        if e.status_code == 429:
                            overload_retries += 1
                            if overload_retries > _MAX_OVERLOAD_RETRIES:
                                await log("System", f"Rate limited after {_MAX_OVERLOAD_RETRIES} retries — giving up", "error")
                                raise
                            delay = min(2 ** overload_retries, 30)
                            await log("System", f"Rate limited — retrying in {delay}s ({overload_retries}/{_MAX_OVERLOAD_RETRIES})...", "info")
                            if on_status:
                                await on_status("thinking", f"Rate limited, retrying in {delay}s...")
                            await asyncio.sleep(delay)
                            continue
                        if e.status_code >= 500:
                            compact_retries += 1
                            if compact_retries > _MAX_COMPACT_RETRIES:
                                await log("System", f"{provider} server error after retries: {e}", "error")
                                raise
                            await log("System", f"{provider} server error — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                            if on_status:
                                await on_status("thinking", "Server error, retrying...")
                            await asyncio.sleep(2)
                            continue
                        raise  # client error, don't retry
                    if isinstance(e, (openai_lib.APIConnectionError, openai_lib.APITimeoutError)):
                        compact_retries += 1
                        if compact_retries > _MAX_COMPACT_RETRIES:
                            await log("System", f"{provider} connection error after retries: {e}", "error")
                            raise
                        # Switch to non-streaming for reliability on next attempt
                        if _use_stream and provider == "custom":
                            _use_stream = False
                            await log("System", "Switching to non-streaming mode for reliability", "info")
                        await log("System", f"Connection interrupted — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                        if on_status:
                            await on_status("thinking", "Connection lost, retrying...")
                        await asyncio.sleep(2)
                        continue

                # Anthropic server-side errors that slipped through the typed handler
                # (e.g. raised as generic APIError during streaming instead of APIStatusError).
                # Covers: overloaded_error (529), api_error (500), rate_limit_error, etc.
                _is_server_error = any(k in err_str for k in (
                    "overloaded", "internal server error", "'type': 'api_error'",
                    "rate_limit", "server_error",
                ))
                if _is_server_error:
                    overload_retries += 1
                    # Fallback: Opus → Sonnet after 2 failed attempts
                    if overload_retries >= 2 and model_name == "claude-opus-4-6":
                        model_name = "claude-sonnet-4-6"
                        max_tokens = 16384
                        await log("System", f"Falling back to {model_name} due to server errors", "info")
                    if overload_retries > _MAX_OVERLOAD_RETRIES:
                        await log("System", f"API server error after {_MAX_OVERLOAD_RETRIES} retries — giving up", "error")
                        raise
                    delay = min(2 ** overload_retries, 30)
                    await log("System", f"API server error — retrying in {delay}s ({overload_retries}/{_MAX_OVERLOAD_RETRIES})...", "info")
                    if on_status:
                        await on_status("thinking", f"Server error, retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    continue

                # Transient connection errors (either provider) — retry without
                # compaction since these are network issues, not input size issues.
                if any(k in err_str for k in ("incomplete chunked", "peer closed", "connection", "reset by peer", "timed out")):
                    connection_retries += 1
                    if connection_retries > _MAX_CONNECTION_RETRIES:
                        await log("System", f"Server connection failed after {_MAX_CONNECTION_RETRIES} retries: {e}", "error")
                        raise
                    # Switch to non-streaming for reliability on next attempt
                    if _use_stream and provider == "custom":
                        _use_stream = False
                        await log("System", "Switching to non-streaming mode for reliability", "info")
                    delay = min(2 ** connection_retries, 10)
                    await log("System", f"Server disconnected — retrying in {delay}s ({connection_retries}/{_MAX_CONNECTION_RETRIES})...", "info")
                    if on_status:
                        await on_status("thinking", f"Server disconnected, retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    continue
                raise

            # --- Process content blocks (unified format for both providers) ---

            # Handle empty response: model returned nothing at all
            if not content_blocks:
                await log("System", f"Model returned empty response (stop_reason={stop_reason})", "warning")
                if force_tool_retries < _MAX_FORCE_TOOL and (
                    provider in _OPENAI_COMPAT_MODELS or provider == "custom"
                ):
                    force_tool_retries += 1
                    _force_tool_choice = "required"
                    await log("System", "Retrying with tool_choice=required", "info")
                    continue
                break

            for block in content_blocks:
                if block["type"] == "text":
                    last_text = block["text"]
                    if block["text"].strip():
                        await log("Agent", block["text"], "info")
                        if on_text:
                            await on_text(block["text"])
                elif block["type"] == "tool_use":
                    input_str = json.dumps(block["input"])
                    if len(input_str) > 200:
                        input_str = input_str[:200] + "..."
                    await log("Agent", f"Tool: {block['name']}({input_str})", "thinking")
                    if on_status:
                        await on_status("tool_use", block["name"])

            # Append assistant message to history
            _asst_msg = {"role": "assistant", "content": content_blocks}
            messages.append(_asst_msg)
            _msg_size_acc += len(json.dumps(_asst_msg, ensure_ascii=False))

            # If the response was cut off due to token limit, compact & retry.
            # Also handles stream interruptions that dropped all tool calls.
            if stop_reason == "max_tokens":
                # If this came from a stream interruption, switch to non-streaming
                if _use_stream and provider == "custom":
                    _use_stream = False
                    await log("System", "Switching to non-streaming mode for reliability", "info")
                compact_retries += 1
                if compact_retries > _MAX_COMPACT_RETRIES:
                    await log("System", "Max compact retries reached — using partial response", "info")
                    break
                await log("System", "Token limit reached — compacting conversation...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)
                _msg_size_acc = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
                _cont_msg = {
                    "role": "user",
                    "content": "You were cut off due to token limit. Continue where you left off.",
                }
                messages.append(_cont_msg)
                _msg_size_acc += len(json.dumps(_cont_msg, ensure_ascii=False))
                continue

            # If the model stopped for a reason other than tool_use, check
            # for injected user messages before finishing.
            if stop_reason != "tool_use":
                # If the model responded with only text and no tool calls,
                # retry with tool_choice="required" to force tool use.
                has_tool_calls = any(b["type"] == "tool_use" for b in content_blocks)
                if not has_tool_calls and force_tool_retries < _MAX_FORCE_TOOL and (
                    provider in _OPENAI_COMPAT_MODELS or provider == "custom"
                ):
                    force_tool_retries += 1
                    _force_tool_choice = "required"
                    await log("System", "No tool calls — retrying with tool_choice=required", "info")
                    continue
                _force_tool_choice = "auto"
                injected = _drain_injected(injected_queue)
                if injected:
                    combined = "\n\n".join(injected)
                    await log("System", f"Injecting user message into conversation", "info")
                    _inj_msg = {
                        "role": "user",
                        "content": f"[User message]: {combined}",
                    }
                    messages.append(_inj_msg)
                    _msg_size_acc += len(json.dumps(_inj_msg, ensure_ascii=False))
                    continue
                break

            # Reset tool_choice to auto now that we have successful tool calls.
            # This is critical: if _force_tool_choice was "required" (from a
            # previous empty response retry), it must be reset here so the model
            # can respond with text-only when it's done.  Without this reset,
            # the model gets stuck in an infinite loop — forced to call tools
            # every turn even after completing the task.
            _force_tool_choice = "auto"

            # --- Per-response deduplication for custom providers ---
            # Small models often emit the same tool call multiple times in one
            # response.  Deduplicate by (name, input) — execute each unique
            # call only once, return the same result for duplicates.
            _is_custom = provider == "custom"
            _tool_blocks = [b for b in content_blocks if b["type"] == "tool_use"]

            _capped_ids: list[str] = []  # tool_use_ids that were capped (not executed)
            if _is_custom and len(_tool_blocks) > 1:
                _seen_sigs: dict[str, str] = {}   # sig → tool_use_id of first occurrence
                _deduped: list[dict] = []
                _dup_ids: dict[str, str] = {}     # dup tool_use_id → first tool_use_id
                for b in _tool_blocks:
                    _ik = json.dumps(b["input"], sort_keys=True, ensure_ascii=False)
                    _s = f"{b['name']}|{hash(_ik)}"
                    if _s in _seen_sigs:
                        _dup_ids[b["id"]] = _seen_sigs[_s]
                        await log("System", f"Dedup: skipping duplicate {b['name']} call in same response", "info")
                    else:
                        _seen_sigs[_s] = b["id"]
                        _deduped.append(b)
                # Cap total tool calls per response
                if len(_deduped) > _MAX_TOOLS_PER_RESPONSE_CUSTOM:
                    await log("System", f"Capping tool calls: {len(_deduped)} → {_MAX_TOOLS_PER_RESPONSE_CUSTOM}", "info")
                    _capped_ids = [b["id"] for b in _deduped[_MAX_TOOLS_PER_RESPONSE_CUSTOM:]]
                    _deduped = _deduped[:_MAX_TOOLS_PER_RESPONSE_CUSTOM]
                _tool_blocks = _deduped
            else:
                _dup_ids = {}

            # Select loop thresholds based on provider
            _warn_thresh = _LOOP_WARN_THRESHOLD_CUSTOM if _is_custom else _LOOP_WARN_THRESHOLD
            _break_thresh = _LOOP_BREAK_THRESHOLD_CUSTOM if _is_custom else _LOOP_BREAK_THRESHOLD

            # Execute tool calls and build tool_result messages
            tool_results = []
            _executed_results: dict[str, dict] = {}  # tool_use_id → tool_result (for dedup)

            for block in _tool_blocks:
                is_error = False
                # Show which tool is being executed
                if on_status:
                    await on_status("thinking", f"Running {block['name']}...")
                try:
                    result_str = await _handle_tool(block["name"], block["input"], broadcast, ws_id)
                    if result_str and result_str.startswith("Error"):
                        is_error = True
                except Exception as e:
                    result_str = f"Error executing tool '{block['name']}': {e}"
                    is_error = True
                    await log("System", result_str, "error")
                tr = {
                    "type": "tool_result",
                    "tool_use_id": block["id"],
                    "content": result_str or "(empty result)",
                }
                if is_error:
                    tr["is_error"] = True
                tool_results.append(tr)
                _executed_results[block["id"]] = tr

                # Show tool result summary in thinking panel
                if on_status:
                    preview = (result_str or "")[:120]
                    if is_error:
                        await on_status("thinking", f"{block['name']} → Error: {preview}")
                    else:
                        await on_status("thinking", f"{block['name']} → {preview}")

                # Track for loop detection
                _input_key = json.dumps(block["input"], sort_keys=True, ensure_ascii=False)
                _sig = f"{block['name']}|{hash(_input_key)}"
                recent_tool_sigs.append(_sig)

            # Add tool_result entries for deduplicated calls (copy result from first)
            for _dup_id, _first_id in _dup_ids.items():
                _first_tr = _executed_results.get(_first_id)
                if _first_tr:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": _dup_id,
                        "content": _first_tr["content"],
                        **({"is_error": True} if _first_tr.get("is_error") else {}),
                    })

            # Add placeholder results for capped tool calls (not executed)
            for _cap_id in _capped_ids:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": _cap_id,
                    "content": "Tool call skipped: too many tool calls in one response. Try calling fewer tools at once.",
                    "is_error": True,
                })

            # --- Loop detection ---
            # Check if the same tool+args signature repeats too many times
            # in the recent history (look at the last 10 calls).
            _loop_detected = False
            if len(recent_tool_sigs) >= _warn_thresh:
                _window = recent_tool_sigs[-10:]
                _counts = Counter(_window)
                _top_sig, _top_count = _counts.most_common(1)[0]
                _loop_tool_name = _top_sig.split("|")[0]

                if _top_count >= _break_thresh:
                    await log("System", f"Loop detected: {_loop_tool_name} called {_top_count} times with same args — forcing stop", "warning")
                    if on_status:
                        await on_status("thinking", f"Loop detected: {_loop_tool_name} repeated {_top_count}x — stopping agent")
                    # Add tool results so conversation stays valid, then break
                    _loop_msg = {"role": "user", "content": list(tool_results) + [{
                        "type": "text",
                        "text": f"SYSTEM: Loop detected — you have called {_loop_tool_name} {_top_count} times with identical arguments. This is an infinite loop. Stop and tell the user what happened.",
                    }]}
                    messages.append(_loop_msg)
                    _msg_size_acc += len(json.dumps(_loop_msg, ensure_ascii=False))
                    _loop_detected = True
                elif _top_count >= _warn_thresh:
                    await log("System", f"Repeated tool call: {_loop_tool_name} ({_top_count}x) — warning agent", "warning")
                    if on_status:
                        await on_status("thinking", f"Warning: {_loop_tool_name} called {_top_count}x with same args")

            if _loop_detected:
                break

            # Inject any queued user messages alongside tool results
            user_content = list(tool_results)
            injected = _drain_injected(injected_queue)
            if injected:
                combined = "\n\n".join(injected)
                await log("System", f"Injecting user message into conversation", "info")
                user_content.append({
                    "type": "text",
                    "text": f"[User message]: {combined}",
                })

            # Inject loop warning alongside tool results (before appending to messages)
            if len(recent_tool_sigs) >= _warn_thresh:
                _window = recent_tool_sigs[-10:]
                _counts = Counter(_window)
                _top_sig, _top_count = _counts.most_common(1)[0]
                if _top_count >= _warn_thresh:
                    _loop_tool_name = _top_sig.split("|")[0]
                    user_content.append({
                        "type": "text",
                        "text": f"WARNING: You have called {_loop_tool_name} {_top_count} times with the same arguments. You may be stuck in a loop. Try a completely different approach or provide your current results to the user.",
                    })

            _user_msg = {"role": "user", "content": user_content}
            messages.append(_user_msg)
            _msg_size_acc += len(json.dumps(_user_msg, ensure_ascii=False))

            # If approaching turn limit, tell the agent to wrap up
            if turns == _MAX_TURNS - 1:
                _wrap_msg = {
                    "role": "user",
                    "content": "You are running out of turns. Please provide your final response now — summarize what you accomplished and any remaining issues.",
                }
                messages.append(_wrap_msg)
                _msg_size_acc += len(json.dumps(_wrap_msg, ensure_ascii=False))

        # Log completion
        await log(
            "System",
            f"Agent finished — turns: {turns}",
            "result",
        )

        chat_text = last_text or "Done."
        _save_conversations()
        return {"chat_text": chat_text}

    except asyncio.CancelledError:
        _save_conversations()
        await log("System", "Agent cancelled by user", "info")
        raise

    except Exception as e:
        # Log the error but preserve conversation history so the user
        # can continue from where they left off instead of losing context.
        _save_conversations()
        await log("System", f"Agent error (conversation preserved): {e}", "error")
        raise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_debug_conversations(max_content_len: int = 200) -> dict[int, list[dict]]:
    """Return a safely-serialisable copy of _conversations with large content truncated."""
    def _truncate(obj):
        if isinstance(obj, str):
            return obj[:max_content_len] + "..." if len(obj) > max_content_len else obj
        if isinstance(obj, list):
            return [_truncate(item) for item in obj]
        if isinstance(obj, dict):
            return {k: _truncate(v) for k, v in obj.items()}
        return obj

    return {ws_id: _truncate(msgs) for ws_id, msgs in _conversations.items()}


async def reset_agent(ws_id: int) -> None:
    """Clear conversation history so the next query starts fresh."""
    _conversations.pop(ws_id, None)
    _save_conversations()
