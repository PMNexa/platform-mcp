from rest_framework.authentication import BaseAuthentication

from platform_mcp.authentication import ActorStub


class HeaderAuthentication(BaseAuthentication):
    """Stands in for a host's login (platform-auth's JWT): `X-As: <id>`
    authenticates as that actor."""

    def authenticate(self, request):
        actor = request.headers.get("X-As")
        return (ActorStub(id=actor), None) if actor else None

    def authenticate_header(self, request):
        return "Bearer"
