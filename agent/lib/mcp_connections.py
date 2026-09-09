"""Dynamic user connections backed by Harnest MCPClient's native ADK transport.

Electron decrypts credentials and enforces the exact per-chat/tool approval ticket.
Harnest owns initialization, sessions, subprocesses and transport teardown. This
registry only gives those dynamic connections opaque desktop handles. Credentials
never enter conversation/checkpoint data.
"""
import asyncio
import json
import re
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from harnest.mcp import MCPClient
from harnest.mcp_lifecycle import (
    MCPClientLifecycle, mcp_lifecycle_bindings,
    start_mcp_lifecycles, close_mcp_lifecycles,
)


async def reject_redirect(response):
    if 300 <= response.status_code < 400:
        raise ValueError('MCP redirects are not permitted.')


class TokenPlacement(httpx.Auth):
    requires_request_body = True

    def __init__(self, kind, name, token):
        self.kind, self.name, self.token = kind, name, token

    def auth_flow(self, request):
        if self.kind == 'bearer':
            request.headers['Authorization'] = 'Bearer ' + self.token
        elif self.kind == 'header':
            request.headers[self.name] = self.token
        elif self.kind == 'body' and request.method == 'POST':
            # Gateway-specific top-level JSON field, never model tool arguments.
            payload = json.loads(request.content)
            if not isinstance(payload, dict) or self.name in payload:
                raise ValueError('Auth cannot replace an MCP message field.')
            payload[self.name] = self.token
            body = json.dumps(payload).encode('utf-8')
            request = httpx.Request(request.method, request.url, headers=request.headers,
                                    content=body, extensions=request.extensions)
            request.headers['Content-Length'] = str(len(body))
        yield request


def authentication(config, token):
    value = config.get('auth') or {'type': 'bearer' if token else 'none'}
    if not isinstance(value, dict):
        raise ValueError('Invalid MCP authentication.')
    kind, name = value.get('type'), value.get('name', '')
    if kind not in ('none', 'bearer', 'header', 'body') or not isinstance(name, str):
        raise ValueError('Invalid MCP authentication.')
    if kind != 'none' and not token:
        raise ValueError('An auth token is required.')
    if kind in ('bearer', 'header') and re.search(r'[\x00-\x1f\x7f]', token):
        raise ValueError('Invalid auth header value.')
    if kind == 'header' and (not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}", name) or name.lower() in {'host', 'content-type', 'content-length', 'accept', 'connection', 'transfer-encoding', 'proxy-authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'}):
        raise ValueError('Invalid auth header name.')
    if kind == 'body' and (not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,127}', name) or name in {'jsonrpc', 'id', 'method', 'params', 'result', 'error', '__proto__', 'constructor', 'prototype'}):
        raise ValueError('Invalid auth body field.')
    return None if kind == 'none' else TokenPlacement(kind, name, token)


def redact(value, token):
    if not token:
        return value
    if isinstance(value, str):
        return value.replace(token, '[redacted]')
    if isinstance(value, list):
        return [redact(item, token) for item in value]
    if isinstance(value, dict):
        return {redact(key, token): redact(item, token) for key, item in value.items()}
    return value


class DesktopHTTP(MCPClientLifecycle):
    """Keep desktop credentials on the selected endpoint, without proxy inheritance."""

    def __init__(self, auth=None):
        self.auth = auth

    def create_http_client(self, options, context):
        return httpx.AsyncClient(
            headers=dict(options.headers), timeout=options.timeout, auth=self.auth or options.auth,
            follow_redirects=False, trust_env=False,
            event_hooks={'response': [reject_redirect]},
        )


