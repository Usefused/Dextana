import asyncio
import copy
from types import SimpleNamespace
import pytest


def test_images_become_observations_only_in_model_copy_and_cache_is_scoped(agent, monkeypatch):
    from harnest.lib.image_interpreter import ImageInterpreter
    worker = ImageInterpreter()
    calls = []
    async def describe(image, question, surrounding, connection):
        calls.append((image, question, connection))
        return 'A red circle with label A.'
    monkeypatch.setattr(worker, 'describe', describe)
    request = dict(messages=[dict(role='user', content='What is shown?'),
        dict(role='user', content=[dict(type='text', text='File read result'),
             dict(type='image_url', image_url=dict(url='data:image/png;base64,AAAA'))])])
    original = copy.deepcopy(request)
    settings = dict(ollamaUrl='http://localhost:11434', imageInterpreterModel='vision')
    async def check():
        result = await worker.prepare(request, settings, 'chat-a')
        assert request == original
        assert 'A red circle' in result['messages'][1]['content'][1]['text']
        assert 'image_url' not in str(result)
        assert calls[0][2]['model'] == 'ollama_chat/vision'
        assert calls[0][2]['think'] is False
        await worker.prepare(request, settings, 'chat-a')
        assert len(calls) == 1
        await worker.prepare(request, settings, 'chat-b')
        assert len(calls) == 2
        assert await worker.prepare(request, {}, 'chat-a') is request
    asyncio.run(check())


def test_interpreter_omits_thinking_has_no_tools_and_uses_explicit_connection(agent, monkeypatch):
    import litellm
    from harnest.lib.image_interpreter import ImageInterpreter
    calls = []
    async def complete(**request):
        calls.append(request)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(model_dump=lambda: dict(
            content='<think>private reasoning</think>A blue button.', reasoning_content='private reasoning')))])
    monkeypatch.setattr(litellm, 'acompletion', complete)
    async def check():
        result = await ImageInterpreter().describe({}, 'Read the button', '', dict(model='openai/vision', api_base='https://models.example/v1', api_key='test-key'))
        assert result == 'A blue button.'
        assert calls[0]['tools'] is None
        assert calls[0]['api_key'] == 'test-key'
        assert calls[0]['stream'] is False
        assert calls[0]['max_tokens'] == 2000
    asyncio.run(check())


def test_interpreter_failure_does_not_leak_provider_errors_or_fall_back_to_raw_images(agent, monkeypatch):
    import litellm
    from harnest.lib.image_interpreter import ImageInterpreter
    async def fail(**request):
        raise RuntimeError('secret-provider-key')
    monkeypatch.setattr(litellm, 'acompletion', fail)
    async def check():
        with pytest.raises(ValueError, match='Image interpretation failed') as error:
            await ImageInterpreter().describe({}, '', '', {})
        assert 'secret-provider-key' not in str(error.value)
    asyncio.run(check())
