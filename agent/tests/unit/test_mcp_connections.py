"""Failure/teardown contracts for dynamic Harnest MCP connections."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


def test_connection_calls_are_never_replayed_and_close_cancels_waiters(agent, monkeypatch):
    from harnest.lib import mcp_connections as module

    async def scenario():
        toolset = SimpleNamespace(
            _execute_with_session=AsyncMock(side_effect=RuntimeError('private server detail')),
            close=AsyncMock(),
        )
        monkeypatch.setattr(module, 'native_client', lambda config: SimpleNamespace(to_adk_toolset=lambda: toolset))
        connection = module.Connection({})
        with pytest.raises(ValueError, match='outcome may be unknown') as caught:
            await connection.request('call', {'name': 'send', 'arguments': {}})
        assert 'private server detail' not in str(caught.value)
        assert toolset._execute_with_session.await_count == 1
        started = asyncio.Event()

        async def pending(*args):
            started.set()
            await asyncio.Future()

        toolset._execute_with_session.side_effect = pending
        request = asyncio.create_task(connection.request('call', {'name': 'send'}))
        await started.wait()
        await connection.close()
        with pytest.raises(asyncio.CancelledError):
            await request
        await connection.close()
        assert toolset.close.await_count == 1
        with pytest.raises(ValueError, match='closed'):
            await connection.request('list', {})

    asyncio.run(scenario())


def test_failed_start_releases_native_toolset_and_registry_handle(agent, monkeypatch):
    from harnest.lib import mcp_connections as module

    async def scenario():
        toolset = SimpleNamespace(
            _execute_with_session=AsyncMock(side_effect=RuntimeError('connection failed')),
            close=AsyncMock(),
        )
        monkeypatch.setattr(module, 'native_client', lambda config: SimpleNamespace(to_adk_toolset=lambda: toolset))
        before = set(module._connections)
        with pytest.raises(RuntimeError):
            await module.open_connection({})
        assert set(module._connections) == before
        toolset.close.assert_awaited_once()

    asyncio.run(scenario())


def test_http_lifecycle_does_not_forward_credentials_on_redirect(agent):
    from harnest.lib import mcp_connections as module
    from harnest.mcp_lifecycle import MCPHTTPClientOptions, MCPClientContext
    import httpx

    async def scenario():
        calls = []
        async def server(request):
            calls.append(str(request.url))
            return httpx.Response(307, headers={'location': 'https://another.example/mcp'})
        context = MCPClientContext(name='test', transport='streamable-http', framework='adk', url='https://selected.example/mcp')
        client = module.DesktopHTTP().create_http_client(
            MCPHTTPClientOptions(headers={'Authorization': 'Bearer private'}), context,
        )
        # Inspect the real configured policy, then use the same hooks on a fake network.
        assert not client.follow_redirects
        async with client:
            async with httpx.AsyncClient(transport=httpx.MockTransport(server), follow_redirects=client.follow_redirects, event_hooks=client.event_hooks) as network:
                with pytest.raises(ValueError, match='redirects'):
                    await network.get(context.url)
        assert calls == [context.url]

    asyncio.run(scenario())


def test_body_auth_preserves_protocol_and_tool_arguments_and_redacts_echoed_tokens(agent):
    from harnest.lib import mcp_connections as module
    import httpx

    async def scenario():
        seen = []
        async def remote(request):
            seen.append(request)
            return httpx.Response(200, json={'ok': True})
        auth = module.authentication({'auth': {'type': 'body', 'name': 'api_key'}}, 'private "key"')
        async with httpx.AsyncClient(transport=httpx.MockTransport(remote), auth=auth) as client:
            payload = {'jsonrpc': '2.0', 'id': 42, 'method': 'tools/call', 'params': {'name': 'send', 'arguments': {'title': 'Reviewed'}}}
            await client.post('https://selected.example/mcp', json=payload)
            import json
            actual = json.loads(seen[0].content)
            assert actual == {**payload, 'api_key': 'private "key"'}
            assert int(seen[0].headers['content-length']) == len(seen[0].content)
            assert 'authorization' not in seen[0].headers
            with pytest.raises(ValueError, match='cannot replace'):
                await client.post('https://selected.example/mcp', json={**payload, 'api_key': 'other'})
        assert module.redact({'content': [{'text': 'Echo: private "key"'}]}, 'private "key"') == {'content': [{'text': 'Echo: [redacted]'}]}
        for name in ('params', 'jsonrpc', 'method', 'id'):
            with pytest.raises(ValueError):
                module.authentication({'auth': {'type': 'body', 'name': name}}, 'private')
        for name in ('Host', 'Content-Length', 'Mcp-Session-Id'):
            with pytest.raises(ValueError):
                module.authentication({'auth': {'type': 'header', 'name': name}}, 'private')

    asyncio.run(scenario())


@pytest.mark.parametrize('status, expected', [
    (401, 'rejected access'), (403, 'rejected access'),
    (404, 'endpoint is unavailable'), (410, 'endpoint is unavailable'),
    (429, 'rate limited'), (500, 'server failed'), (503, 'server failed'),
    (400, 'rejected connection setup'),
])
def test_connection_diagnostics_preserve_status_without_remote_secrets(agent, status, expected):
    from harnest.lib import mcp_connections as module
    import httpx
    request = httpx.Request('POST', 'https://example.test/mcp?key=private-token')
    cause = httpx.HTTPStatusError('private-token server detail', request=request,
                                  response=httpx.Response(status, request=request))
    wrapper = ConnectionError('private-token wrapped error')
    wrapper.__cause__ = ExceptionGroup('private-token', [cause])
    message = module.connection_error(wrapper)
    assert expected in message
    assert str(status) in message
    assert 'private-token' not in message
    assert 'example.test' not in message


def test_connection_diagnostics_distinguish_timeout_protocol_and_unknown_failures(agent):
    from harnest.lib import mcp_connections as module
    from mcp.shared.exceptions import McpError
    from mcp.types import ErrorData
    assert 'timed out' in module.connection_error(TimeoutError('private-token'))
    message = module.connection_error(McpError(ErrorData(code=-32601, message='private-token')))
    assert '-32601' in message
    assert 'private-token' not in message
    assert 'credentials' not in module.connection_error(RuntimeError('private-token'))
