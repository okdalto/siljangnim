"""siljangnim agent package — public API re-exports."""

from agents.executor import (
    run_agent,
    reset_agent,
    load_conversations,
    get_debug_conversations,
    LogCallback,
)
from agents.handlers import BroadcastCallback
from agents.prompts import SYSTEM_PROMPT
from agents.tools import TOOLS

from agents import executor as _executor


def __getattr__(name):
    """Dynamic proxy for mutable executor state."""
    if name == "_user_answer_futures":
        return _executor._user_answer_futures
    if name == "_browser_errors":
        return _executor._browser_errors
    if name == "_browser_error_events":
        return _executor._browser_error_events
    raise AttributeError(f"module 'agents' has no attribute {name!r}")
