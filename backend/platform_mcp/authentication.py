"""Bearer-PAT DRF authentication. Only `McpView` uses it (see
views.py's `get_authenticators`) - a PAT opens the MCP endpoint and
nothing else; every other view keeps the host's own
`DEFAULT_AUTHENTICATION_CLASSES`. The MCP tools' sub-requests reach the
REST API as the already-authenticated actor (server.py's `_call_api`),
so the resource views never see the PAT itself.

Returns `None` for any bearer token without the PAT prefix, so a host's
JWT authentication (listed after it) still handles platform-auth access
tokens at the MCP endpoint.
"""

from dataclasses import dataclass
from datetime import timedelta

from core_api.errors import Unauthorized
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication

from platform_mcp.models import PersonalAccessToken, hash_token, token_prefix

# `last_used_at` is written at most this often per token - an MCP session
# makes a request per tool call, no need for a write on every one.
_LAST_USED_RESOLUTION = timedelta(minutes=1)


@dataclass
class ActorStub:
    """All a resource view reads off `request.user` is `.id`.
    `is_authenticated` is a fixed `True` - DRF's `IsAuthenticated`
    checks it directly, and a stub only exists once a token verified."""

    id: str
    is_authenticated: bool = True


class PersonalAccessTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header[len("Bearer "):].strip()
        if not token.startswith(token_prefix()):
            return None

        row = PersonalAccessToken.objects.filter(token_hash=hash_token(token)).first()
        if row is None:
            raise Unauthorized("Invalid personal access token.")
        if row.is_expired:
            raise Unauthorized("This personal access token has expired.")

        now = timezone.now()
        if row.last_used_at is None or now - row.last_used_at > _LAST_USED_RESOLUTION:
            PersonalAccessToken.objects.filter(pk=row.pk).update(last_used_at=now)
        return (ActorStub(id=row.user_id), row)

    def authenticate_header(self, request):
        return "Bearer"
