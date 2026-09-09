"""Discover deployment limits and reserve room before every model request.

Token counts for arbitrary compatible endpoints can still be estimates. Reserve
output and one safety margin in tokens. A byte fallback is only for unknown limits.
"""
import asyncio
import json
import re
import time
import httpx
from harnest.lib.model_context import MAX_CONTEXT_BYTES, request_size


_cache = {}


def positive(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and 512 <= value <= 10_000_000 else None


def catalog_window(item):
    advertised = [positive(item.get(name)) for name in
        ('context_length', 'context_window', 'max_model_len', 'max_input_tokens')]
    # A router may advertise a larger model window than its selected provider.
    provider = item.get('top_provider')
    if isinstance(provider, dict):
        advertised.append(positive(provider.get('context_length')))
    return min((value for value in advertised if value), default=None)


async def resolve_context_window(request):
    model = request['model'].split('/', 1)[-1]
    base = request['api_base'].rstrip('/')
    # Do not share authenticated catalog results across connections.
    key = (base, request['model'], request.get('api_key', ''), json.dumps(request.get('extra_headers', {}), sort_keys=True, default=str))
    cached = _cache.get(key)
    if cached and cached[1] is not None and time.monotonic() - cached[0] < 60:
        return cached[1]
    window = None
    try:
        async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
            if request['model'].startswith('ollama_chat/'):
                async def read(method, path, **kwargs):
                    response = await client.request(method, base + path, **kwargs)
                    response.raise_for_status()
                    return response.json()
                results = await asyncio.gather(read('GET', '/api/ps'),
                    read('POST', '/api/show', json=dict(model=model)), return_exceptions=True)
                running, details = [value if isinstance(value, dict) else {} for value in results]
                matches = {model, model + ':latest'}
                loaded = next((item for item in running.get('models', []) if item.get('name') in matches or item.get('model') in matches), {})
                actual = positive(loaded.get('context_length'))
                info = details.get('model_info') or {}
                maximum = positive(info.get(str(info.get('general.architecture', '')) + '.context_length'))
                if maximum is None:
                    maximum = next((positive(value) for name, value in info.items() if name.endswith('.context_length') and positive(value)), None)
                parameter = re.search(r'^\s*num_ctx\s+(\d+)\s*$', details.get('parameters') or '', re.M)
                configured = positive(int(parameter[1])) if parameter else None
                cloud = bool(details.get('remote_host') or details.get('remote_model') or model.endswith(':cloud') or base == 'https://ollama.com')
                # The architecture's maximum is not the running allocation.
                # Missing metadata (including an unloaded model) must not turn
                # into an invented 4K limit that rejects an ordinary request.
                window = actual or configured or (maximum if cloud else None)
                if maximum and window:
                    window = min(window, maximum)
            else:
                headers = request.get('extra_headers')
                if headers is None:
                    headers = {'Authorization': 'Bearer ' + request['api_key']}
                response = await client.get(base + '/models', headers={key: value for key, value in headers.items() if isinstance(value, str)})
                response.raise_for_status()
                item = next((item for item in response.json().get('data', []) if item.get('id') == model), {})
                window = catalog_window(item)
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        pass
    if window is None and not request['model'].startswith('ollama_chat/'):
        # Some standard compatible catalogs expose IDs only. Use installed
        # provider metadata when recognized, never invent a window for an alias.
        from litellm import model_cost
        info = model_cost.get(request['model']) or model_cost.get(model) or {}
        window = positive(info.get('max_input_tokens'))
    # Unknown allocations retain the byte fallback. Recheck on the
    # next request: an unloaded model may now appear in /ps with its real limit.
    if len(_cache) >= 64:
        _cache.clear()
    _cache[key] = (time.monotonic(), window)
    return window


class ContextBudget:
    def __init__(self, window=None, output=None):
        self.window = positive(window)
        reserve = min(4096, self.window // 4) if self.window else 0
        self.output = min(output if type(output) is int and output > 0 else reserve, self.window // 2) if self.window else None
        self.limit = max(256, int((self.window - self.output) * .9)) if self.window else MAX_CONTEXT_BYTES

    def size(self, request):
        if not self.window:
            return request_size(request)
        try:
            from litellm import token_counter
            # Let LiteLLM select the model tokenizer, with its generic fallback
            # for unknown aliases. Count schemas and images as well as messages.
            model = request.get('model') or 'gpt-4'
            count = token_counter(model=model, messages=request.get('messages', []), tools=request.get('tools') or None,
                tool_choice=request.get('tool_choice'), use_default_image_token_count=True, default_token_count=4096)
            if request.get('response_format'):
                count += token_counter(model=model, text=json.dumps(request['response_format'], ensure_ascii=False))
            if not isinstance(count, int) or count <= 0:
                raise ValueError('Tokenizer returned no input count')
            return count
        except Exception:
            # UTF-8 bytes remain a conservative token upper bound if counting
            # fails, but are compared with THIS model's budget, never a 192 KB cap.
            return request_size(request)

    def fits(self, request):
        return self.size(request) <= self.limit


def budget_for(request):
    return ContextBudget(request.get('_dextana_context_window'), request.get('max_tokens'))
