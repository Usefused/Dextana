"""Eval-only adapter: execute Dextana's production summarizer, not a substitute prompt."""
import json
import os
import sqlite3
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from harnest.agent import Agent
from harnest.lib.judge_model import judge_model
from harnest.lib.model_context import summarize_records, without_thinking


class CompactionEvaluationAgent(BaseAgent):
    # Harnest's native evaluator borrows this explicit judge transport. The
    # summarizer below still receives its own independently selected model.
    model: Any

    async def _run_async_impl(self, ctx):
        fixture = json.loads(''.join(part.text or '' for part in ctx.user_content.parts))
        request = dict(model='ollama_chat/' + os.environ['DEXTANA_EVAL_MODEL'],
            api_base=os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'))
        if os.environ.get('OLLAMA_API_KEY'):
            request['api_key'] = os.environ['OLLAMA_API_KEY']
        summary = None
        db = sqlite3.connect(':memory:')
        try:
            from harnest.lib.distillation import Distillation
            worker = Distillation(lambda: db) if os.environ.get('DEXTANA_EVAL_MEMORY') == '1' else None
            for records in fixture['rounds']:
                messages = without_thinking(dict(messages=records))['messages']
                if summary is not None:
                    messages.insert(0, dict(previous_summary=summary))
                # Exercise the production shared memory worker for eligible
                # histories; large histories take the same chunked fallback.
                summary = None
                if worker and len(json.dumps(messages).encode()) <= 96000:
                    summary = (await worker.get('synthetic-owner', messages, [], request))['summary']
                if summary is None:
                    summary = await summarize_records(messages, request)
        finally:
            db.close()
        yield Event(author=self.name, content=types.Content(role='model', parts=[types.Part(text=summary)]))


root_agent = Agent.advanced(CompactionEvaluationAgent(name='dextana_compaction_eval',
    model=judge_model()))
