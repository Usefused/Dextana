from typing import Literal
from harnest.agent import tool
from harnest.approval import request_human_approval
from harnest.lib.mcp_bridge import mcp_bridge as _mcp_bridge


@tool
async def mcp(action: Literal["list", "call"], server_id: str = "", tool_name: str = "", arguments_json: str = "{}") -> dict:
    """Use the owner's approved MCP tools. List first to find enabled servers and exact tool schemas.

    action: list reads the desktop's approved catalog without contacting a server;
        call executes one enabled tool with its current approval policy.
    server_id: exact connection reference returned by list. Never invent a reference.
    tool_name: exact enabled tool name from that connection's catalog.
    arguments_json: JSON object matching that tool's inputSchema. Credentials are supplied by the desktop.
        Never retry an uncertain execution automatically. Disabled tools cannot be used.
    """
    if action == "list":
        return await _mcp_bridge(phase="list")
    plan = await _mcp_bridge(phase="prepare", server_id=server_id, tool_name=tool_name, arguments_json=arguments_json)
    if "error" in plan:
        return plan
    if plan["requiresApproval"]:
        async with request_human_approval(action="mcp.execute", message=plan["message"], arguments=plan["arguments"]):
            return await _mcp_bridge(phase="execute", ticket=plan["ticket"])
    return await _mcp_bridge(phase="execute", ticket=plan["ticket"])
