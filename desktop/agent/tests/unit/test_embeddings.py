import asyncio
import httpx
import pytest


def test_embedding_transport_uses_explicit_connection_and_reorders_indices(agent, monkeypatch):
    from harnest.lib import embeddings
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200, json=dict(data=[dict(index=1, embedding=[0, 2]), dict(index=0, embedding=[3, 0])]))
    client = httpx.AsyncClient
    monkeypatch.setattr(embeddings.httpx, 'AsyncClient', lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(respond)))
    async def check():
        result = await embeddings.embed(['a', 'b'], provider='openai', base='https://model.example/v1', model='vectors', api_key='test-key', dimensions=2)
        assert result == [[1, 0], [0, 1]]
        assert calls[0].url == 'https://model.example/v1/embeddings'
        assert calls[0].headers['authorization'] == 'Bearer test-key'
        assert b'"encoding_format":"float"' in calls[0].content
    asyncio.run(check())


def test_ollama_embeddings_and_failed_validation_disable_memory_without_leaking_errors(agent, monkeypatch):
    from harnest.lib import embeddings
    calls = []
    def respond(request):
        calls.append(request)
        if b'unsupported' in request.content:
            return httpx.Response(401, json=dict(error='secret-key provider failure'))
        return httpx.Response(200, json=dict(embeddings=[[2, 0, 0]]))
    client = httpx.AsyncClient
    monkeypatch.setattr(embeddings.httpx, 'AsyncClient', lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(respond)))
    async def check():
        assert await embeddings.validate(dict(ollamaUrl='http://localhost:11434', embeddingModel='vectors')) == dict(embeddingDimensions=3)
        assert calls[0].url.path == '/api/embed'
        assert 'authorization' not in calls[0].headers
        result = await embeddings.validate(dict(provider='openai', ollamaUrl='https://model.example/v1', embeddingModel='unsupported'), 'secret-key')
        assert 'disabled' in result['memoryError']
        assert 'secret-key' not in str(result)
        assert await embeddings.validate({}) == {}
        assert len(calls) == 2
    asyncio.run(check())


@pytest.mark.parametrize('payload', [dict(data=[dict(index=0, embedding=[1]), dict(index=0, embedding=[1])]), dict(data=[dict(index=0, embedding=[0])]), dict(data=[dict(index=0, embedding=[True])])])
def test_malformed_provider_response_is_rejected(agent, monkeypatch, payload):
    from harnest.lib import embeddings
    client = httpx.AsyncClient
    monkeypatch.setattr(embeddings.httpx, 'AsyncClient', lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload))))
    async def check():
        with pytest.raises(ValueError):
            await embeddings.embed(['test'], provider='openai', base='https://model.example/v1', model='vectors')
    asyncio.run(check())
