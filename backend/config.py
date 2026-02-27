"""
API key management for PromptGL.

Reads/writes ANTHROPIC_API_KEY from backend/.env using python-dotenv.
"""

import os
from pathlib import Path

from dotenv import load_dotenv, set_key
import anthropic

ENV_PATH = Path(__file__).resolve().parent / ".env"


def load_api_key() -> str | None:
    """Load ANTHROPIC_API_KEY from backend/.env into os.environ. Returns the key or None."""
    load_dotenv(ENV_PATH, override=True)
    return os.environ.get("ANTHROPIC_API_KEY")


def save_api_key(key: str) -> None:
    """Persist the API key to backend/.env and set it in the current process."""
    ENV_PATH.touch(exist_ok=True)
    set_key(str(ENV_PATH), "ANTHROPIC_API_KEY", key)
    os.environ["ANTHROPIC_API_KEY"] = key


async def validate_api_key(key: str) -> tuple[bool, str]:
    """Make a minimal Claude API call to verify the key. Returns (valid, error_message)."""
    try:
        client = anthropic.AsyncAnthropic(api_key=key)
        await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return True, ""
    except anthropic.AuthenticationError:
        return False, "Invalid API key"
    except anthropic.APIConnectionError:
        return False, "Could not connect to Anthropic API"
    except Exception as e:
        return False, str(e)
