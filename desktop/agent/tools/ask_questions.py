from harnest.agent import client_tool
from harnest.models.questions import Question
from harnest.lib.activity_progress import WAIT_SECONDS


@client_tool(timeout_seconds=WAIT_SECONDS)
def ask_questions(title: str, questions: list[Question]) -> dict:
    """Ask the owner for missing information through a live question card.

    title: Short title for one to six related questions.
    questions: Text, single-choice, or multiple-choice questions. Choice questions
        need options with unique IDs and labels. Written answers are always allowed.
        Answers use a single-line input by default. Set multiline=true only when
        a longer explanation or multiple lines are needed.
        Do not preselect answers or ask for secrets. Use this only when the answer
        cannot be inferred and is needed to continue. This is not tool or plan approval.

    In delegated work the card appears immediately in the main chat, labelled with
    this worker. Only the asking worker waits; siblings keep running. The owner's
    answer returns directly here as the tool result. Do not finish the task or ask
    the parent to wait for all workers just to relay a question. Cancellation closes
    the pending card. Ordinary responses need no A2UI markup when using this tool.
    """
    ...
