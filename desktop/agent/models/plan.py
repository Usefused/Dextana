from pydantic import BaseModel


class PlannedMCPTool(BaseModel):
    server_id: str
    tool_name: str
