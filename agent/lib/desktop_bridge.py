from typing import Literal
from harnest.agent import client_tool


@client_tool
async def desktop_bridge(phase: Literal['discover', 'prepare', 'execute'], work: str = '',
                         operation: str = '', arguments_json: str = '{}', ticket: str = '') -> dict:
    """Internal device transport. Electron binds prepared actions to this Harnest invocation."""
    ...
