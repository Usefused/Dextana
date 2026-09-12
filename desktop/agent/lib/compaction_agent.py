"""A private, tool-free Harnest worker invoked by the context budget hook.

It is orchestrated by Dextana rather than exposed as a transfer tool to the main
model. Each invocation has an ephemeral session and only the supplied records.
"""
from contextlib import aclosing

from harnest.agent import Agent
from harnest.model import LiteLLMLifecycle, LiteLLMModel
from harnest.model_lifecycle import close_litellm_lifecycles


class CompactionRouting(LiteLLMLifecycle):
    def __init__(self, request):
        # Keep the already-resolved owner connection in memory only. This model
        # has no DesktopModelRouting hook, so it cannot recursively compact.
        self.connection = {key: request[key] for key in ('model', 'api_base', 'api_key', 'extra_headers', 'extra_body', '_dextana_context_window') if key in request}
        # Distillation also uses this worker for structured personal facts.
        # Plain conversation compaction supplies its own smaller output cap.
        self.output_tokens = request.get('_dextana_summary_tokens', 2000)

    async def before_request(self, request, model_context):
        from harnest.lib.model_context import bound_context, without_thinking
        request.update(self.connection)
        request.update(max_tokens=self.output_tokens, timeout=35, num_retries=0)
        if request['model'].startswith('ollama_chat/'):
            request['think'] = False
        # ADK's transport requires a tools argument, even for tool-free calls.
        request['tools'] = None
        for key in ('tool_choice', 'functions', 'function_call'):
            request.pop(key, None)
        from harnest.lib.context_budget import budget_for
        budget = budget_for(request)
        request = bound_context(without_thinking(request), budget.limit, budget.size)
        request.pop('_dextana_context_window', None)
        return request


async def compact_records(text, instructions, request):
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.adk.agents.run_config import RunConfig
    from google.genai import types

    worker = Agent(name='dextana_compactor', history='turn', instruction=instructions,
        model=LiteLLMModel(request['model'], lifecycle=CompactionRouting(request)),
        tools=(), subagents=(), mcp=(), generate_content_config={'max_output_tokens': request.get('_dextana_summary_tokens', 2000)}).build()
    sessions = InMemorySessionService()
    session = await sessions.create_session(app_name='dextana_compaction', user_id='compactor')
    runner = Runner(agent=worker, app_name='dextana_compaction', session_service=sessions)
    try:
        output = []
        async with aclosing(runner.run_async(user_id=session.user_id, session_id=session.id,
            new_message=types.Content(role='user', parts=[types.Part(text='Summarize these records:\n' + text)]),
            run_config=RunConfig(max_llm_calls=1))) as events:
            async for event in events:
                if event.is_final_response() and event.content:
                    output.extend(part.text for part in event.content.parts or [] if part.text and not part.thought)
        return '\n'.join(output)
    finally:
        try:
            await runner.close()
        finally:
            await close_litellm_lifecycles(worker)
