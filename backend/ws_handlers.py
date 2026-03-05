"""WebSocket message handlers for siljangnim.

Each handler is an ``async def handle_xxx(ws, msg, ctx)`` function.
A dispatch table ``HANDLERS`` maps message type strings to handlers.
"""

import asyncio
import json
import logging

import workspace
from workspace import DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG
import agents
import projects
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

# Patterns that indicate engine/infrastructure errors (NOT user script bugs).
# These should NOT trigger auto-fix because the agent can't fix them by editing scene.json.
_ENGINE_ERROR_PATTERNS = [
    "ResizeObserver",
    "VideoEncoder",
    "MediaRecorder",
    "MediaPipe",
    "captureStream",
    "WebSocket",
    "Failed to fetch",
    "net::ERR_",
    "NS_ERROR_",
    "NotAllowedError",
    "NotSupportedError",
    "AbortError",
    "QuotaExceededError",
    "recorder",
    "muxer",
    "mp4-muxer",
    "webm-muxer",
]


def _classify_error(message: str) -> str:
    """Classify a browser error as 'script' or 'engine'.

    Script errors are caused by the user's scene.json code and can be auto-fixed.
    Engine errors are infrastructure issues that the agent cannot fix via scene edits.
    """
    msg_lower = message.lower()
    for pattern in _ENGINE_ERROR_PATTERNS:
        if pattern.lower() in msg_lower:
            return "engine"
    return "script"


# ---------------------------------------------------------------------------
# Shared context — replaces main.py globals
# ---------------------------------------------------------------------------

@dataclass
class WsContext:
    api_key: str | None = None
    chat_history: list = field(default_factory=list)
    agent_busy: bool = False
    agent_task: asyncio.Task | None = None  # reference to running agent task
    pending_errors: list = field(default_factory=list)
    auto_fix_count: int = 0
    manager: object = None  # ConnectionManager instance
    AGENT_WS_ID: int = 0
    MAX_AUTO_FIX: int = 3
    injected_messages: asyncio.Queue = field(default_factory=asyncio.Queue)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _make_callbacks(ctx: WsContext):
    """Create the standard log/on_text/on_status callback triple."""
    async def log_callback(agent_name: str, message: str, level: str):
        await ctx.manager.broadcast({
            "type": "agent_log",
            "agent": agent_name,
            "message": message,
            "level": level,
        })

    async def on_text(text: str):
        ctx.chat_history.append({"role": "assistant", "text": text})
        await ctx.manager.broadcast({"type": "assistant_text", "text": text})

    async def on_status(status_type: str, detail: str):
        await ctx.manager.broadcast({
            "type": "agent_status",
            "status": status_type,
            "detail": detail,
        })

    return log_callback, on_text, on_status


def _drain_pending_errors(ctx: WsContext):
    """If pending console errors exist and auto-fix budget remains, fire auto-fix."""
    if ctx.pending_errors and ctx.auto_fix_count < ctx.MAX_AUTO_FIX:
        next_err = ctx.pending_errors.pop(0)
        ctx.pending_errors.clear()
        asyncio.create_task(_trigger_auto_fix(next_err, ctx))


async def _auto_save_project(msg: dict, ctx: WsContext) -> dict | None:
    """Auto-save the currently active project (shared by new_project / project_load).

    Returns the saved meta dict, or None if no save occurred.
    """
    name = msg.get("active_project")
    if not name:
        return None
    try:
        ws_data = msg.get("workspace_state")
        if ws_data:
            workspace.write_json("workspace_state.json", ws_data)
        debug_logs = msg.get("debug_logs")
        if debug_logs is not None:
            workspace.write_json("debug_logs.json", debug_logs)
        chat_history = msg.get("chat_history") or ctx.chat_history
        meta = projects.save_project(
            name=name,
            chat_history=chat_history,
            thumbnail_b64=msg.get("thumbnail"),
        )
        return meta
    except Exception as e:
        logger.warning("Auto-save failed for %s: %s", name, e)
        return None


