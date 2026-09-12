from urllib.parse import urlparse
from datetime import datetime
from zoneinfo import ZoneInfo
from contextvars import ContextVar
import os
from harnest import context
from harnest.model import LiteLLMLifecycle, LiteLLMModel
from harnest.lib.model_context import compact_context, without_thinking, request_size
from harnest.lib.context_budget import budget_for, resolve_context_window
from harnest.lib.model_limits import context_limit_error


# Provisioned through an owner-authenticated endpoint; never persisted in sessions.
_connections = {}
_forced_context_bytes = ContextVar('dextana_forced_context_bytes', default=None)
RECOVERY_CONTEXT_BYTES = 128_000


class ContextRecoveryStream:
    """Retry a stream only when the provider rejects it before yielding output."""
    def __init__(self, source, retry):
        self.source = source
        self.iterator = source.__aiter__()
        self.retry = retry
        self.started = False
        self.retried = False

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            value = await self.iterator.__anext__()
            self.started = True
            return value
        except Exception as error:
            if self.started or self.retried or not context_limit_error(error):
                raise
            self.retried = True
            self.source = await self.retry()
            self.iterator = self.source.__aiter__()
            return await self.__anext__()

    async def aclose(self):
        closer = getattr(self.iterator, 'aclose', None)
        if closer:
            await closer()


class ContextRecoveryClient:
    """Retry one rejected model call with forced context compaction."""
    def __init__(self, delegate):
        self.delegate = delegate

    def __getattr__(self, name):
        return getattr(self.delegate, name)

    async def retry(self, arguments):
        token = _forced_context_bytes.set(RECOVERY_CONTEXT_BYTES)
        try:
            return await self.delegate.acompletion(**arguments)
        finally:
            _forced_context_bytes.reset(token)

    async def acompletion(self, **arguments):
        try:
            result = await self.delegate.acompletion(**arguments)
        except Exception as error:
            if not context_limit_error(error):
                raise
            return await self.retry(arguments)
        if hasattr(result, '__aiter__'):
            return ContextRecoveryStream(result, lambda: self.retry(arguments))
        return result


class ContextRecoveryModel(LiteLLMModel):
    def build(self):
        model = super().build()
        model.llm_client = ContextRecoveryClient(model.llm_client)
        return model


def validate_endpoint(base):
    parsed = urlparse(base)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Invalid model endpoint')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Remote connections require HTTPS')
    return base


def connection(metadata):
    base = validate_endpoint(metadata.get('ollamaUrl', 'http://127.0.0.1:11434'))
    if metadata.get('provider', 'ollama') == 'ollama':
        return dict(base=base, apiKey='')
    if metadata.get('provider') != 'openai':
        raise ValueError('Unknown model provider')
    saved = _connections.get(metadata.get('connectionId'))
    if not saved or saved['base'] != base:
        raise ValueError('Reconnect your model endpoint in Settings')
    return saved


def configure_connections(connections):
    from harnest.lib.model_auth import auth_config
    updated = {}
    for connection in connections:
        if not isinstance(connection.get('id'), str) or connection.get('provider') != 'openai':
            raise ValueError('Invalid model connection')
        base = validate_endpoint(connection.get('base', ''))
        key = connection.get('apiKey', '')
        if not isinstance(key, str) or len(key) > 8192 or '\n' in key or '\r' in key:
            raise ValueError('Invalid API key')
        updated[connection['id']] = dict(base=base, apiKey=key, auth=auth_config(connection.get('auth')))
    _connections.clear()
    _connections.update(updated)


