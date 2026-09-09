"""Keep provider reasoning out of ADK's rubric verdict parser."""
import os
from harnest.model import LiteLLMLifecycle, LiteLLMModel


class JudgeLifecycle(LiteLLMLifecycle):
    async def before_request(self, request, context):
        request.update(api_base=os.environ['OLLAMA_BASE_URL'], think=False, timeout=60, max_tokens=4000)
        if os.environ.get('OLLAMA_API_KEY'):
            request['api_key'] = os.environ['OLLAMA_API_KEY']
        return request

    async def after_response(self, response, context):
        if response is None:  # Streaming exhaustion notifications have no payload.
            return response
        from litellm import ModelResponse
        payload = response.model_dump()
        for choice in payload.get('choices', []):
            message = choice.get('message', {})
            for key in ('reasoning_content', 'reasoning', 'thinking_blocks'):
                message.pop(key, None)
        # Preserve final content verbatim, including malformed or negative
        # verdicts. This must never manufacture a parseable or passing answer.
        return ModelResponse(**payload)


def judge_model():
    return LiteLLMModel('ollama_chat/' + os.environ['OLLAMA_MODEL'], lifecycle=JudgeLifecycle()).build()
