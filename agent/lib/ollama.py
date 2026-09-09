from urllib.parse import urlparse
from harnest import context
from harnest.model import LiteLLMLifecycle, LiteLLMModel


# Provisioned through an owner-authenticated endpoint; never persisted in sessions.
_connections = {}


def configure_connections(connections):
    updated = {}
    for connection in connections:
        if not isinstance(connection.get('id'), str) or connection.get('provider') != 'openai':
            raise ValueError('Invalid model connection')
        base = connection.get('base', '')
        parsed = urlparse(base)
        if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Invalid model endpoint')
        if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
            raise ValueError('Remote connections require HTTPS')
        key = connection.get('apiKey', '')
        if not isinstance(key, str) or len(key) > 8192 or '\n' in key or '\r' in key:
            raise ValueError('Invalid API key')
        updated[connection['id']] = dict(base=base, apiKey=key)
    _connections.clear()
    _connections.update(updated)


class DesktopModelRouting(LiteLLMLifecycle):
    async def before_request(self, request, model_context):
        metadata = context.current().metadata
        model = metadata.get("model", "")
        base = metadata.get("ollamaUrl", "http://127.0.0.1:11434")
        parsed = urlparse(base)
        if not isinstance(model, str) or not model.strip() or len(model) > 200:
            raise ValueError("Choose a model for this activity")
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
            raise ValueError("Invalid Ollama address")
        if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("Remote Ollama requires HTTPS")
        provider = metadata.get("provider", "ollama")
        if provider == "openai":
            connection = _connections.get(metadata.get("connectionId"))
            if not connection or connection['base'] != base:
                raise ValueError("Reconnect your model endpoint in Settings")
            request["model"] = "openai/" + model
            request["api_base"] = base
            # Explicit key prevents LiteLLM falling back to ambient provider credentials.
            request["api_key"] = connection['apiKey'] or 'dextana-keyless'
            return request
        if provider != "ollama":
            raise ValueError("Unknown model provider")
        request["model"] = "ollama_chat/" + model
        request["api_base"] = base
        reasoning = metadata.get("reasoning", "default")
        if reasoning not in ("default", "off", "on", "low", "medium", "high", "max"):
            raise ValueError("Invalid reasoning setting")
        if reasoning == "default" and model.startswith("gpt-oss"):
            reasoning = "medium"
        if reasoning != "default":
            # Ollama's native think field preserves booleans and effort levels.
            request["think"] = {"off": False, "on": True}.get(reasoning, reasoning)
        return request


def desktop_model():
    return LiteLLMModel("ollama_chat/dextana-selected-model", lifecycle=DesktopModelRouting())
