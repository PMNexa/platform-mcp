"""Personal access tokens - long-lived bearer tokens an MCP client
(Claude Code, Codex, Cursor, ...) is configured with, since a
platform-auth access token expires every 15 minutes.

`user_id` is a bare string, not a ForeignKey - this module has no User
table of its own (same "module with no User table" pattern as
platform-org/goalnexa): it's whatever `request.user.id` was when the
token was created, and it's what `request.user.id` resolves to again
when the token is used.

Only a SHA-256 of the token is stored. The token itself is shown once,
in the create response; `prefix` (its first few characters) is kept so
a user can tell their tokens apart in a list.
"""

import hashlib
import secrets
import string

from core_api.utils import generate_uuid7
from django.conf import settings
from django.db import models
from django.utils import timezone


def token_prefix() -> str:
    """What every token starts with - how `PersonalAccessTokenAuthentication`
    tells a PAT from a JWT without trying to decode it."""
    return getattr(settings, "MCP_TOKEN_PREFIX", "pat_")


# Letters and digits only: a token selects with one double-click and
# never needs quoting or escaping in a shell or a config file.
_ALPHABET = string.ascii_letters + string.digits


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class PersonalAccessToken(models.Model):
    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    user_id = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=100)
    prefix = models.CharField(max_length=32)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def issue(cls, *, user_id, name: str, expires_at=None) -> tuple["PersonalAccessToken", str]:
        """Create a token row; returns it with the plaintext token - the
        only time the plaintext exists."""
        token = token_prefix() + "".join(secrets.choice(_ALPHABET) for _ in range(40))
        row = cls.objects.create(
            user_id=str(user_id),
            name=name,
            prefix=token[: len(token_prefix()) + 6],
            token_hash=hash_token(token),
            expires_at=expires_at,
        )
        return row, token

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= timezone.now()


# --- OAuth 2.1 (oauth.py) -------------------------------------------------
#
# How clients that can't send a static bearer token (Claude's custom
# connectors) sign in: they register themselves (`OAuthClient`), send the
# user to the consent page, trade the resulting `OAuthAuthorizationCode`
# for an `OAuthGrant` - one per connection, what the user sees and can
# revoke - and call the MCP endpoint with its short-lived
# `OAuthAccessToken`s. Every secret is stored as a SHA-256 only, like a
# PAT.

# Distinct from any PAT prefix, so each authentication class can tell
# its own tokens apart without a lookup.
OAUTH_ACCESS_TOKEN_PREFIX = "mcpat_"
OAUTH_REFRESH_TOKEN_PREFIX = "mcprt_"


def random_secret(prefix: str = "", length: int = 40) -> str:
    return prefix + "".join(secrets.choice(_ALPHABET) for _ in range(length))


class OAuthClient(models.Model):
    """A client registered through Dynamic Client Registration (RFC 7591).
    Public (`token_endpoint_auth_method = "none"`, PKCE only) unless it
    asked for a secret."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    client_id = models.CharField(max_length=64, unique=True)
    client_secret_hash = models.CharField(max_length=64, blank=True)
    token_endpoint_auth_method = models.CharField(max_length=32, default="none")
    name = models.CharField(max_length=200)
    redirect_uris = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthAuthorizationCode(models.Model):
    """What the consent page's "Allow" produces: single use, short-lived,
    bound to the client, redirect URI and PKCE challenge it was issued
    for."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    code_hash = models.CharField(max_length=64, unique=True)
    client = models.ForeignKey(OAuthClient, on_delete=models.CASCADE, related_name="+")
    user_id = models.CharField(max_length=64)
    redirect_uri = models.TextField()
    code_challenge = models.CharField(max_length=128)
    scope = models.CharField(max_length=200, blank=True)
    resource = models.TextField(blank=True)
    expires_at = models.DateTimeField()


class OAuthGrant(models.Model):
    """One connected app: a user's approval of a client, alive for as long
    as its (rotating) refresh token keeps being used. Deleting it cuts the
    connection - its access tokens go with it."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    client = models.ForeignKey(OAuthClient, on_delete=models.CASCADE, related_name="grants")
    user_id = models.CharField(max_length=64, db_index=True)
    scope = models.CharField(max_length=200, blank=True)
    resource = models.TextField(blank=True)
    refresh_token_hash = models.CharField(max_length=64, unique=True)
    refresh_expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class OAuthAccessToken(models.Model):
    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    grant = models.ForeignKey(OAuthGrant, on_delete=models.CASCADE, related_name="access_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()
