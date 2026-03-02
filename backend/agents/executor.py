"""Agent execution loop, conversation management, and public API."""

import asyncio
import json
from pathlib import Path
from typing import Callable, Awaitable

import anthropic

import workspace
from agents.prompts import SYSTEM_PROMPT
from agents.tools import TOOLS
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

# Future for ask_user tool — resolved when the user answers
_user_answer_future: asyncio.Future | None = None

# Browser errors collected during the agent's turn (written by ws_handlers, read by check_browser_errors tool)
_browser_errors: list[str] = []


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


# ---------------------------------------------------------------------------
# Prompt classifier — routes to appropriate model
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
    except Exception:
        pass
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

    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            # Truncate plain-string user messages if very long
            if isinstance(content, str) and len(content) > 10_000:
                msg["content"] = content[:10_000] + "\n...(truncated)"
            continue

        # --- Strip thinking blocks from assistant messages ---
        if msg.get("role") == "assistant":
            filtered = [
                block for block in content
                if not (isinstance(block, dict) and block.get("type") == "thinking")
            ]
            # Keep at least a placeholder so content is never empty
            if not filtered:
                filtered = [{"type": "text", "text": "(thinking only)"}]
            msg["content"] = filtered
            content = msg["content"]

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
    """Run the agent for one user prompt using the Anthropic API directly.

    Returns {"chat_text": str} with the agent's conversational reply.
    """
    await log("System", f"Starting agent for: \"{user_prompt}\"", "info")
    if files:
        file_names = ", ".join(f["name"] for f in files)
        await log("System", f"Files attached: {file_names}", "info")

    client = anthropic.AsyncAnthropic()

    # Classify prompt and choose model
    tier = await _classify_prompt(client, user_prompt)
    if tier == "complex":
        model_name = "claude-opus-4-6"
        max_tokens = 65536
    else:
        model_name = "claude-sonnet-4-6"
        max_tokens = 16384
    await log("System", f"Model: {model_name}", "info")

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

    try:
        while turns < _MAX_TURNS:
            turns += 1

            # Pre-flight compaction: estimate token count (~4 chars/token)
            # and compact if approaching the 200k input limit.
            _est_tokens = len(json.dumps(messages, ensure_ascii=False)) // 4
            if _est_tokens > 150_000:
                await log("System", f"Estimated ~{_est_tokens} tokens — compacting before API call...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)

            # Sanitize: remove any messages with empty content before API call
            messages[:] = [
                m for m in messages
                if m.get("content") not in (None, "", [], [{}])
            ]

            # Stream the API call so thinking/status updates reach the
            # frontend in real-time instead of blocking until completion.
            current_block_type = None
            thinking_chunks: list[str] = []
            thinking_len = 0

            try:
                async with client.messages.stream(
                    model=model_name,
                    max_tokens=max_tokens,
                    thinking={"type": "adaptive"},
                    system=SYSTEM_PROMPT,
                    tools=TOOLS,
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
                                    # Send periodic updates (~every 300 chars)
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
            except anthropic.BadRequestError as e:
                err_msg = str(e)
                # Thinking block compatibility issue (e.g., cross-model signatures)
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
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        await log("System", "Max compact retries — cannot reduce further", "error")
                        break
                    continue
                raise
            except (anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.APIStatusError) as e:
                # Connection dropped mid-stream or server error (5xx)
                if isinstance(e, anthropic.APIStatusError) and e.status_code < 500:
                    raise  # only retry server errors, not client errors
                compact_retries += 1
                if compact_retries > _MAX_COMPACT_RETRIES:
                    await log("System", f"API error after retries: {e}", "error")
                    raise
                await log("System", f"Connection interrupted — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                if on_status:
                    await on_status("thinking", "Connection lost, retrying...")
                await asyncio.sleep(2)
                continue
            except Exception as e:
                # Catch transient connection errors (e.g. httpx.RemoteProtocolError)
                err_str = str(e).lower()
                if any(k in err_str for k in ("incomplete chunked", "connection", "reset by peer", "timed out")):
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        await log("System", f"Connection error after retries: {e}", "error")
                        raise
                    await log("System", f"Connection interrupted — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                    if on_status:
                        await on_status("thinking", "Connection lost, retrying...")
                    await asyncio.sleep(2)
                    continue
                raise

            # Process completed response blocks (text, tool_use logging)
            for block in response.content:
                if block.type == "text":
                    last_text = block.text
                    await log("Agent", block.text, "info")
                    if on_text:
                        await on_text(block.text)
                elif block.type == "tool_use":
                    input_str = json.dumps(block.input)
                    if len(input_str) > 200:
                        input_str = input_str[:200] + "..."
                    await log("Agent", f"Tool: {block.name}({input_str})", "thinking")
                    if on_status:
                        await on_status("tool_use", block.name)

            # Append assistant message to history (serialize only API-accepted fields)
            assistant_content = []
            for block in response.content:
                if block.type == "thinking":
                    assistant_content.append({
                        "type": "thinking",
                        "thinking": block.thinking,
                        "signature": block.signature,
                    })
                elif block.type == "text":
                    assistant_content.append({
                        "type": "text",
                        "text": block.text,
                    })
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
            messages.append({"role": "assistant", "content": assistant_content})

            # If the response was cut off due to token limit, compact & retry
            if response.stop_reason == "max_tokens":
                compact_retries += 1
                if compact_retries > _MAX_COMPACT_RETRIES:
                    await log("System", "Max compact retries reached — using partial response", "info")
                    break
                await log("System", "Token limit reached — compacting conversation...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)
                messages.append({
                    "role": "user",
                    "content": "You were cut off due to token limit. Continue where you left off.",
                })
                continue

            # If the model stopped for a reason other than tool_use, check
            # for injected user messages before finishing.
            if response.stop_reason != "tool_use":
                injected = _drain_injected(injected_queue)
                if injected:
                    combined = "\n\n".join(injected)
                    await log("System", f"Injecting user message into conversation", "info")
                    messages.append({
                        "role": "user",
                        "content": f"[User message]: {combined}",
                    })
                    continue
                break

            # Execute tool calls and build tool_result messages
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    is_error = False
                    try:
                        result_str = await _handle_tool(block.name, block.input, broadcast)
                        # Detect error strings returned by _handle_tool
                        if result_str and result_str.startswith("Error"):
                            is_error = True
                    except Exception as e:
                        result_str = f"Error executing tool '{block.name}': {e}"
                        is_error = True
                        await log("System", result_str, "error")
                    tr = {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str or "(empty result)",
                    }
                    if is_error:
                        tr["is_error"] = True
                    tool_results.append(tr)

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
            messages.append({"role": "user", "content": user_content})

            # If approaching turn limit, tell the agent to wrap up
            if turns == _MAX_TURNS - 1:
                messages.append({
                    "role": "user",
                    "content": "You are running out of turns. Please provide your final response now — summarize what you accomplished and any remaining issues.",
                })

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


async def destroy_client(ws_id: int) -> None:
    """Clean up when a WebSocket disconnects."""
    # Don't clear — keep history so it survives refresh/reconnect
    pass
