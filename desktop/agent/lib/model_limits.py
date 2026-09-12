"""Recognize provider errors that establish a smaller usable context limit."""
import re


_CONTEXT_LIMIT = re.compile(
    r'(?:range of input length|maximum context length|context length exceeded|'
    r'prompt (?:is )?too long|too many (?:input )?tokens)',
    re.IGNORECASE,
)


def context_limit_error(error):
    return bool(_CONTEXT_LIMIT.search(str(error)))
