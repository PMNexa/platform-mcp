import json
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from platform_mcp.server import _tools_for
from tests.testapp.models import Book, Shelf, Tag


class McpTests(TestCase):
    def setUp(self):
        self.client = APIClient(headers={"X-As": "me"})
        self.next_id = 0

    def rpc(self, method, params=None):
        self.next_id += 1
        response = self.client.post(
            "/mcp", {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params or {}}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def call(self, name, **arguments):
        result = self.rpc("tools/call", {"name": name, "arguments": arguments})["result"]
        text = result["content"][0]["text"]
        return result["isError"], text if result["isError"] or text == "Done." else json.loads(text)

    def tools(self):
        return {tool["name"]: tool for tool in self.rpc("tools/list")["result"]["tools"]}

    def test_initialize(self):
        result = self.rpc("initialize", {"protocolVersion": "2025-03-26"})["result"]
        self.assertEqual(result["protocolVersion"], "2025-03-26")
        self.assertIn("tools", result["capabilities"])

    def test_notification_gets_202(self):
        response = self.client.post("/mcp", {"jsonrpc": "2.0", "method": "notifications/initialized"}, format="json")
        self.assertEqual(response.status_code, 202)

    def test_unknown_method(self):
        self.assertEqual(self.rpc("nope")["error"]["code"], -32601)

    def test_tools_derived_from_schema(self):
        tools = self.tools()
        self.assertIn("books_list", tools)
        self.assertIn("books_link", tools)
        self.assertNotIn("shelves_link", tools)  # only one_to_many relations
        create = tools["books_create"]["inputSchema"]
        self.assertEqual(create["required"], ["title", "owner"])
        self.assertNotIn("id", create["properties"])
        self.assertNotIn("tags", create["properties"])  # to-many: via _link
        self.assertEqual(create["properties"]["ref"]["format"], "uuid")
        self.assertIn("null", create["properties"]["ref"]["type"])
        self.assertIn("q", tools["books_list"]["inputSchema"]["properties"])
        self.assertNotIn("q", tools["tags_list"]["inputSchema"]["properties"])

    def test_read_only_parent_relation_is_an_input(self):
        schema = {
            "label": "check-in",
            "label_plural": "check-ins",
            "fields": [
                {"name": "id", "type": "string", "required": False, "read_only": True, "label": "Id"},
                {"name": "value", "type": "number", "required": True, "read_only": False, "label": "Value"},
                {"name": "metric", "type": "relation", "required": False, "read_only": True, "label": "Metric", "many": False},
            ],
        }
        tools = {tool["name"]: tool for tool in _tools_for("check_ins", schema)}
        create = tools["check_ins_create"]["inputSchema"]
        self.assertIn("metric", create["properties"])
        self.assertNotIn("id", create["properties"])  # read-only, not a relation
        self.assertEqual(create["required"], ["value"])
        self.assertIn("metric", tools["check_ins_update"]["inputSchema"]["properties"])

    def test_crud_goes_through_the_api(self):
        error, book = self.call("books_create", title="Dune", owner="me")
        self.assertFalse(error)
        error, fetched = self.call("books_get", id=book["id"])
        self.assertEqual(fetched["title"], "Dune")
        error, updated = self.call("books_update", id=book["id"], title="Dune Messiah")
        self.assertEqual(updated["title"], "Dune Messiah")
        error, text = self.call("books_delete", id=book["id"])
        self.assertEqual((error, text), (False, "Done."))
        self.assertFalse(Book.objects.exists())

    def test_list_filters_and_scoping(self):
        Book.objects.create(owner="me", title="Dune")
        Book.objects.create(owner="me", title="Emma")
        Book.objects.create(owner="them", title="Dunes of theirs")
        error, page = self.call("books_list", filter={"title.icontains": "dun"})
        self.assertEqual([row["title"] for row in page["items"]], ["Dune"])
        error, page = self.call("books_list", q="emma")
        self.assertEqual(page["total"], 1)
        error, page = self.call("books_list", filter={"ref.isnull": True}, sort="-title")
        self.assertEqual([row["title"] for row in page["items"]], ["Emma", "Dune"])

    def test_row_outside_scope_is_an_error(self):
        theirs = Book.objects.create(owner="them", title="Hidden")
        error, text = self.call("books_get", id=theirs.pk)
        self.assertTrue(error)
        self.assertIn("HTTP 404", text)

    def test_validation_error_is_reported(self):
        error, text = self.call("books_create", owner="me")
        self.assertTrue(error)
        self.assertIn("title", text)

    def test_link_respects_related_scope(self):
        book = Book.objects.create(owner="me", title="Dune")
        mine = Tag.objects.create(owner="me", name="scifi")
        theirs = Tag.objects.create(owner="them", name="secret")
        error, _ = self.call("books_link", id=book.pk, relation="tags", ids=[mine.pk, theirs.pk])
        self.assertTrue(error)
        error, _ = self.call("books_link", id=book.pk, relation="tags", ids=[mine.pk])
        self.assertFalse(error)
        self.assertEqual(list(book.tags.all()), [mine])
        error, _ = self.call("books_unlink", id=book.pk, relation="tags", ids=[mine.pk])
        self.assertEqual(list(book.tags.all()), [])

    def test_include_sideloads(self):
        shelf = Shelf.objects.create(owner="me", name="Top")
        book = Book.objects.create(owner="me", title="Dune", shelf=shelf)
        error, fetched = self.call("books_get", id=book.pk, include=["shelf"])
        self.assertEqual(fetched["shelf"]["name"], "Top")

    def test_unknown_tool(self):
        response = self.rpc("tools/call", {"name": "nope_list", "arguments": {}})
        self.assertEqual(response["error"]["code"], -32602)

    def test_bad_filter_is_a_tool_error(self):
        error, text = self.call("books_list", filter={"title.name.icontains": "x"})
        self.assertTrue(error)
        self.assertIn("HTTP 400", text)

    def test_crash_behind_a_tool_is_a_tool_error(self):
        with mock.patch("platform_mcp.server._call_api", side_effect=RuntimeError("boom")), self.assertLogs("platform_mcp.server"):
            error, text = self.call("books_list")
        self.assertTrue(error)
        self.assertIn("HTTP 500", text)
        self.assertNotIn("boom", text)
