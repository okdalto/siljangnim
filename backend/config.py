"""
API key and provider management for siljangnim.

Supports multiple AI providers (Anthropic Claude, GLM/Zhipu AI).
Reads/writes configuration from backend/.env using python-dotenv.
"""

import os
from pathlib import Path

from dotenv import load_dotenv, set_key
import anthropic

ENV_PATH = Path(__file__).resolve().parent / ".env"

# Default GLM endpoints
GLM_ENDPOINTS = {
    "open.bigmodel.cn": "https://open.bigmodel.cn/api/paas/v4/",
    "api.z.ai": "https://api.z.ai/api/paas/v4/",
}

# In-memory cache of current provider state
_current_provider: str = "anthropic"
_glm_base_url: str = GLM_ENDPOINTS["open.bigmodel.cn"]


def load_config() -> str | None:
    """Load all config from backend/.env into os.environ.

    Returns the API key for the active provider (or None).
    """
    global _current_provider, _glm_base_url
    load_dotenv(ENV_PATH, override=True)
    _current_provider = os.environ.get("AI_PROVIDER", "anthropic")
    _glm_base_url = os.environ.get(
        "GLM_BASE_URL", GLM_ENDPOINTS["open.bigmodel.cn"]
    )
    if _current_provider == "glm":
        return os.environ.get("GLM_API_KEY")
    return os.environ.get("ANTHROPIC_API_KEY")


def get_provider() -> str:
    """Return the currently active provider name ('anthropic' or 'glm')."""
    return _current_provider


def get_api_key(provider: str | None = None) -> str | None:
    """Return the API key for the given provider (defaults to active)."""
    provider = provider or _current_provider
    if provider == "glm":
        return os.environ.get("GLM_API_KEY")
    return os.environ.get("ANTHROPIC_API_KEY")


def get_glm_base_url() -> str:
    """Return the GLM base URL."""
    return _glm_base_url


def save_api_key(provider: str, key: str, endpoint: str | None = None) -> None:
    """Persist the API key for a provider to backend/.env and set it in the current process."""
    global _current_provider, _glm_base_url
    ENV_PATH.touch(exist_ok=True)

    if provider == "glm":
        set_key(str(ENV_PATH), "GLM_API_KEY", key)
        os.environ["GLM_API_KEY"] = key
        if endpoint and endpoint in GLM_ENDPOINTS:
            _glm_base_url = GLM_ENDPOINTS[endpoint]
        elif endpoint:
            _glm_base_url = endpoint
        set_key(str(ENV_PATH), "GLM_BASE_URL", _glm_base_url)
        os.environ["GLM_BASE_URL"] = _glm_base_url
    else:
        set_key(str(ENV_PATH), "ANTHROPIC_API_KEY", key)
        os.environ["ANTHROPIC_API_KEY"] = key

    _current_provider = provider
    set_key(str(ENV_PATH), "AI_PROVIDER", provider)
    os.environ["AI_PROVIDER"] = provider


async def validate_api_key(provider: str, key: str, endpoint: str | None = None) -> tuple[bool, str]:
    """Validate an API key for the given provider. Returns (valid, error_message)."""
    if provider == "glm":
        return await _validate_glm_key(key, endpoint)
    return await _validate_anthropic_key(key)


async def _validate_anthropic_key(key: str) -> tuple[bool, str]:
    """Make a minimal Claude API call to verify the key."""
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


async def _validate_glm_key(key: str, endpoint: str | None = None) -> tuple[bool, str]:
    """Make a minimal GLM API call to verify the key."""
    try:
        import openai
        base_url = GLM_ENDPOINTS.get(endpoint, _glm_base_url) if endpoint else _glm_base_url
        client = openai.AsyncOpenAI(api_key=key, base_url=base_url)
        await client.chat.completions.create(
            model="glm-4-plus",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return True, ""
    except Exception as e:
        err_str = str(e).lower()
        if "auth" in err_str or "api key" in err_str or "401" in err_str:
            return False, "Invalid API key"
        if "connect" in err_str:
            return False, "Could not connect to GLM API"
        return False, str(e)
