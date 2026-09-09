import httpx


def test_runtime_envelopes_keep_the_message_but_not_transport_metadata(agent):
    from harnest.lib.runtime_errors import runtime_message
    error = dict(message='The chosen model is unavailable.', requestId='private-request',
                 sessionId='private-session', details={'token': 'private-token'})
    assert runtime_message(error) == 'The chosen model is unavailable.'
    assert 'private-' not in runtime_message({'details': error})
    assert runtime_message('The model is busy.') == 'The model is busy.'


def test_runtime_http_errors_do_not_show_private_session_urls(agent):
    from harnest.lib.runtime_errors import execution_error
    request = httpx.Request('GET', 'http://localhost/sessions/a348e410-9f5c-4e7b-b98b-47fcdc7b4f9a')
    response = httpx.Response(503, request=request)
    error = httpx.HTTPStatusError('Debug transport details', request=request, response=response)
    assert execution_error(error) == 'The agent runtime returned HTTP 503. Check the connection before trying again.'
    assert 'private' not in execution_error(httpx.ConnectError('private-session unavailable', request=request))