async def _trigger_auto_fix(error_message: str, ctx: WsContext):
    """Trigger the agent to fix a runtime error automatically."""
    if ctx.agent_busy or not ctx.api_key:
        ctx.pending_errors.append(error_message)
        return

    ctx.auto_fix_count += 1
    prompt = (
        f"[Runtime Error] The script produced this error:\n"
        f"{error_message}\n"
        f"Please fix the script so this error no longer occurs."
    )
    ctx.chat_history.append({"role": "user", "text": prompt})
    ctx.agent_busy = True

    await ctx.manager.broadcast({"type": "assistant_text", "text": ""})
    await ctx.manager.broadcast({
        "type": "agent_log",
        "agent": "System",
        "message": f"Auto-fix #{ctx.auto_fix_count}: {error_message}",
        "level": "info",
    })

    log_callback, on_text, on_status = _make_callbacks(ctx)

    try:
        await agents.run_agent(
            ws_id=ctx.AGENT_WS_ID,
            user_prompt=prompt,
            log=log_callback,
            broadcast=ctx.manager.broadcast,
            on_text=on_text,
            on_status=on_status,
            files=[],
        )
        await ctx.manager.broadcast({"type": "chat_done"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        await ctx.manager.broadcast({
            "type": "agent_log",
            "agent": "System",
            "message": f"Auto-fix agent error: {e}",
            "level": "error",
        })
        await ctx.manager.broadcast({"type": "chat_done"})
    finally:
        ctx.agent_busy = False
        _drain_pending_errors(ctx)


# ---------------------------------------------------------------------------
# Handlers — each is async def handle_xxx(ws, msg, ctx)
# ---------------------------------------------------------------------------

async def handle_set_api_key(ws, msg, ctx: WsContext):
    import config
    key = msg.get("key", "").strip()
    provider = msg.get("provider", "anthropic")
    endpoint = msg.get("endpoint")
    base_url = msg.get("base_url")
    model = msg.get("model")
    max_tokens = msg.get("max_tokens")
    if isinstance(max_tokens, (int, float)):
        max_tokens = int(max_tokens)
    else:
        max_tokens = None
    context_window = msg.get("context_window")
    if isinstance(context_window, (int, float)):
        context_window = int(context_window)
    else:
        context_window = None
    # If no new key provided, fall back to the existing saved key for this provider
    if not key:
        key = config.get_api_key(provider) or ""
    valid, error = await config.validate_api_key(
        provider, key, endpoint, base_url=base_url, model=model,
    )
    if valid:
        config.save_api_key(provider, key, endpoint, base_url=base_url, model=model, max_tokens=max_tokens, context_window=context_window)
        ctx.api_key = key or "custom"  # custom provider may have empty key
        await ws.send_text(json.dumps({"type": "api_key_valid", "provider": provider, "config": config.get_saved_config()}))
    else:
        await ws.send_text(json.dumps({
            "type": "api_key_invalid",
            "error": error,
        }))


async def handle_prompt(ws, msg, ctx: WsContext):
    ctx.auto_fix_count = 0  # reset auto-fix counter on manual input
    if not ctx.api_key:
        await ws.send_text(json.dumps({"type": "api_key_required"}))
        return

    user_prompt = msg.get("text", "")

    if ctx.agent_busy:
        # Queue the message for injection at the next agent turn boundary
        if user_prompt.strip():
            ctx.injected_messages.put_nowait(user_prompt)
            ctx.chat_history.append({"role": "user", "text": user_prompt})
            await ctx.manager.broadcast({"type": "message_injected"})
        return

    # Process uploaded files
    from uploads import _process_uploads, _process_uploaded_files
    raw_files = msg.get("files", [])
    saved_files = []
    if raw_files:
        try:
            saved_files = _process_uploads(raw_files)
        except ValueError as e:
            await ws.send_text(json.dumps({
                "type": "agent_log",
                "agent": "System",
                "message": str(e),
                "level": "error",
            }))
            return

    history_entry = {"role": "user", "text": user_prompt}
    if saved_files:
        history_entry["files"] = [
            {"name": f["name"], "mime_type": f["mime_type"], "size": f["size"]}
            for f in saved_files
        ]
    ctx.chat_history.append(history_entry)

    log_callback, on_text, on_status = _make_callbacks(ctx)

    ctx.agent_busy = True

    async def _run_agent_task(
        _user_prompt=user_prompt,
        _log=log_callback,
        _on_text=on_text,
        _on_status=on_status,
        _files=saved_files,
    ):
        try:
            if _files:
                await ctx.manager.broadcast({
                    "type": "agent_log",
                    "agent": "System",
                    "message": f"Processing {len(_files)} uploaded file(s)...",
                    "level": "info",
                })
                await _process_uploaded_files(_files, ctx.manager.broadcast)
                await ctx.manager.broadcast({
                    "type": "agent_log",
                    "agent": "System",
                    "message": "File processing complete",
                    "level": "info",
                })

            await agents.run_agent(
                ws_id=ctx.AGENT_WS_ID,
                user_prompt=_user_prompt,
                log=_log,
                broadcast=ctx.manager.broadcast,
                on_text=_on_text,
                on_status=_on_status,
                files=_files,
                injected_queue=ctx.injected_messages,
            )

            await ctx.manager.broadcast({"type": "chat_done"})

        except asyncio.CancelledError:
            from agents.executor import _save_conversations
            _save_conversations()
            logger.info("Agent task cancelled by user")
            await ctx.manager.broadcast({"type": "chat_done"})

        except Exception as e:
            import traceback
            traceback.print_exc()

            # Build a user-friendly error message for common cases
            err_str = str(e).lower()
            if "timed out" in err_str or "timeout" in err_str:
                user_msg = "모델 서버 응답 대기 시간이 초과되었습니다. 모델이 너무 긴 응답을 생성 중이거나 서버가 과부하 상태일 수 있습니다. 다시 시도해 주세요."
            elif "incomplete chunked" in err_str or "peer closed" in err_str or ("connection" in err_str and "reset" in err_str):
                user_msg = "모델 서버와의 연결이 끊어졌습니다. 서버 로그를 확인하고 다시 시도해 주세요."
            elif "context length" in err_str or "too long" in err_str:
                user_msg = "입력이 모델의 컨텍스트 한도를 초과했습니다. 대화를 새로 시작하거나 --max-model-len을 늘려 보세요."
            else:
                user_msg = str(e)

            await ctx.manager.broadcast({
                "type": "agent_log",
                "agent": "System",
                "message": f"Agent error: {e}",
                "level": "error",
            })
            await ctx.manager.broadcast({
                "type": "assistant_text",
                "text": f"Error: {user_msg}",
            })
            await ctx.manager.broadcast({"type": "chat_done"})
        finally:
            ctx.agent_task = None
            ctx.agent_busy = False
            # Drain any unconsumed injected messages
            while not ctx.injected_messages.empty():
                try:
                    ctx.injected_messages.get_nowait()
                except asyncio.QueueEmpty:
                    break
            _drain_pending_errors(ctx)

    ctx.agent_task = asyncio.create_task(_run_agent_task())


async def handle_user_answer(ws, msg, ctx: WsContext):
    answer_text = msg.get("text", "")
    future = agents._user_answer_futures.get(ctx.AGENT_WS_ID)
    if future and not future.done():
        future.set_result(answer_text)


async def handle_console_error(ws, msg, ctx: WsContext):
    error_msg = msg.get("message", "")
    if not error_msg:
        pass
    elif ctx.agent_busy:
        # Classify and tag the error for the agent
        error_type = _classify_error(error_msg)
        tagged = f"[{error_type}] {error_msg}" if error_type == "engine" else error_msg
        if tagged not in ctx.pending_errors:
            ctx.pending_errors.append(tagged)
        # Also push to per-session list so the agent can check via check_browser_errors tool
        ws_errors = agents._browser_errors.setdefault(ctx.AGENT_WS_ID, [])
        if tagged not in ws_errors:
            ws_errors.append(tagged)
        # Signal the waiting event so check_browser_errors returns immediately
        event = agents._browser_error_events.get(ctx.AGENT_WS_ID)
        if event:
            event.set()
    else:
        # Log to debug panel only — no auto-fix
        await ctx.manager.broadcast({
            "type": "agent_log",
            "agent": "System",
            "message": f"Browser error: {error_msg}",
            "level": "warning",
        })


async def handle_set_uniform(ws, msg, ctx: WsContext):
    uniform = msg.get("uniform")
    value = msg.get("value")
    if uniform is not None and value is not None:
        try:
            scene = workspace.read_json("scene.json")
            if "uniforms" not in scene:
                scene["uniforms"] = {}
            if uniform in scene["uniforms"]:
                scene["uniforms"][uniform]["value"] = value
            else:
                if isinstance(value, list):
                    utype = f"vec{len(value)}"
                elif isinstance(value, bool):
                    utype = "bool"
                else:
                    utype = "float"
                scene["uniforms"][uniform] = {"type": utype, "value": value}
            workspace.write_json("scene.json", scene)
        except FileNotFoundError:
            pass


async def handle_update_workspace_state(ws, msg, ctx: WsContext):
    ws_data = msg.get("workspace_state", {})
    if ws_data:
        workspace.write_json("workspace_state.json", ws_data)


async def handle_new_chat(ws, msg, ctx: WsContext):
    ctx.chat_history.clear()
    await agents.reset_agent(ctx.AGENT_WS_ID)
    await ws.send_text(json.dumps({
        "type": "agent_log",
        "agent": "System",
        "message": "Chat history cleared",
        "level": "info",
    }))


async def handle_new_project(ws, msg, ctx: WsContext):
    await _auto_save_project(msg, ctx)

    ctx.chat_history.clear()
    await agents.reset_agent(ctx.AGENT_WS_ID)

    workspace.new_untitled_workspace()

    workspace.write_json("scene.json", DEFAULT_SCENE_JSON)
    workspace.write_json("ui_config.json", DEFAULT_UI_CONFIG)
    workspace.write_json("panels.json", {})

    await ctx.manager.broadcast({
        "type": "init",
        "scene_json": DEFAULT_SCENE_JSON,
        "ui_config": DEFAULT_UI_CONFIG,
        "projects": projects.list_projects(),
        "workspace_state": {},
        "panels": {},
        "debug_logs": [],
    })


async def handle_project_save(ws, msg, ctx: WsContext):
    try:
        ws_data = msg.get("workspace_state")
        if ws_data:
            workspace.write_json("workspace_state.json", ws_data)
        debug_logs = msg.get("debug_logs")
        if debug_logs is not None:
            workspace.write_json("debug_logs.json", debug_logs)
        thumbnail_b64 = msg.get("thumbnail")
        # Prefer frontend-provided chat_history (survives server restarts)
        chat_history = msg.get("chat_history") or ctx.chat_history
        meta = projects.save_project(
            name=msg.get("name", "untitled"),
            chat_history=chat_history,
            description=msg.get("description", ""),
            thumbnail_b64=thumbnail_b64,
        )
        await ws.send_text(json.dumps({
            "type": "project_saved",
            "meta": meta,
        }))
        await ctx.manager.broadcast({
            "type": "project_list",
            "projects": projects.list_projects(),
        })
    except Exception as e:
        await ws.send_text(json.dumps({
            "type": "project_save_error",
            "error": str(e),
        }))


async def handle_project_load(ws, msg, ctx: WsContext):
    saved_meta = await _auto_save_project(msg, ctx)
    if saved_meta:
        await ctx.manager.broadcast({
            "type": "project_list",
            "projects": projects.list_projects(),
        })
    try:
        result = projects.load_project(msg.get("name", ""))
        ctx.chat_history.clear()
        ctx.chat_history.extend(result["chat_history"])
        agents.load_conversations()
        await ws.send_text(json.dumps({
            "type": "project_loaded",
            **result,
        }))
    except Exception as e:
        await ws.send_text(json.dumps({
            "type": "project_load_error",
            "error": str(e),
        }))


async def handle_project_list(ws, msg, ctx: WsContext):
    await ws.send_text(json.dumps({
        "type": "project_list",
        "projects": projects.list_projects(),
    }))


async def handle_project_delete(ws, msg, ctx: WsContext):
    try:
        projects.delete_project(msg.get("name", ""))
        await ctx.manager.broadcast({
            "type": "project_list",
            "projects": projects.list_projects(),
        })
    except Exception as e:
        await ws.send_text(json.dumps({
            "type": "project_delete_error",
            "error": str(e),
        }))


async def handle_close_panel(ws, msg, ctx: WsContext):
    """Remove a panel from panels.json and broadcast close."""
    panel_id = msg.get("id", "")
    if not panel_id:
        return
    try:
        panels = workspace.read_json("panels.json")
        if panel_id in panels:
            del panels[panel_id]
            workspace.write_json("panels.json", panels)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    await ctx.manager.broadcast({"type": "close_panel", "id": panel_id})


async def handle_restore_panel(ws, msg, ctx: WsContext):
    """Restore a previously closed panel back into panels.json."""
    panel_id = msg.get("id", "")
    panel_data = msg.get("data", {})
    if not panel_id:
        return
    try:
        panels = workspace.read_json("panels.json")
    except (FileNotFoundError, json.JSONDecodeError):
        panels = {}
    panels[panel_id] = panel_data
    workspace.write_json("panels.json", panels)


async def handle_cancel_agent(ws, msg, ctx: WsContext):
    """Cancel the currently running agent task."""
    if ctx.agent_task and not ctx.agent_task.done():
        # Cancel the user_answer_future if pending (e.g. ask_user wait)
        future = agents._user_answer_futures.get(ctx.AGENT_WS_ID)
        if future and not future.done():
            future.cancel()
        ctx.agent_task.cancel()
        logger.info("Agent cancel requested by user")


async def handle_request_state(ws, msg, ctx: WsContext):
    import config
    try:
        s = workspace.read_json("scene.json")
        u = workspace.read_json("ui_config.json")
    except FileNotFoundError:
        s, u = DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG
    try:
        ws_state = workspace.read_json("workspace_state.json")
    except FileNotFoundError:
        ws_state = {}
    panels_data = workspace.ensure_default_panels(u)

    await ws.send_text(json.dumps({
        "type": "init",
        "scene_json": s,
        "ui_config": u,
        "projects": projects.list_projects(),
        "workspace_state": ws_state,
        "panels": panels_data,
        "api_config": config.get_saved_config(),
    }))


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------

HANDLERS = {
    "set_api_key": handle_set_api_key,
    "prompt": handle_prompt,
    "user_answer": handle_user_answer,
    "console_error": handle_console_error,
    "set_uniform": handle_set_uniform,
    "update_workspace_state": handle_update_workspace_state,
    "new_chat": handle_new_chat,
    "new_project": handle_new_project,
    "project_save": handle_project_save,
    "project_load": handle_project_load,
    "project_list": handle_project_list,
    "project_delete": handle_project_delete,
    "close_panel": handle_close_panel,
    "restore_panel": handle_restore_panel,
    "cancel_agent": handle_cancel_agent,
    "request_state": handle_request_state,
}
