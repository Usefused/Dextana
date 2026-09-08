import os
from secrets import compare_digest
from harnest.auth import AuthenticationError, AuthPrincipal
from harnest.lifecycle import lifecycle


@lifecycle.authenticate
def authenticate(connection, principal):
    expected = os.environ.get("DEXTANA_RUNTIME_TOKEN", "")
    supplied = connection.headers.get("authorization", "")
    if not expected or not compare_digest(supplied, "Bearer " + expected):
        raise AuthenticationError("Desktop authentication required")
    return AuthPrincipal(user_id="owner")
