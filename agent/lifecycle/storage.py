from harnest import lifecycle
from harnest.lib.sqlite_store import SQLiteStore
import os
from pathlib import Path


@lifecycle.storage.sessions
@lifecycle.storage.checkpoints
def state_store():
    """Keep sessions and checkpoints in the owner's private desktop data directory."""
    directory = Path(os.environ.get('DEXTANA_STORAGE_DIRECTORY', '.harnest/state'))
    return SQLiteStore(directory / 'agent.sqlite')
