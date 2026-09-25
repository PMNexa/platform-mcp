"""OAuth 2.1 for the MCP endpoint, as MCP's authorization spec lays it
out - how a client that can't be handed a static bearer token (Claude's
custom connectors, in the desktop app and on claude.ai) signs in:

1. It calls the MCP endpoint, gets a 401 whose `WWW-Authenticate` points
   at the protected-resource metadata (RFC 9728), and from there finds
   this authorization server's metadata (RFC 8414).
2. It registers itself (Dynamic Client Registration, RFC 7591).
3. It opens the consent page - a FRONTEND page (platform-mcp-frontend's
   `mcp-authorize` route, `MCP_OAUTH_AUTHORIZE_PAGE`), behind the host's
   own login. "Allow" posts to `AuthorizeView` with the session's access
   token and follows the redirect it returns, carrying a code.
4. It trades the code (+ PKCE verifier) for an access token and a
   rotating refresh token at `TokenView`.

The access token opens the MCP endpoint only, exactly like a PAT
(authentication.py). The approval is an `OAuthGrant`, listed and
revocable next to the PATs (`GrantListView`/`GrantDetailView`).

The well-known documents live at the host's ROOT, not under the API
prefix - `wellknown_urls.py`, mounted by the host with
`path("", include("platform_mcp.wellknown_urls"))`.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
from datetime import timedelta
from urllib.parse import unquote, urlencode, urlsplit

from django.conf import settings
from django.http import JsonResponse
from django.urls import reverse
from django.utils import timezone
from rest_framework.parsers import FormParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from platform_mcp.models import (
    OAUTH_ACCESS_TOKEN_PREFIX,
    OAUTH_REFRESH_TOKEN_PREFIX,
    OAuthAccessToken,
    OAuthAuthorizationCode,
    OAuthClient,
    OAuthGrant,
    hash_token,
    random_secret,
)
from platform_mcp.skills import context

SCOPE = "mcp"
CODE_TTL = timedelta(minutes=10)


def _access_ttl() -> timedelta:
    return timedelta(seconds=getattr(settings, "MCP_OAUTH_ACCESS_TOKEN_TTL", 3600))


def _refresh_ttl() -> timedelta:
    return timedelta(days=getattr(settings, "MCP_OAUTH_REFRESH_TOKEN_DAYS", 30))


# --- URLs -----------------------------------------------------------------


def urls(request) -> dict[str, str]:
    values = context(request)
    app_url = values["app_url"]
    authorize_page = getattr(
        settings, "MCP_OAUTH_AUTHORIZE_PAGE", getattr(settings, "MCP_TOKENS_PAGE", "/mcp") + "/authorize"
    )
    return {
        "issuer": app_url,
        "resource": values["mcp_url"],
        "server_name": values["server_name"],
        "authorization_endpoint": app_url + authorize_page,
        "token_endpoint": app_url + reverse("platform_mcp:oauth-token"),
        "registration_endpoint": app_url + reverse("platform_mcp:oauth-register"),
        "revocation_endpoint": app_url + reverse("platform_mcp:oauth-revoke"),
        # RFC 9728's path-inserted form: /.well-known/<name>/<resource path>.
        "resource_metadata": app_url + "/.well-known/oauth-protected-resource" + urlsplit(values["mcp_url"]).path,
    }


def www_authenticate(request, *, error: str | None = None) -> str:
    """The MCP endpoint's 401 header - how a client discovers OAuth."""
    value = f'Bearer resource_metadata="{urls(request)["resource_metadata"]}"'
    return value + (f', error="{error}"' if error else "")


def protected_resource_metadata(request) -> dict:
    u = urls(request)
    return {
        "resource": u["resource"],
        "authorization_servers": [u["issuer"]],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
        "resource_name": u["server_name"],
    }


