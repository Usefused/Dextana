"""Embedding transport shared by connection validation and memory retrieval."""
import httpx
from harnest.lib.memory import normalized
from harnest.lib.ollama import validate_endpoint


async def embed(texts, *, provider, base, model, api_key='', dimensions=None, auth=None):
    from harnest.lib.model_auth import auth_config, http_headers
    auth = auth_config(auth)
    validate_endpoint(base)
    if provider not in ('openai', 'ollama') or not isinstance(model, str) or not 1 <= len(model.strip()) <= 200:
        raise ValueError('Choose an embedding model')
    if not isinstance(api_key, str) or len(api_key) > 8192 or '\n' in api_key or '\r' in api_key:
        raise ValueError('Invalid API key')
    if not isinstance(texts, list) or not 1 <= len(texts) <= 32 or any(not isinstance(t, str) or not t.strip() or len(t) > 32000 for t in texts):
        raise ValueError('Invalid embedding input')
    payload = dict(model=model, input=texts)
    if provider == 'openai':
        payload['encoding_format'] = 'float'
    else:
        payload['truncate'] = False
    if provider == 'openai':
        payload.update(auth['body'])
    async with httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False) as client:
        response = await client.post(base.rstrip('/') + ('/embeddings' if provider == 'openai' else '/api/embed'),
            headers=http_headers(api_key, auth), json=payload)
        response.raise_for_status()
        data = response.json()
    if provider == 'openai':
        entries = data.get('data')
        if not isinstance(entries, list) or len(entries) != len(texts) or any(not isinstance(e, dict) or type(e.get('index')) is not int for e in entries):
            raise ValueError('Invalid embedding response')
        entries = sorted(entries, key=lambda e: e['index'])
        if [e['index'] for e in entries] != list(range(len(texts))):
            raise ValueError('Invalid embedding indices')
        vectors = [e.get('embedding') for e in entries]
    else:
        vectors = data.get('embeddings')
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise ValueError('Invalid embedding response')
    result = [normalized(v, dimensions) for v in vectors]
    if len({len(v) for v in result}) != 1:
        raise ValueError('Inconsistent embedding dimensions')
    return result


async def validate(settings, api_key='', auth=None):
    if not settings.get('embeddingModel'):
        return {}
    try:
        vectors = await embed(['Dextana memory connection check.'], provider=settings.get('provider', 'ollama'),
            base=settings['ollamaUrl'], model=settings['embeddingModel'], api_key=api_key, auth=auth)
        return dict(embeddingDimensions=len(vectors[0]))
    except httpx.HTTPStatusError as error:
        status = error.response.status_code
        if status in (401, 403):
            return dict(memoryError='Long-term memory is disabled. The embedding service rejected the authentication. Check the API key and authentication settings, then save again.')
        return dict(memoryError=f'Long-term memory is disabled. The embedding service returned HTTP {status}. Check the model ID and provider access, then save again.')
    except Exception:
        # Provider bodies/exceptions can contain credentials; publish fixed text only.
        return dict(memoryError='Long-term memory is disabled. Could not use this embedding model. Check the model ID and connection, then save again.')
