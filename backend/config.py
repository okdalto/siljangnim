"""
API key and provider management for siljangnim.

Supports multiple AI providers:
  - anthropic (Claude)
  - openai (GPT-4o, etc.)
  - gemini (Google Gemini via OpenAI-compatible endpoint)
  - glm (Zhipu AI via OpenAI-compatible endpoint)
  - custom (any OpenAI-compatible server: vLLM, Ollama, TGI, etc.)

Reads/writes configuration from backend/.env using python-dotenv.
"""

import os
from pathlib import Path

from dotenv import load_dotenv, set_key
import anthropic
import openai

ENV_PATH = Path(__file__).resolve().parent / ".env"

# Provider definitions: env key name, default base_url (None = SDK default)
PROVIDERS = {
    "anthropic": {
        "env_key": "ANTHROPIC_API_KEY",
        "base_url": None,
    },
    "openai": {
        "env_key": "OPENAI_API_KEY",
        "base_url": None,  # SDK default: https://api.openai.com/v1
    },
    "gemini": {
        "env_key": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    },
    "glm": {
        "env_key": "GLM_API_KEY",
        "base_url": None,  # resolved from GLM_ENDPOINTS
    },
    "custom": {
        "env_key": "CUSTOM_API_KEY",
        "base_url": None,  # resolved from CUSTOM_BASE_URL env
    },
}

# GLM has user-selectable endpoints
GLM_ENDPOINTS = {
    "open.bigmodel.cn": "https://open.bigmodel.cn/api/paas/v4/",
    "api.z.ai": "https://api.z.ai/api/paas/v4/",
}

# In-memory cache of current provider state
_current_provider: str = "anthropic"
_glm_base_url: str = GLM_ENDPOINTS["open.bigmodel.cn"]
_custom_base_url: str = "http://localhost:8000/v1/"
_custom_model: str = ""
_custom_max_tokens: int = 4096
_custom_context_window: int = 32768


def load_config() -> str | None:
    """Load all config from backend/.env into os.environ.

    Returns the API key for the active provider (or None).
    """
    global _current_provider, _glm_base_url, _custom_base_url, _custom_model, _custom_max_tokens, _custom_context_window
    load_dotenv(ENV_PATH, override=True)
    _current_provider = os.environ.get("AI_PROVIDER", "anthropic")
    _glm_base_url = os.environ.get(
        "GLM_BASE_URL", GLM_ENDPOINTS["open.bigmodel.cn"]
    )
    _custom_base_url = os.environ.get("CUSTOM_BASE_URL", "http://localhost:8000/v1/")
    _custom_model = os.environ.get("CUSTOM_MODEL", "")
    try:
        _custom_max_tokens = int(os.environ.get("CUSTOM_MAX_TOKENS", "4096"))
    except (ValueError, TypeError):
        _custom_max_tokens = 4096
    try:
        _custom_context_window = int(os.environ.get("CUSTOM_CONTEXT_WINDOW", "32768"))
    except (ValueError, TypeError):
        _custom_context_window = 32768
    return get_api_key(_current_provider)


def get_provider() -> str:
    """Return the currently active provider name."""
    return _current_provider


def get_api_key(provider: str | None = None) -> str | None:
    """Return the API key for the given provider (defaults to active)."""
    provider = provider or _current_provider
    info = PROVIDERS.get(provider)
    if not info:
        return None
    return os.environ.get(info["env_key"])


def get_base_url(provider: str | None = None) -> str | None:
    """Return the base URL for the given provider.

    Returns None if the provider should use its SDK default.
    """
    provider = provider or _current_provider
    if provider == "glm":
        return _glm_base_url
    if provider == "custom":
        return _custom_base_url
    info = PROVIDERS.get(provider)
    return info["base_url"] if info else None


def get_custom_model() -> str:
    """Return the custom provider's model name."""
    return _custom_model


def get_custom_max_tokens() -> int:
    """Return the custom provider's max_tokens setting."""
    return _custom_max_tokens


def get_custom_context_window() -> int:
    """Return the custom provider's context window size."""
    return _custom_context_window


def get_saved_config() -> dict:
    """Return the current config state (without the API key itself)."""
    return {
        "provider": _current_provider,
        "has_key": bool(get_api_key()),
        "provider_keys": {
            pid: bool(get_api_key(pid))
            for pid in PROVIDERS
        },
        "endpoint": next((k for k, v in GLM_ENDPOINTS.items() if v == _glm_base_url), None),
        "base_url": _custom_base_url,
        "model": _custom_model,
        "max_tokens": _custom_max_tokens,
        "context_window": _custom_context_window,
    }