def authorization_server_metadata(request) -> dict:
    u = urls(request)
    return {
        "issuer": u["issuer"],
        "authorization_endpoint": u["authorization_endpoint"],
        "token_endpoint": u["token_endpoint"],
        "registration_endpoint": u["registration_endpoint"],
        "revocation_endpoint": u["revocation_endpoint"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "revocation_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "scopes_supported": [SCOPE],
        "authorization_response_iss_parameter_supported": True,
    }


def _same_resource(given: str, ours: str) -> bool:
    return given.rstrip("/") == ours.rstrip("/")


def _metadata(document: dict) -> JsonResponse:
    # Public, and readable cross-origin for browser-based clients (e.g.
    # the MCP Inspector).
    response = JsonResponse(document)
    response["Access-Control-Allow-Origin"] = "*"
    return response


def protected_resource_metadata_view(request, rest=""):
    return _metadata(protected_resource_metadata(request))


def authorization_server_metadata_view(request, rest=""):
    return _metadata(authorization_server_metadata(request))


# --- Shared bits ----------------------------------------------------------


class _Throttle(AnonRateThrottle):
    """Per client IP (DRF's `NUM_PROXIES` decides which); the rate comes
    from a setting, so a host needn't list a scope in `DEFAULT_THROTTLE_RATES`."""

    setting = ""
    default = ""

    def get_rate(self):
        return getattr(settings, self.setting, self.default)


class _RegisterThrottle(_Throttle):
    scope = "mcp_oauth_register"
    setting = "MCP_OAUTH_REGISTER_RATE"
    default = "20/hour"


class _TokenThrottle(_Throttle):
    scope = "mcp_oauth_token"
    setting = "MCP_OAUTH_TOKEN_RATE"
    default = "60/min"


class _PublicOAuthView(APIView):
    """OAuth's own endpoints: unauthenticated (a client authenticates in
    the body, if at all), OAuth's own error shape, never cached."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        response["Pragma"] = "no-cache"
        return response


def _error(error: str, description: str, status: int = 400) -> Response:
    return Response({"error": error, "error_description": description}, status=status)


def _safe_redirect_uri(uri: str) -> bool:
    """Absolute, no fragment; `http` only to the local machine (a native
    client's loopback listener, RFC 8252); never a script-ish scheme."""
    try:
        parts = urlsplit(uri)
    except ValueError:
        return False
    if not parts.scheme or parts.fragment or parts.scheme.lower() in {"javascript", "data", "vbscript", "file"}:
        return False
    if parts.scheme == "http":
        return parts.hostname in {"localhost", "127.0.0.1", "::1"}
    if parts.scheme == "https":
        return bool(parts.hostname)
    return True  # a native app's own scheme, e.g. cursor://


# --- Dynamic Client Registration -----------------------------------------


class RegisterView(_PublicOAuthView):
    parser_classes = [JSONParser]
    throttle_classes = [_RegisterThrottle]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        redirect_uris = data.get("redirect_uris")
        if (
            not isinstance(redirect_uris, list)
            or not redirect_uris
            or len(redirect_uris) > 10
            or not all(isinstance(uri, str) and len(uri) <= 2000 and _safe_redirect_uri(uri) for uri in redirect_uris)
        ):
            return _error("invalid_redirect_uri", "redirect_uris must list 1-10 absolute https (or loopback http) URIs.")
        method = data.get("token_endpoint_auth_method") or "none"
        if method not in {"none", "client_secret_post", "client_secret_basic"}:
            return _error("invalid_client_metadata", f"Unsupported token_endpoint_auth_method {method!r}.")
        grant_types = data.get("grant_types") or ["authorization_code", "refresh_token"]
        if not isinstance(grant_types, list) or not set(grant_types) <= {"authorization_code", "refresh_token"}:
            return _error("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.")
        name = str(data.get("client_name") or "").strip()[:200] or urlsplit(redirect_uris[0]).hostname or "MCP client"

        secret = random_secret(length=48) if method != "none" else ""
        client = OAuthClient.objects.create(
            client_id=random_secret("mcpc_", 32),
            client_secret_hash=hash_token(secret) if secret else "",
            token_endpoint_auth_method=method,
            name=name,
            redirect_uris=redirect_uris,
        )
        body = {
            "client_id": client.client_id,
            "client_id_issued_at": int(client.created_at.timestamp()),
            "client_name": client.name,
            "redirect_uris": client.redirect_uris,
            "token_endpoint_auth_method": method,
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": SCOPE,
        }
        if secret:
            body |= {"client_secret": secret, "client_secret_expires_at": 0}
        return Response(body, status=201)


# --- Client authentication (token + revocation endpoints) -----------------


def _authenticate_client(request) -> tuple[OAuthClient | None, Response | None]:
    """RFC 6749 §2.3: `client_secret_basic` (Authorization: Basic),
    `client_secret_post` (in the body), or a public client (`client_id`
    in the body, no secret - PKCE is what protects its codes)."""
    client_id, secret = request.data.get("client_id"), request.data.get("client_secret")
    header = request.headers.get("Authorization", "")
    basic = header.lower().startswith("basic ")
    if basic:
        try:
            decoded = base64.b64decode(header[6:].strip()).decode()
            client_id, _, secret = decoded.partition(":")
            client_id, secret = unquote(client_id), unquote(secret)
        except (binascii.Error, UnicodeDecodeError):
            return None, _invalid_client(basic)

    client = OAuthClient.objects.filter(client_id=client_id or "").first()
    if client is None:
        return None, _invalid_client(basic)
    if client.client_secret_hash:
        if not secret or not hmac.compare_digest(hash_token(secret), client.client_secret_hash):
            return None, _invalid_client(basic)
    elif secret:
        return None, _invalid_client(basic)
    return client, None


def _invalid_client(basic: bool) -> Response:
    response = _error("invalid_client", "Unknown client or wrong client credentials.", status=401)
    if basic:
        response["WWW-Authenticate"] = 'Basic realm="oauth"'
    return response


def _token_response(grant: OAuthGrant) -> Response:
    """A fresh access token, and a rotated refresh token that slides the
    grant's lifetime forward - the previous refresh token stops working."""
    now = timezone.now()
    access = random_secret(OAUTH_ACCESS_TOKEN_PREFIX)
    refresh = random_secret(OAUTH_REFRESH_TOKEN_PREFIX)
    grant.access_tokens.filter(expires_at__lte=now).delete()
    OAuthAccessToken.objects.create(grant=grant, token_hash=hash_token(access), expires_at=now + _access_ttl())
    grant.refresh_token_hash = hash_token(refresh)
    grant.refresh_expires_at = now + _refresh_ttl()
    grant.save(update_fields=["refresh_token_hash", "refresh_expires_at"])
    return Response(
        {
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": int(_access_ttl().total_seconds()),
            "refresh_token": refresh,
            "scope": grant.scope or SCOPE,
        }
    )


def _pkce_ok(verifier: str, challenge: str) -> bool:
    if not 43 <= len(verifier) <= 128:
        return False
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return hmac.compare_digest(digest, challenge)


class TokenView(_PublicOAuthView):
    parser_classes = [FormParser, JSONParser]
    throttle_classes = [_TokenThrottle]

    def post(self, request):
        client, failure = _authenticate_client(request)
        if failure:
            return failure
        grant_type = request.data.get("grant_type")
        resource = request.data.get("resource")
        if resource and not _same_resource(resource, urls(request)["resource"]):
            return _error("invalid_target", "This server only issues tokens for its own MCP endpoint.")
        if grant_type == "authorization_code":
            return self._authorization_code(request, client)
        if grant_type == "refresh_token":
            return self._refresh_token(request, client)
        return _error("unsupported_grant_type", "Use authorization_code or refresh_token.")

    def _authorization_code(self, request, client):
        code = OAuthAuthorizationCode.objects.filter(
            code_hash=hash_token(request.data.get("code") or ""), client=client
        ).first()
        if code is None:
            return _error("invalid_grant", "Unknown, expired or already used authorization code.")
        # Single use, whatever happens next.
        code.delete()
        if code.expires_at <= timezone.now():
            return _error("invalid_grant", "Unknown, expired or already used authorization code.")
        if request.data.get("redirect_uri") and request.data.get("redirect_uri") != code.redirect_uri:
            return _error("invalid_grant", "redirect_uri doesn't match the authorization request.")
        if not _pkce_ok(request.data.get("code_verifier") or "", code.code_challenge):
            return _error("invalid_grant", "PKCE verification failed.")
        # A throwaway refresh hash - `_token_response` issues the real one.
        grant = OAuthGrant.objects.create(
            client=client,
            user_id=code.user_id,
            scope=code.scope,
            resource=code.resource,
            refresh_token_hash=hash_token(random_secret()),
            refresh_expires_at=timezone.now(),
        )
        return _token_response(grant)

    def _refresh_token(self, request, client):
        grant = OAuthGrant.objects.filter(
            refresh_token_hash=hash_token(request.data.get("refresh_token") or ""), client=client
        ).first()
        if grant is None or grant.refresh_expires_at <= timezone.now():
            return _error("invalid_grant", "Unknown, expired or revoked refresh token.")
        return _token_response(grant)


class RevokeView(_PublicOAuthView):
    """RFC 7009. Revoking either token ends the whole connection (the
    grant). Answers 200 even for an unknown token, as the RFC says."""

    parser_classes = [FormParser, JSONParser]
    throttle_classes = [_TokenThrottle]

    def post(self, request):
        client, failure = _authenticate_client(request)
        if failure:
            return failure
        token_hash = hash_token(request.data.get("token") or "")
        OAuthGrant.objects.filter(client=client, refresh_token_hash=token_hash).delete()
        access = OAuthAccessToken.objects.filter(token_hash=token_hash, grant__client=client).first()
        if access is not None:
            access.grant.delete()
        return Response(status=200)


# --- Consent (called by the frontend page, with the user's session) --------


class _AuthorizeError(Exception):
    def __init__(self, message: str, *, error: str = "invalid_request", redirect_to: str | None = None):
        super().__init__(message)
        self.message, self.error, self.redirect_to = message, error, redirect_to


def _with_query(uri: str, params: dict) -> str:
    return uri + ("&" if urlsplit(uri).query else "?") + urlencode({k: v for k, v in params.items() if v})


def validate_authorization_request(request, params) -> tuple[OAuthClient, dict]:
    """The checks an authorization endpoint makes before showing consent.
    A bad client or redirect URI is shown to the user, never redirected to
    (that would make this an open redirect); anything else goes back to
    the client as an OAuth error on its redirect URI."""
    client = OAuthClient.objects.filter(client_id=params.get("client_id") or "").first()
    if client is None:
        raise _AuthorizeError("This app isn't registered with this server. Try connecting it again.")
    redirect_uri = params.get("redirect_uri") or (client.redirect_uris[0] if len(client.redirect_uris) == 1 else "")
    if redirect_uri not in client.redirect_uris:
        raise _AuthorizeError("The app asked to be sent back to an address it didn't register.")

    state = params.get("state")
    ours = urls(request)

    def fail(error, message):
        raise _AuthorizeError(
            message, error=error, redirect_to=_with_query(redirect_uri, {"error": error, "error_description": message, "state": state, "iss": ours["issuer"]})
        )

    if params.get("response_type") != "code":
        fail("unsupported_response_type", "Only response_type=code is supported.")
    if not params.get("code_challenge") or params.get("code_challenge_method") != "S256":
        fail("invalid_request", "PKCE with code_challenge_method=S256 is required.")
    requested = set((params.get("scope") or "").split())
    if not requested <= {SCOPE}:
        fail("invalid_scope", f"The only scope is {SCOPE!r}.")
    resource = params.get("resource") or ""
    if resource and not _same_resource(resource, ours["resource"]):
        fail("invalid_target", "This server can only authorize access to its own MCP endpoint.")
    return client, {
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": params["code_challenge"],
        "scope": SCOPE,
        "resource": resource or ours["resource"],
    }


def _authorize_error_response(exc: _AuthorizeError) -> Response:
    return Response({"code": exc.error, "message": exc.message, "redirect_to": exc.redirect_to}, status=400)
