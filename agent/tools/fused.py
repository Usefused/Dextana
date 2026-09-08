from typing import Literal
from harnest.tool import client_tool


@client_tool
def fused(action: Literal["connections", "list", "search_docs", "execute"], arguments_json: str = "{}", integration_id: str = "") -> dict:
    """Use the owner's named Fused integrations. Call connections to discover enabled
    integration IDs and names, then list with integration_id for exact schemas.

    integration_id: Exact ID from connections. Required when multiple integrations
        are enabled. Keep the same ID for discovery, execution and result retrieval;
        each integration has its own session and credentials. Never guess an ID.
    action: connections lists configured integrations locally. list returns available tool schemas, search_docs discovers physical
        or Unified operations, execute runs the exact discovered operation.
    arguments_json: JSON object matching the selected tool's discovered schema.
        Use concise intent queries for discovery. Prefer a Unified operation that
        covers the task. Never guess operation IDs or replay an uncertain execution.
        Credentials and routing headers are supplied by the desktop, never here.
        Every MCP action requires desktop approval unless the owner enables auto-allow for this chat.
    """
    ...