def save_api_key(
    provider: str,
    key: str,
    endpoint: str | None = None,
    *,
    base_url: str | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
    context_window: int | None = None,
) -> None:
    """Persist the API key for a provider to backend/.env and set it in the current process."""
    global _current_provider, _glm_base_url, _custom_base_url, _custom_model, _custom_max_tokens, _custom_context_window
    ENV_PATH.touch(exist_ok=True)

    info = PROVIDERS.get(provider)
    if not info:
        raise ValueError(f"Unknown provider: {provider}")

    # Save the key
    set_key(str(ENV_PATH), info["env_key"], key)
    os.environ[info["env_key"]] = key

    # GLM endpoint handling
    if provider == "glm":
        if endpoint and endpoint in GLM_ENDPOINTS:
            _glm_base_url = GLM_ENDPOINTS[endpoint]
        elif endpoint:
            _glm_base_url = endpoint
        set_key(str(ENV_PATH), "GLM_BASE_URL", _glm_base_url)
        os.environ["GLM_BASE_URL"] = _glm_base_url

    # Custom provider handling
    if provider == "custom":
        if base_url:
            _custom_base_url = base_url
        if model:
            _custom_model = model
        if max_tokens is not None:
            _custom_max_tokens = max_tokens
        if context_window is not None:
            _custom_context_window = context_window
        set_key(str(ENV_PATH), "CUSTOM_BASE_URL", _custom_base_url)
        os.environ["CUSTOM_BASE_URL"] = _custom_base_url
        set_key(str(ENV_PATH), "CUSTOM_MODEL", _custom_model)
        os.environ["CUSTOM_MODEL"] = _custom_model
        set_key(str(ENV_PATH), "CUSTOM_MAX_TOKENS", str(_custom_max_tokens))
        os.environ["CUSTOM_MAX_TOKENS"] = str(_custom_max_tokens)
        set_key(str(ENV_PATH), "CUSTOM_CONTEXT_WINDOW", str(_custom_context_window))
        os.environ["CUSTOM_CONTEXT_WINDOW"] = str(_custom_context_window)

    # Set active provider
    _current_provider = provider
    set_key(str(ENV_PATH), "AI_PROVIDER", provider)
    os.environ["AI_PROVIDER"] = provider


async def validate_api_key(
    provider: str,
    key: str,
    endpoint: str | None = None,
    *,
    base_url: str | None = None,
    model: str | None = None,
) -> tuple[bool, str]:
    """Validate an API key for the given provider. Returns (valid, error_message)."""
    if provider == "anthropic":
        return await _validate_anthropic_key(key)
    if provider == "openai":
        return await _validate_openai_key(key)
    if provider == "gemini":
        return await _validate_gemini_key(key)
    if provider == "glm":
        return await _validate_glm_key(key, endpoint)
    if provider == "custom":
        return await _validate_custom(key, base_url, model)
    return False, f"Unknown provider: {provider}"


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


async def _validate_openai_key(key: str) -> tuple[bool, str]:
    """Make a minimal OpenAI API call to verify the key."""
    try:
        client = openai.AsyncOpenAI(api_key=key)
        await client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return True, ""
    except openai.AuthenticationError:
        return False, "Invalid API key"
    except openai.APIConnectionError:
        return False, "Could not connect to OpenAI API"
    except Exception as e:
        return False, str(e)


async def _validate_gemini_key(key: str) -> tuple[bool, str]:
    """Make a minimal Gemini API call via OpenAI-compatible endpoint."""
    try:
        client = openai.AsyncOpenAI(
            api_key=key,
            base_url=PROVIDERS["gemini"]["base_url"],
        )
        await client.chat.completions.create(
            model="gemini-2.5-flash",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return True, ""
    except Exception as e:
        err_str = str(e).lower()
        if "api key" in err_str or "401" in err_str or "403" in err_str or "permission" in err_str:
            return False, "Invalid API key"
        if "connect" in err_str:
            return False, "Could not connect to Gemini API"
        return False, str(e)


async def _validate_glm_key(key: str, endpoint: str | None = None) -> tuple[bool, str]:
    """Make a minimal GLM API call to verify the key."""
    try:
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


async def _validate_custom(key: str, base_url: str | None, model: str | None) -> tuple[bool, str]:
    """Validate a custom OpenAI-compatible endpoint by making a test call."""
    if not base_url:
        return False, "Base URL is required"
    if not model:
        return False, "Model name is required"
    try:
        # Some local servers don't require an API key; use a placeholder
        client = openai.AsyncOpenAI(api_key=key or "not-needed", base_url=base_url)
        await client.chat.completions.create(
            model=model,
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return True, ""
    except openai.APIConnectionError:
        return False, f"Could not connect to {base_url}"
    except Exception as e:
        err_str = str(e).lower()
        if "model" in err_str and ("not found" in err_str or "does not exist" in err_str):
            return False, f"Model '{model}' not found on server"
        if "connect" in err_str or "refused" in err_str:
            return False, f"Could not connect to {base_url}"
        return False, str(e)
