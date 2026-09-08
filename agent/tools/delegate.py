from harnest.models.work import WorkItem
from harnest.tool import client_tool


@client_tool
def delegate(tasks: list[WorkItem]) -> dict:
    """Run up to three independent work assignments concurrently and collect results.

    tasks: Self-contained assignments and optional owner-selected Ollama models.
        Workers have separate Harnest sessions, browsers, and Fused connections.
        Include the goal, constraints, and necessary context in each prompt.
        Split only independent work. Do not delegate the same side effect twice.
        Each worker appears in the desktop. Cancelling this activity cancels workers.
        Workers may delegate only one further level. Report any worker failures.
    """
    ...
