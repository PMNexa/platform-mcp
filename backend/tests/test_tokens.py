from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from platform_mcp.models import PersonalAccessToken
from tests.testapp.models import Book


def rpc(client, method, params=None):
    return client.post("/mcp", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}, format="json")


class TokenApiTests(TestCase):
    def setUp(self):
        self.client = APIClient(headers={"X-As": "me"})

    def test_create_returns_the_token_once(self):
        response = self.client.post("/mcp/tokens", {"name": "laptop", "expires_in_days": 30}, format="json")
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["token"].startswith("pat_"))
        self.assertTrue(body["token"].startswith(body["prefix"]))
        self.assertIsNotNone(body["expires_at"])
        row = PersonalAccessToken.objects.get()
        self.assertEqual(row.user_id, "me")
        self.assertNotIn(body["token"], row.token_hash)
        listed = self.client.get("/mcp/tokens").json()["items"]
        self.assertEqual([t["name"] for t in listed], ["laptop"])
        self.assertNotIn("token", listed[0])

    def test_name_required(self):
        response = self.client.post("/mcp/tokens", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_only_own_tokens(self):
        theirs, _ = PersonalAccessToken.issue(user_id="them", name="theirs")
        self.assertEqual(self.client.get("/mcp/tokens").json()["items"], [])
        self.assertEqual(self.client.delete(f"/mcp/tokens/{theirs.pk}").status_code, 404)
        self.assertTrue(PersonalAccessToken.objects.filter(pk=theirs.pk).exists())

    def test_revoke(self):
        row, token = PersonalAccessToken.issue(user_id="me", name="old")
        self.assertEqual(self.client.delete(f"/mcp/tokens/{row.pk}").status_code, 204)
        pat = APIClient(headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(rpc(pat, "ping").status_code, 401)

    def test_anonymous_rejected(self):
        self.assertEqual(APIClient().get("/mcp/tokens").status_code, 401)

    def test_pat_cannot_manage_tokens(self):
        _, token = PersonalAccessToken.issue(user_id="me", name="cli")
        pat = APIClient(headers={"Authorization": f"Bearer {token}"})
        # The token views don't accept a PAT at all - it's MCP-only.
        self.assertEqual(pat.get("/mcp/tokens").status_code, 401)
        self.assertEqual(pat.post("/mcp/tokens", {"name": "more"}, format="json").status_code, 401)


class PatAtMcpTests(TestCase):
    def test_pat_acts_as_its_owner(self):
        Book.objects.create(owner="me", title="Mine")
        Book.objects.create(owner="them", title="Theirs")
        row, token = PersonalAccessToken.issue(user_id="me", name="cli")
        pat = APIClient(headers={"Authorization": f"Bearer {token}"})
        response = rpc(pat, "tools/call", {"name": "books_list", "arguments": {}})
        self.assertEqual(response.status_code, 200)
        self.assertIn('"Mine"', response.json()["result"]["content"][0]["text"])
        self.assertNotIn("Theirs", response.json()["result"]["content"][0]["text"])
        row.refresh_from_db()
        self.assertIsNotNone(row.last_used_at)

    def test_pat_only_opens_mcp(self):
        _, token = PersonalAccessToken.issue(user_id="me", name="cli")
        pat = APIClient(headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(pat.get("/books").status_code, 401)

    def test_unknown_and_expired_tokens(self):
        self.assertEqual(rpc(APIClient(headers={"Authorization": "Bearer pat_nope"}), "ping").status_code, 401)
        _, token = PersonalAccessToken.issue(
            user_id="me", name="old", expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(rpc(APIClient(headers={"Authorization": f"Bearer {token}"}), "ping").status_code, 401)

    def test_anonymous_rejected(self):
        self.assertEqual(rpc(APIClient(), "ping").status_code, 401)
