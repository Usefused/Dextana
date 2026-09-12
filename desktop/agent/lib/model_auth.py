"""Private connection authentication, applied consistently to every model call."""
import copy
import json
import re


def auth_config(value=None, reserved_fields=None):
    value = value or dict(mode='bearer', headers={}, body={})
    if not isinstance(value, dict) or value.get('mode') not in ('bearer', 'custom'):
        raise ValueError('Invalid authentication configuration')
    headers, body = value.get('headers', {}), value.get('body', {})
    if not isinstance(headers, dict) or not isinstance(body, dict) or len(headers) > 16 or len(json.dumps(value)) > 24000:
        raise ValueError('Invalid authentication configuration')
    normalized = {}
    for name, item in headers.items():
        lower = name.lower()
        if not re.fullmatch(r"[!#$%&'*+.^_`|~0-9a-z-]+", lower) or lower in ('host', 'content-length', 'transfer-encoding', 'connection', 'content-type') or lower in normalized or not isinstance(item, str) or not item.strip() or len(item) > 8192 or any(char in item for char in ('\r', '\n', '\0')):
            raise ValueError('Invalid authentication headers')
        normalized[lower] = item.strip()
    if value['mode'] == 'bearer' and 'authorization' in normalized:
        raise ValueError('Use Custom authentication for an Authorization header')
    if reserved_fields is None:
        reserved_fields = ('model', 'messages', 'input', 'tools', 'tool_choice', 'functions', 'function_call', 'stream', 'response_format')
    if any(key.lower() in reserved_fields for key in body):
        raise ValueError('Authentication cannot replace model input or tools')
    def check(item, depth=0):
        if depth > 8:
            raise ValueError('Authentication body is too deeply nested')
        if isinstance(item, dict):
            for key, child in item.items():
                if key in ('__proto__', 'constructor', 'prototype'):
                    raise ValueError('Invalid authentication field')
                check(child, depth + 1)
        elif isinstance(item, list):
            for child in item:
                check(child, depth + 1)
    check(body)
    return dict(mode=value['mode'], headers=normalized, body=copy.deepcopy(body))


def http_headers(key, auth=None):
    auth = auth_config(auth)
    return {**({'authorization': 'Bearer ' + key} if key and auth['mode'] == 'bearer' else {}), **auth['headers']}


def model_auth(key, auth=None):
    auth = auth_config(auth)
    headers = http_headers(key, auth)
    # LiteLLM needs a nonempty key to avoid inheriting ambient credentials.
    # OpenAI's explicit omit sentinel removes that generated header for custom auth.
    if auth['mode'] == 'custom':
        from openai import omit
        headers['Authorization'] = headers.pop('authorization', omit)
    elif 'authorization' in headers:
        headers['Authorization'] = headers.pop('authorization')
    result = dict(api_key=key if key and auth['mode'] == 'bearer' else 'dextana-keyless')
    if auth['mode'] == 'custom' or auth['headers']:
        result['extra_headers'] = headers
    if auth['body']:
        result['extra_body'] = auth['body']
    return result
