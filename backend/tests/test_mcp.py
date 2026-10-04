import json
from unittest import mock

from django.test import TestCase, override_settings
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

    def test_instructions_include_each_apps_own(self):
        text = self.rpc("initialize")["result"]["instructions"]
        self.assertIn("_schema first", text)
        self.assertIn("Shelves hold books. The app is at http://testserver.", text)
        with override_settings(MCP_INSTRUCTIONS="Hello."):
            self.assertTrue(self.rpc("initialize")["result"]["instructions"].startswith("Hello.\n\nShelves"))

    @override_settings(MCP_RESOURCES=["books", "tags"])
    def test_resources_setting_limits_the_tools(self):
        tools = self.tools()
        self.assertIn("books_list", tools)
        self.assertIn("tags_list", tools)
        self.assertNotIn("shelves_list", tools)
        self.assertNotIn("clubs_list", tools)
        self.assertEqual(self.rpc("tools/call", {"name": "shelves_list", "arguments": {}})["error"]["code"], -32602)
        # A relation to a resource that's left out no longer names its tool.
        self.assertNotIn("shelves_list", tools["books_create"]["inputSchema"]["properties"]["shelf"]["description"])

    def test_custom_tools(self):
        tools = self.tools()
        self.assertTrue(tools["shelves_summary"]["annotations"]["readOnlyHint"])
        self.assertNotIn("path", tools["shelves_summary"])
        self.assertNotIn("method", tools["shelves_summary_set"])
        # GET: the path placeholder is filled, the rest is the query; runs as the caller.
        self.assertEqual(self.call("shelves_summary", id=7, days=30), (False, {"shelf": "7", "as": "me", "days": "30"}))
        # Non-GET: named arguments in the query, the rest in the body.
        self.assertEqual(
            self.call("shelves_summary_set", id="a", dry_run=True, note="hi"),
            (False, {"shelf": "a", "dry_run": "1", "body": {"note": "hi"}}),
        )
        # A placeholder can't climb out of its path segment.
        error, data = self.call("shelves_summary", id="../../mcp/tokens")
        self.assertEqual((error, data["shelf"]), (False, "..%2F..%2Fmcp%2Ftokens"))

    def test_every_tool_has_a_title_and_all_three_hints(self):
        """What a directory review checks - and what clients use to decide
        which calls run without asking."""
        tools = self.tools()
        for name, tool in tools.items():
            with self.subTest(name):
                annotations = tool["annotations"]
                self.assertTrue(tool["title"])
                self.assertEqual(annotations["title"], tool["title"])
                self.assertIsInstance(annotations["readOnlyHint"], bool)
                self.assertIsInstance(annotations["destructiveHint"], bool)
                self.assertIsInstance(annotations["openWorldHint"], bool)
                self.assertLessEqual(len(name), 64)
        self.assertEqual(tools["books_list"]["title"], "List books")
        self.assertTrue(tools["books_get"]["annotations"]["readOnlyHint"])
        self.assertEqual(
            {k: tools["books_create"]["annotations"][k] for k in ("readOnlyHint", "destructiveHint")},
            {"readOnlyHint": False, "destructiveHint": False},
        )
        for name in ("books_update", "books_delete", "books_unlink"):
            self.assertTrue(tools[name]["annotations"]["destructiveHint"], name)
        # A custom tool's declared hints win; a missing title is derived.
        self.assertTrue(tools["shelves_summary"]["annotations"]["readOnlyHint"])
        self.assertEqual(tools["shelves_summary_set"]["title"], "Shelves summary set")
        self.assertFalse(tools["shelves_summary_set"]["annotations"]["readOnlyHint"])
        self.assertFalse(tools["books_list"]["annotations"]["openWorldHint"])
        self.assertFalse(tools["shelves_summary_set"]["annotations"]["openWorldHint"])
