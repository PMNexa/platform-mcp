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