class DesktopModelRouting(LiteLLMLifecycle):
    async def prepare_context(self, request, runtime_context=None):
        request = without_thinking(request)
        budget = budget_for(request)
        forced = _forced_context_bytes.get()
        def outgoing(value):
            return {**value, 'messages': [*value['messages'], runtime_context]} if runtime_context else value
        def size(value):
            return request_size(outgoing(value)) if forced else budget.size(outgoing(value))
        # Even a raw request that fits may already have durable compacted
        # history. Reuse it before deciding whether another summary is needed.
        try:
            store = context.session.namespace('dextana')
        except RuntimeError:
            if size(request) <= budget.limit:
                return outgoing(request)
            raise
        active = context.current()
        backend, activity = None, None
        def report(message):
            nonlocal backend, activity
            if backend is None:
                from harnest.lib.activities import service
                backend = service()
                activity = next((item for item in backend.state['activities'] if item.get('runtimeSessionId') == active.session_id), None)
            if activity:
                if message.startswith('Compacting '):
                    activity['compacting'] = True
                activity['events'].append(message)
                backend.commit()
        try:
            limit = budget.limit
            if forced:
                limit = min(forced, max(1024, size(request) - 1))
                report('The model reached its provider input limit; compacting context and retrying once.')
            prepared = await compact_context(request, store, report=report, max_bytes=limit, size=size)
            return outgoing(prepared)
        except ValueError as error:
            if budget.window:
                raise ValueError(f'This request cannot fit the selected model’s {budget.window:,}-token context window. '
                    'Increase the configured context length, choose a model with more context, or reduce the current input. '
                    'Your saved conversation has not been changed.') from error
            raise
        finally:
            if activity and activity.pop('compacting', False):
                backend.commit()

    async def restore_history(self, request, backend):
        active = context.current()
        store = context.session.namespace('dextana')
        pending = backend.restored_contexts.get(active.session_id)
        if pending is not None:
            await store.set('restored_history', pending)
            backend.restored_contexts.pop(active.session_id, None)
        history = pending if pending is not None else await store.get('restored_history', [])
        if not history:
            return request
        messages = request.get('messages', [])
        system = [m for m in messages if m.get('role') in ('system', 'developer')]
        turns = [m for m in messages if m.get('role') not in ('system', 'developer')]
        return {**request, 'messages': system + history + turns}

    async def before_request(self, request, model_context):
        zone = os.environ.get('DEXTANA_TIMEZONE', 'UTC')
        # Volatile metadata belongs at the request tail, outside durable history
        # and compaction fingerprints. Keep the instruction/history prefix stable
        # for providers that cache prefixes, while still sending an accurate clock.
        clock = dict(role='system', content='Current local time: ' + datetime.now(ZoneInfo(zone)).isoformat() + ' (' + zone + ').') if isinstance(request.get('messages'), list) else None
        metadata = context.current().metadata
        request.update(model_request(metadata))
        if metadata.get('activityId'):
            from harnest.lib.activities import service
            backend = service()
            request = await self.restore_history(request, backend)
            from harnest.lib.image_interpreter import ImageInterpreter
            if not hasattr(self, '_image_interpreter'):
                self._image_interpreter = ImageInterpreter()
            request = await self._image_interpreter.prepare(request, backend.state.get('settings', {}), metadata['activityId'])
            request = backend.memory.model_context(metadata['activityId'], request)
        request['_dextana_context_window'] = await resolve_context_window(request)
        budget = budget_for(request)
        if budget.output is not None:
            request['max_tokens'] = budget.output
        request = await self.prepare_context(request, clock)
        request.pop('_dextana_context_window', None)
        return request


def model_request(metadata):
    """Resolve one configured connection for chat and private text workers."""
    request = {}
    model = metadata.get("model", "")
    saved = connection(metadata)
    base = saved['base']
    if not isinstance(model, str) or not model.strip() or len(model) > 200:
        raise ValueError("Choose a model for this activity")
    provider = metadata.get("provider", "ollama")
    reasoning = metadata.get("reasoning", "default")
    if reasoning not in ("default", "off", "on", "minimal", "low", "medium", "high", "xhigh", "max"):
        raise ValueError("Invalid reasoning setting")
    if provider == "openai":
        request["model"] = "openai/" + model
        request["api_base"] = base
        # Explicit key prevents LiteLLM falling back to ambient provider credentials.
        from harnest.lib.model_auth import model_auth
        request.update(model_auth(saved['apiKey'], saved.get('auth')))
        if reasoning != 'default':
            from urllib.parse import urlsplit
            body = dict(request.get('extra_body', {}))
            if urlsplit(base).hostname == 'openrouter.ai':
                body['reasoning'] = {'enabled': reasoning == 'on'} if reasoning in ('off', 'on') else {'effort': reasoning}
            else:
                body['reasoning_effort'] = {'off': 'none', 'on': 'medium'}.get(reasoning, reasoning)
            request['extra_body'] = body
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
    return ContextRecoveryModel("ollama_chat/dextana-selected-model", lifecycle=DesktopModelRouting())
