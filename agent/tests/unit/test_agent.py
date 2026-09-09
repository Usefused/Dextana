def test_agent_identity(agent, monkeypatch):
    assert agent.name == "dextana"

    import asyncio
    from types import SimpleNamespace
    from harnest import context
    from harnest.lib.ollama import DesktopModelRouting

    async def check_routing():
        for setting, expected in [('on', True), ('off', False), ('low', 'low'), ('medium', 'medium'), ('high', 'high'), ('max', 'max'), ('default', None)]:
            monkeypatch.setattr(context, 'current', lambda: SimpleNamespace(metadata={'model': 'test', 'reasoning': setting}))
            request = await DesktopModelRouting().before_request({}, None)
            if expected is None:
                assert 'think' not in request
            else:
                assert request['think'] == expected
        messages = [dict(role='system', content='Instructions'), dict(role='user', content='Remind me in five minutes')]
        request = await DesktopModelRouting().before_request({'messages': messages}, None)
        assert 'Current local time:' in request['messages'][-1]['content']
        assert request['messages'][:-1] == messages
        assert messages[0]['content'] == 'Instructions'
    asyncio.run(check_routing())


def test_compatible_model_routing(agent, monkeypatch):
    import asyncio
    from types import SimpleNamespace
    import pytest
    from harnest import context
    from harnest.lib.ollama import DesktopModelRouting, configure_connections

    async def check():
        configure_connections([dict(id='test-connection', provider='openai', base='https://gateway.example/v1', apiKey='fixture-key')])
        metadata = dict(provider='openai', model='vendor/model', connectionId='test-connection', ollamaUrl='https://gateway.example/v1', reasoning='high')
        monkeypatch.setattr(context, 'current', lambda: SimpleNamespace(metadata=metadata))
        request = await DesktopModelRouting().before_request({}, None)
        assert request == dict(model='openai/vendor/model', api_base='https://gateway.example/v1', api_key='fixture-key', extra_body={'reasoning_effort': 'high'})
        assert 'fixture-key' not in str(metadata)
        metadata['ollamaUrl'] = 'https://different.example/v1'
        with pytest.raises(ValueError, match='Reconnect'):
            await DesktopModelRouting().before_request({}, None)
        configure_connections([])
    asyncio.run(check())


def test_openrouter_reasoning_uses_unified_fields_and_preserves_custom_auth(agent):
    from harnest.lib.ollama import configure_connections, model_request
    base = 'https://openrouter.ai/api/v1'
    configure_connections([dict(id='reasoning-connection', provider='openai', base=base, apiKey='test-key', auth=dict(mode='bearer', headers={'X-Tenant': 'test-tenant'}, body={'credentials': {'token': 'body-secret'}}))])
    try:
        for setting, expected in [('off', {'enabled': False}), ('on', {'enabled': True}), ('minimal', {'effort': 'minimal'}), ('high', {'effort': 'high'}), ('xhigh', {'effort': 'xhigh'}), ('max', {'effort': 'max'}), ('default', None)]:
            request = model_request(dict(provider='openai', model='vendor/model', connectionId='reasoning-connection', ollamaUrl=base, reasoning=setting))
            assert request['extra_body'].get('reasoning') == expected
            assert request['extra_body']['credentials'] == {'token': 'body-secret'}
            assert request['extra_headers']['x-tenant'] == 'test-tenant'
            assert 'think' not in request and 'reasoning_effort' not in request
    finally:
        configure_connections([])


def test_openrouter_reasoning_reaches_the_http_payload(agent):
    import asyncio
    import json
    import httpx
    import litellm
    from openai import AsyncOpenAI
    from harnest.lib.ollama import configure_connections, model_request
    base = 'https://openrouter.ai/api/v1'
    configure_connections([dict(id='wire-reasoning', provider='openai', base=base, apiKey='test-key')])
    seen = []
    def remote(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={'id': 'test', 'object': 'chat.completion', 'created': 1, 'model': 'inception/mercury-2.5', 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'Done'}, 'finish_reason': 'stop'}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(remote)) as http:
            client = AsyncOpenAI(api_key='test-key', base_url=base, http_client=http)
            for setting in ['high', 'off', 'default']:
                request = model_request(dict(provider='openai', model='inception/mercury-2.5', connectionId='wire-reasoning', ollamaUrl=base, reasoning=setting))
                await litellm.acompletion(**request, client=client, messages=[{'role': 'user', 'content': 'Test reasoning routing'}])
    try:
        asyncio.run(run())
        assert seen[0]['reasoning'] == {'effort': 'high'}
        assert seen[1]['reasoning'] == {'enabled': False}
        assert 'reasoning' not in seen[2]
        assert all('think' not in body for body in seen)
    finally:
        configure_connections([])
