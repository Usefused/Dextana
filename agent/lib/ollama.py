from urllib.parse import urlparse
from harnest import context
from harnest.model import LiteLLMLifecycle, LiteLLMModel


class DesktopModelRouting(LiteLLMLifecycle):
    async def before_request(self, request, model_context):
        metadata = context.current().metadata
        model = metadata.get("model", "")
        base = metadata.get("ollamaUrl", "http://127.0.0.1:11434")
        parsed = urlparse(base)
        if not isinstance(model, str) or not model.strip() or len(model) > 200:
            raise ValueError("Choose an Ollama model for this activity")
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
            raise ValueError("Invalid Ollama address")
        if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("Remote Ollama requires HTTPS")
        request["model"] = "ollama_chat/" + model
        request["api_base"] = base
        return request


def desktop_model():
    return LiteLLMModel("ollama_chat/dextana-selected-model", lifecycle=DesktopModelRouting())
