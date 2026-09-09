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
        assert 'Current local time:' in request['messages'][0]['content']
        assert request['messages'][1] == messages[1]
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
        assert request == dict(model='openai/vendor/model', api_base='https://gateway.example/v1', api_key='fixture-key')
        assert 'fixture-key' not in str(metadata)
        metadata['ollamaUrl'] = 'https://different.example/v1'
        with pytest.raises(ValueError, match='Reconnect'):
            await DesktopModelRouting().before_request({}, None)
        configure_connections([])
    asyncio.run(check())
