# Interactive questions

During active work, `ask_questions` publishes the same shared question card through
the backend activity snapshot. A delegated worker's question appears immediately
in its root owner chat, labelled with the source assignment. The reply resolves
only that worker's waiting tool call. Siblings continue, and the parent receives
their aggregate results and the owner's clarifications when delegation completes.
The parent model still waits for the aggregate delegate result; the question UI
and reply delivery operate independently of that wait.

Pending questions and answers are saved with the root chat. Cancelling the worker
or parent closes its pending cards. A restart closes orphaned pending questions;
answered questions remain visible and are included as context when work resumes.
Waiting for owner input suspends the calling worker's execution timeout. Delegation
waits suspend the parent's execution timeout; each working child retains its own
execution budget. A background parent chat uses the existing notification system
to alert the owner to a new question. Answers do not bypass permission or plan checks.

The remainder describes fenced A2UI forms in completed responses, which also remain
supported for custom layouts.

Dextana's A2UI display catalog includes `QuestionForm`. The agent can ask up to six
related questions in a response, using single-choice selectors, checkbox cards,
and text fields. Choices also accept a written answer. All controls use the shared
design components. A visible Send reply button submits the reviewed answers as a
normal user message and continues the same activity with its selected model and mode.

Forms are interactive only in the latest completed response of an unarchived owner
chat with no pending approval, queued message or active run. The backend verifies
the response ID atomically before accepting a reply. Repeated, stale, cross-chat,
delegated or concurrent submissions are rejected. Ordinary composer replies also
make earlier forms read-only. Accepted replies persist their source message ID, so
the answered state survives restart and editing the reply. Unsubmitted form drafts
currently live in the rendered component and are not saved across navigation or restart.

Incomplete and streaming forms cannot submit. Required answers and input limits
are validated; failures keep the draft available to retry. Unsupported question
schemas render a notice. Forms never execute model-defined callbacks, URLs or code,
and do not bypass tool or plan approval. The agent's structured-display skill
documents the schema, limits and example output.

Written answers use the shared single-line TextInput by default, including text
questions. Set `multiline: true` on a question only when the answer needs a longer
explanation or multiple lines; those questions use the shared TextArea.
