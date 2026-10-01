"""What platform-mcp tells the host's account admin (`core_api.system`):
a user's personal access tokens and connected apps are listed and
revoked with their sessions, and go with the account when it's deleted.
Registered in apps.py."""

from core_api.system import SessionProvider

from platform_mcp.models import OAuthAuthorizationCode, OAuthGrant, PersonalAccessToken


def _tokens(user_id: str) -> list[dict]:
    return [
        {"id": str(t.id), "label": f"{t.name} ({t.prefix}…)", "created_at": t.created_at,
         "last_used_at": t.last_used_at, "expires_at": t.expires_at}
        for t in PersonalAccessToken.objects.filter(user_id=user_id)
    ]


def _connections(user_id: str) -> list[dict]:
    return [
        {"id": str(g.id), "label": g.client.name, "created_at": g.created_at, "last_used_at": g.last_used_at,
         "expires_at": g.refresh_expires_at}
        for g in OAuthGrant.objects.filter(user_id=user_id).select_related("client")
    ]


def _revoke_tokens(user_id: str) -> int:
    return PersonalAccessToken.objects.filter(user_id=user_id).delete()[1].get("platform_mcp.PersonalAccessToken", 0)


def _revoke_connections(user_id: str) -> int:
    OAuthAuthorizationCode.objects.filter(user_id=user_id).delete()
    return OAuthGrant.objects.filter(user_id=user_id).delete()[1].get("platform_mcp.OAuthGrant", 0)


PROVIDERS = [
    SessionProvider("mcp_tokens", "MCP access tokens", _tokens, _revoke_tokens),
    SessionProvider("mcp_connections", "Connected AI apps", _connections, _revoke_connections),
]


def on_user_removed(sender, user_id, transfer_to=None, **kwargs):
    """Credentials never transfer - they're the user's own."""
    _revoke_tokens(user_id)
    _revoke_connections(user_id)


def export(user_id: str) -> dict:
    """Token names and dates - never the token hashes."""
    return {"access_tokens": _tokens(user_id), "connected_apps": _connections(user_id)}
