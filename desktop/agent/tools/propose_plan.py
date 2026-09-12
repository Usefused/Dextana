from harnest.agent import client_tool
from harnest.models.plan import PlannedMCPTool


@client_tool
def propose_plan(title: str, steps: list[str], browser_urls: list[str], file_reads: list[str], file_creates: list[str], mcp_tools: list[PlannedMCPTool], fused_integrations: list[str]) -> dict:
    """Submit a work plan for the owner to review in Plan mode. This does not approve or execute it.

    title: Short plain-language deliverable name.
    steps: One to twelve concrete steps, including intended side effects and deliverables.
    browser_urls: HTTP(S) websites needed. Approval covers browser actions on these exact origins during this plan's run.
    file_reads: Exact absolute work document paths to read; no wildcards or directories.
    file_creates: Exact filenames or absolute work document paths to create; no overwrites.
    mcp_tools: Enabled server_id and tool_name pairs from the local mcp list catalog. New credentials still require separate approval.
    fused_integrations: Exact integration IDs from fused connections needed for this plan's run.

    Use empty lists for unused capabilities. Request only resources necessary for the owner's goal.
    After submission, tell the owner it is ready for review and end your response.
    Do not perform work or delegate while drafting. Ask a clarifying question if the scope is unknown.
    """
    ...
