import asyncio
import json
import pytest
import httpx


def test_custom_auth_reaches_chat_compaction_and_embeddings_without_inherited_bearer(agent, monkeypatch):
    from harnest.lib.model_auth import model_auth, auth_config
    from harnest.lib.compaction_agent import CompactionRouting
    from harnest.lib import embeddings
    from openai import Omit
    auth = dict(mode='custom', headers={'x-api-key': 'header-test-key', 'x-tenant': 'tenant'}, body={'credentials': {'token': 'body-test-key'}})
    request = model_auth('unused-key', auth)
    assert isinstance(request['extra_headers']['Authorization'], Omit)
    assert request['extra_headers']['x-api-key'] == 'header-test-key'
    assert request['extra_body'] == auth['body']
    worker = CompactionRouting(dict(model='openai/test', api_base='https://gateway.example/v1', **request))
    assert worker.connection['extra_body'] == auth['body']
    with pytest.raises(ValueError):
        auth_config(dict(auth, body={'tools': []}))
    calls = []
    def handle(req):
        calls.append(req)
        return httpx.Response(200, json={'data': [{'index': 0, 'embedding': [1, 2, 3]}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(embeddings.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    asyncio.run(embeddings.embed(['test'], provider='openai', base='https://gateway.example/v1', model='vectors', api_key='unused-key', auth=auth))
    assert calls[0].headers['x-api-key'] == 'header-test-key'
    assert 'authorization' not in calls[0].headers
    assert json.loads(calls[0].content)['credentials']['token'] == 'body-test-key'
