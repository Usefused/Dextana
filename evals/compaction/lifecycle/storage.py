from harnest import lifecycle
from harnest.checkpoint import MemoryStore


@lifecycle.storage.sessions
@lifecycle.storage.checkpoints
def storage():
    return MemoryStore()
