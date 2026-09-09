from urllib.parse import urlparse
from datetime import datetime
from zoneinfo import ZoneInfo
import os
from harnest import context
from harnest.model import LiteLLMLifecycle, LiteLLMModel
from harnest.lib.model_context import compact_context, without_thinking
from harnest.lib.context_budget import budget_for, resolve_context_window


# Provisioned through an owner-authenticated endpoint; never persisted in sessions.
_connections = {}


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
        def outgoing(value):
            return {**value, 'messages': [*value['messages'], runtime_context]} if runtime_context else value
        def size(value):
            return budget.size(outgoing(value))
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
            prepared = await compact_context(request, store, report=report, max_bytes=budget.limit, size=size)
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
    return LiteLLMModel("ollama_chat/dextana-selected-model", lifecycle=DesktopModelRouting())
