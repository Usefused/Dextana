from typing import Literal
from harnest.agent import client_tool
from harnest.lib.activity_progress import WAIT_SECONDS


@client_tool(timeout_seconds=WAIT_SECONDS)
async def mcp_bridge(phase: Literal["list", "prepare", "execute"], server_id: str = "", tool_name: str = "", arguments_json: str = "{}", ticket: str = "") -> dict:
    """Internal desktop MCP transport. The desktop validates policy and binds each execution ticket to this call."""
    ...
