"""Runtime failures shown to the owner, without protocol envelopes or session URLs."""
import httpx


def runtime_message(value):
    if isinstance(value, str) and value.strip():
        return value
    if isinstance(value, dict):
        message = value.get('message')
        if isinstance(message, str) and message.strip():
            return message
    return 'Agent execution failed. Check the model connection before trying again.'


def execution_error(error):
    if isinstance(error, httpx.HTTPStatusError):
        return f'The agent runtime returned HTTP {error.response.status_code}. Check the connection before trying again.'
    if isinstance(error, httpx.RequestError):
        return 'Could not reach the agent runtime. Check the connection before trying again.'
    return str(error) or 'Activity timed out.'
