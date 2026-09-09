from harnest.models.work import WorkItem
from harnest.agent import client_tool
from harnest.lib.activity_progress import WAIT_SECONDS


@client_tool(timeout_seconds=WAIT_SECONDS)
def delegate(tasks: list[WorkItem]) -> dict:
    """Run up to three independent work assignments concurrently and collect results.

    tasks: Self-contained assignments and optional owner-selected Ollama models.
        Workers have separate Harnest sessions, browsers, and Fused connections.
        Include the goal, constraints, and necessary context in each prompt.
        Split only independent work. Do not delegate the same side effect twice.
        Each worker appears in the desktop. Cancelling this activity cancels workers.
        Workers may delegate only one further level. Report any worker failures.
        Workers should use ask_questions when they need the owner's input. Those
        cards appear in the parent chat immediately and answers return directly
        to the asking worker, without waiting for this aggregate result.
    """
    ...
