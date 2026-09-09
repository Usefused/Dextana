import os
from secrets import compare_digest
from fastapi import APIRouter, Depends, Request, HTTPException
from harnest import lifecycle
from harnest.lib import mcp_connections


@lifecycle.resource
async def connection_pool():
    try:
        yield None
    finally:
        await mcp_connections.close_all()


@lifecycle.http_routes
def mcp_connection_routes(agent):
    def owner(request: Request):
        token = os.environ.get('DEXTANA_RUNTIME_TOKEN', '')
        if not token or not compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            raise HTTPException(401, 'Desktop authentication required')

    router = APIRouter(prefix='/dextana/mcp', dependencies=[Depends(owner)])

    @router.post('/open')
    async def open_client(request: Request):
        try:
            data = await request.json()
            return {'id': await mcp_connections.open_connection(data)}
        except Exception:
            raise HTTPException(400, 'Could not connect to MCP. Check the server address and credentials.') from None

    @router.post('/request/{connection_id}')
    async def invoke(connection_id: str, request: Request):
        try:
            data = await request.json()
            return await mcp_connections.request(connection_id, data['method'], data.get('args', {}))
        except Exception:
            raise HTTPException(400, 'MCP did not return a usable result. Its outcome may be unknown; do not automatically retry.') from None

    @router.delete('/close/{connection_id}')
    async def close_client(connection_id: str):
        await mcp_connections.close_connection(connection_id)
        return {'ok': True}

    return router
