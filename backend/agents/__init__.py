"""siljangnim agent package — public API re-exports."""

from agents.executor import (
    run_agent,
    reset_agent,
    destroy_client,
    load_conversations,
    get_debug_conversations,
    LogCallback,
)
from agents.handlers import BroadcastCallback
from agents.prompts import SYSTEM_PROMPT
from agents.tools import TOOLS

from agents import executor as _executor


def __getattr__(name):
    """Dynamic proxy for mutable executor state (e.g. _user_answer_future)."""
    if name == "_user_answer_future":
        return _executor._user_answer_future
    if name == "_browser_errors":
        return _executor._browser_errors
    raise AttributeError(f"module 'agents' has no attribute {name!r}")
