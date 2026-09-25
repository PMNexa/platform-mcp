import base64
import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from platform_mcp.models import OAuthAccessToken, OAuthAuthorizationCode, OAuthGrant, PersonalAccessToken
from tests.testapp.models import Book

REDIRECT = "https://claude.ai/api/mcp/auth_callback"
VERIFIER = "v" * 64
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()


def form(client, path, data):
    """How OAuth clients post: application/x-www-form-urlencoded."""
    return client.post(path, urlencode(data), content_type="application/x-www-form-urlencoded")


def rpc(client, method, params=None):
    return client.post("/mcp", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}, format="json")


class OAuthFlow(TestCase):
    """What a connector does, step by step - each helper is one of them."""

    def setUp(self):
        cache.clear()  # the throttles' counts
        self.anon = APIClient()
        self.me = APIClient(headers={"X-As": "me"})

    def register(self, **extra):
        body = {"client_name": "Claude", "redirect_uris": [REDIRECT], **extra}
        response = self.anon.post("/mcp/oauth/register", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def params(self, client_id, **extra):
        return {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
            "state": "xyz",
            "scope": "mcp",
            "resource": "http://testserver/mcp",
            **extra,
        }

    def approve(self, client_id, user=None, **extra):
        response = (user or self.me).post("/mcp/oauth/authorize", {**self.params(client_id, **extra), "approve": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        redirect = urlsplit(response.json()["redirect_to"])
        self.assertEqual(f"{redirect.scheme}://{redirect.netloc}{redirect.path}", REDIRECT)
        query = parse_qs(redirect.query)
        self.assertEqual(query["state"], ["xyz"])
        self.assertEqual(query["iss"], ["http://testserver"])
        return query["code"][0]

    def exchange(self, client_id, code, **extra):
        return form(
            self.anon,
            "/mcp/oauth/token",
            {"grant_type": "authorization_code", "code": code, "client_id": client_id, "redirect_uri": REDIRECT, "code_verifier": VERIFIER, **extra},
        )

    def connect(self, user=None):
        client_id = self.register()["client_id"]
        response = self.exchange(client_id, self.approve(client_id, user))
        self.assertEqual(response.status_code, 200, response.content)
        return client_id, response.json()


class DiscoveryTests(OAuthFlow):
    def test_unauthenticated_mcp_points_at_the_metadata(self):
        response = rpc(self.anon, "ping")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response["WWW-Authenticate"],
            'Bearer resource_metadata="http://testserver/.well-known/oauth-protected-resource/mcp"',
        )

    def test_bad_token_says_invalid_token(self):
        response = rpc(APIClient(headers={"Authorization": "Bearer mcpat_nope"}), "ping")
        self.assertEqual(response.status_code, 401)
        self.assertIn('error="invalid_token"', response["WWW-Authenticate"])

    def test_protected_resource_metadata(self):
        for path in ("/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"):
            body = self.anon.get(path).json()
            self.assertEqual(body["resource"], "http://testserver/mcp")
            self.assertEqual(body["authorization_servers"], ["http://testserver"])

    def test_authorization_server_metadata(self):
        body = self.anon.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(body["issuer"], "http://testserver")
        self.assertEqual(body["authorization_endpoint"], "http://testserver/mcp/authorize")
        self.assertEqual(body["token_endpoint"], "http://testserver/mcp/oauth/token")
        self.assertEqual(body["registration_endpoint"], "http://testserver/mcp/oauth/register")
        self.assertEqual(body["code_challenge_methods_supported"], ["S256"])

    @override_settings(MCP_PUBLIC_URL="https://goals.example.com")
    def test_public_url_wins(self):
        body = self.anon.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(body["issuer"], "https://goals.example.com")


class RegistrationTests(OAuthFlow):
    def test_public_client(self):
        body = self.register()
        self.assertTrue(body["client_id"].startswith("mcpc_"))
        self.assertEqual(body["token_endpoint_auth_method"], "none")
        self.assertNotIn("client_secret", body)

    def test_confidential_client_gets_a_secret(self):
        body = self.register(token_endpoint_auth_method="client_secret_post")
        self.assertTrue(body["client_secret"])

    def test_redirect_uris_checked(self):
        for uris in ([], ["http://evil.example/cb"], ["javascript:alert(1)"], ["https://x.example/cb#frag"], "https://x"):
            response = self.anon.post("/mcp/oauth/register", {"redirect_uris": uris}, format="json")
            self.assertEqual(response.status_code, 400, uris)
            self.assertEqual(response.json()["error"], "invalid_redirect_uri")

    @override_settings(MCP_OAUTH_REGISTER_RATE="2/hour")
    def test_rate_limited(self):
        self.register()
        self.register()
        response = self.anon.post("/mcp/oauth/register", {"redirect_uris": [REDIRECT]}, format="json")
        self.assertEqual(response.status_code, 429)

    def test_loopback_http_allowed(self):
        self.register(redirect_uris=["http://localhost:33418/callback", "http://127.0.0.1/cb"])


class ConsentTests(OAuthFlow):
    def test_get_describes_the_request(self):
        client_id = self.register()["client_id"]
        response = self.me.get("/mcp/oauth/authorize", self.params(client_id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["client_name"], "Claude")
        self.assertEqual(response.json()["redirect_uri"], REDIRECT)

    def test_needs_a_session(self):
        client_id = self.register()["client_id"]
        self.assertEqual(self.anon.get("/mcp/oauth/authorize", self.params(client_id)).status_code, 401)

    def test_unknown_client_or_redirect_is_not_redirected_to(self):
        client_id = self.register()["client_id"]
        for params in (self.params("mcpc_nope"), self.params(client_id, redirect_uri="https://evil.example/cb")):
            response = self.me.get("/mcp/oauth/authorize", params)
            self.assertEqual(response.status_code, 400)
            self.assertIsNone(response.json()["redirect_to"])

    def test_other_errors_go_back_to_the_client(self):
        client_id = self.register()["client_id"]
        cases = {
            "invalid_request": {"code_challenge_method": "plain"},
            "unsupported_response_type": {"response_type": "token"},
            "invalid_scope": {"scope": "admin"},
            "invalid_target": {"resource": "https://elsewhere.example/mcp"},
        }
        for error, extra in cases.items():
            response = self.me.get("/mcp/oauth/authorize", self.params(client_id, **extra))
            self.assertEqual(response.status_code, 400)
            query = parse_qs(urlsplit(response.json()["redirect_to"]).query)
            self.assertEqual(query["error"], [error])
            self.assertEqual(query["state"], ["xyz"])

    def test_deny(self):
        client_id = self.register()["client_id"]
        response = self.me.post("/mcp/oauth/authorize", {**self.params(client_id), "approve": False}, format="json")
        query = parse_qs(urlsplit(response.json()["redirect_to"]).query)
        self.assertEqual(query["error"], ["access_denied"])
        self.assertFalse(OAuthAuthorizationCode.objects.exists())

    def test_a_token_cannot_approve(self):
        client_id, tokens = self.connect()
        bearer = APIClient(headers={"Authorization": f"Bearer {tokens['access_token']}"})
        response = bearer.post("/mcp/oauth/authorize", {**self.params(client_id), "approve": True}, format="json")
        self.assertIn(response.status_code, (401, 403))


class TokenTests(OAuthFlow):
    def test_full_flow_acts_as_the_user(self):
        Book.objects.create(owner="me", title="Mine")
        Book.objects.create(owner="them", title="Theirs")
        _, tokens = self.connect()
        self.assertTrue(tokens["access_token"].startswith("mcpat_"))
        self.assertTrue(tokens["refresh_token"].startswith("mcprt_"))
        self.assertEqual(tokens["token_type"], "Bearer")
        bearer = APIClient(headers={"Authorization": f"Bearer {tokens['access_token']}"})
        text = rpc(bearer, "tools/call", {"name": "books_list", "arguments": {}}).json()["result"]["content"][0]["text"]
        self.assertIn('"Mine"', text)
        self.assertNotIn("Theirs", text)
        self.assertIsNotNone(OAuthGrant.objects.get().last_used_at)

    def test_token_only_opens_mcp(self):
        _, tokens = self.connect()
        bearer = APIClient(headers={"Authorization": f"Bearer {tokens['access_token']}"})
        self.assertEqual(bearer.get("/books").status_code, 401)
        self.assertEqual(bearer.get("/mcp/tokens").status_code, 401)
        self.assertEqual(bearer.get("/mcp/oauth/grants").status_code, 401)

    def test_code_is_single_use(self):
        client_id = self.register()["client_id"]
        code = self.approve(client_id)
        self.assertEqual(self.exchange(client_id, code).status_code, 200)
        self.assertEqual(self.exchange(client_id, code).json()["error"], "invalid_grant")

    def test_code_checks(self):
        client_id = self.register()["client_id"]
        other = self.register()["client_id"]
        cases = [
            (other, {}),  # another client's code
            (client_id, {"code_verifier": "w" * 64}),
            (client_id, {"redirect_uri": "https://claude.ai/other"}),
        ]
        for cid, extra in cases:
            code = self.approve(client_id)
            response = self.exchange(cid, code, **extra)
            self.assertEqual(response.status_code, 400, extra)
            self.assertEqual(response.json()["error"], "invalid_grant")

    def test_expired_code(self):
        client_id = self.register()["client_id"]
        code = self.approve(client_id)
        OAuthAuthorizationCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.exchange(client_id, code).json()["error"], "invalid_grant")

    def test_refresh_rotates(self):
        client_id, tokens = self.connect()
        refresh = lambda token: form(  # noqa: E731
            self.anon,
            "/mcp/oauth/token", {"grant_type": "refresh_token", "refresh_token": token, "client_id": client_id}
        )
        response = refresh(tokens["refresh_token"])
        self.assertEqual(response.status_code, 200)
        new = response.json()
        self.assertNotEqual(new["refresh_token"], tokens["refresh_token"])
        self.assertEqual(refresh(tokens["refresh_token"]).json()["error"], "invalid_grant")
        bearer = APIClient(headers={"Authorization": f"Bearer {new['access_token']}"})
        self.assertEqual(rpc(bearer, "ping").status_code, 200)

    def test_expired_access_token(self):
        _, tokens = self.connect()
        OAuthAccessToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        bearer = APIClient(headers={"Authorization": f"Bearer {tokens['access_token']}"})
        self.assertEqual(rpc(bearer, "ping").status_code, 401)

    def test_confidential_client_must_authenticate(self):
        registered = self.register(token_endpoint_auth_method="client_secret_basic")
        client_id, secret = registered["client_id"], registered["client_secret"]
        code = self.approve(client_id)
        self.assertEqual(self.exchange(client_id, code).status_code, 401)
        code = self.approve(client_id)
        basic = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
        response = form(
            APIClient(headers={"Authorization": f"Basic {basic}"}),
            "/mcp/oauth/token",
            {"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT, "code_verifier": VERIFIER},
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_wrong_resource(self):
        client_id = self.register()["client_id"]
        response = self.exchange(client_id, self.approve(client_id), resource="https://elsewhere.example/mcp")
        self.assertEqual(response.json()["error"], "invalid_target")

    def test_revoke_ends_the_connection(self):
        client_id, tokens = self.connect()
        self.assertEqual(form(self.anon, "/mcp/oauth/revoke", {"token": tokens["refresh_token"], "client_id": client_id}).status_code, 200)
        self.assertFalse(OAuthGrant.objects.exists())
        bearer = APIClient(headers={"Authorization": f"Bearer {tokens['access_token']}"})
        self.assertEqual(rpc(bearer, "ping").status_code, 401)


class GrantApiTests(OAuthFlow):
    def test_list_and_disconnect_own_only(self):
        self.connect()
        self.connect(user=APIClient(headers={"X-As": "them"}))
        items = self.me.get("/mcp/oauth/grants").json()["items"]
        self.assertEqual([item["client_name"] for item in items], ["Claude"])
        theirs = OAuthGrant.objects.get(user_id="them")
        self.assertEqual(self.me.delete(f"/mcp/oauth/grants/{theirs.pk}").status_code, 404)
        self.assertEqual(self.me.delete(f"/mcp/oauth/grants/{items[0]['id']}").status_code, 204)
        self.assertEqual(list(OAuthGrant.objects.values_list("user_id", flat=True)), ["them"])

    def test_pat_cannot_see_grants(self):
        _, token = PersonalAccessToken.issue(user_id="me", name="cli")
        self.assertEqual(APIClient(headers={"Authorization": f"Bearer {token}"}).get("/mcp/oauth/grants").status_code, 401)