def native_client(config):
    if not isinstance(config, dict):
        raise ValueError('Invalid MCP connection.')
    transport = config.get('transport', 'http')
    if transport == 'http':
        url = config.get('url', '')
        token = config.get('token', '')
        if not isinstance(url, str) or not isinstance(token, str):
            raise ValueError('Invalid MCP connection.')
        parsed = urlsplit(url)
        if parsed.username or parsed.password or not parsed.hostname or (parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1'))):
            raise ValueError('MCP requires HTTPS or a local HTTP endpoint.')
        return MCPClient.streamable_http(
            url, timeout_seconds=60, sse_read_timeout_seconds=65,
            lifecycle=DesktopHTTP(authentication(config, token)),
        )
    if transport == 'stdio':
        command, args, environment = config.get('command'), config.get('args', []), config.get('environment', {})
        if not isinstance(command, str) or not command.strip() or not isinstance(args, list) or not all(isinstance(arg, str) for arg in args) or not isinstance(environment, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in environment.items()):
            raise ValueError('Invalid MCP command or environment.')
        # Native stdio inherits a minimal environment, not the backend's owner token.
        return MCPClient.stdio(command, *args, env=environment, timeout_seconds=60)
    raise ValueError('Unsupported MCP transport.')


class Connection:
    def __init__(self, config):
        self.toolset = native_client(config).to_adk_toolset()
        self.token = config.get('token', '')
        self.bindings = mcp_lifecycle_bindings(self.toolset)
        self.closed = False
        self.pending = set()

    async def start(self):
        await start_mcp_lifecycles(self.bindings)
        await self._native_request('ping', {})

    async def _native_request(self, method, args):
        async def operation(session):
            if method == 'ping':
                return await session.send_ping()
            if method == 'list':
                return await session.list_tools(cursor=args.get('cursor'))
            return await session.call_tool(args['name'], arguments=args.get('arguments', {}))

        # Compatibility boundary for pinned Harnest 0.17 / ADK: get_tools() only
        # returns the first page and converts metadata. Use the native toolset's
        # session executor to retain cursors, exact schema fingerprints and raw
        # MCP results. Do not construct ClientSession/transports here or retry
        # ambiguous calls. Existing Harnest dynamic approvals run before this hop.
        result = await self.toolset._execute_with_session(operation, 'MCP request failed')
        value = result.model_dump(mode='json', by_alias=True, exclude_unset=True)
        if len(json.dumps(value)) > 1_000_000:
            raise ValueError('MCP result too large.')
        return redact(value, self.token)

    async def request(self, method, args):
        if self.closed:
            raise ValueError('MCP connection closed.')
        if method not in ('list', 'call') or not isinstance(args, dict):
            raise ValueError('Unsupported MCP operation.')
        if method == 'call' and (not isinstance(args.get('name'), str) or not isinstance(args.get('arguments', {}), dict)):
            raise ValueError('Invalid MCP tool call.')
        task = asyncio.create_task(self._native_request(method, args))
        self.pending.add(task)
        try:
            return await asyncio.wait_for(task, 65)
        except Exception:
            raise ValueError('MCP did not return a usable result. Its outcome may be unknown; do not automatically retry.') from None
        finally:
            self.pending.discard(task)

    async def close(self):
        if self.closed:
            return
        self.closed = True
        pending = list(self.pending)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        try:
            await self.toolset.close()
        finally:
            await close_mcp_lifecycles(self.bindings)


_connections = {}


async def open_connection(config):
    if len(_connections) >= 200:
        raise ValueError('Too many MCP connections.')
    connection = Connection(config)
    connection_id = str(uuid4())
    _connections[connection_id] = connection
    try:
        await asyncio.wait_for(connection.start(), 20)
        return connection_id
    except BaseException:
        await close_connection(connection_id)
        raise


async def request(connection_id, method, args):
    connection = _connections.get(connection_id)
    if connection is None:
        raise ValueError('MCP connection no longer exists.')
    return await connection.request(method, args)


async def close_connection(connection_id):
    connection = _connections.pop(connection_id, None)
    if connection:
        await connection.close()


async def close_all():
    await asyncio.gather(*(close_connection(i) for i in list(_connections)))
