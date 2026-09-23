from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(MCP_SERVER_NAME="demo")
class SkillsTests(TestCase):
    def setUp(self):
        self.client = APIClient()  # anonymous: skills are public

    def test_index_is_the_install_prompt(self):
        response = self.client.get("/mcp/skills")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/markdown"))
        body = response.content.decode()
        self.assertIn("# Install the demo agent skills", body)
        self.assertIn("**demo-skill**: A test skill for demo.", body)
        self.assertIn("`http://testserver/mcp/skills/demo-skill/SKILL.md`", body)
        self.assertIn("`http://testserver/mcp/skills/demo-skill/reference/notes.md`", body)
        self.assertIn("`http://testserver/mcp`", body)
        self.assertNotIn("{{", body)

    def test_skill_file_is_rendered(self):
        body = self.client.get("/mcp/skills/demo-skill/SKILL.md").content.decode()
        self.assertIn("description: A test skill for demo.", body)
        self.assertIn("Talk to http://testserver/mcp; tokens at http://testserver/mcp;", body)
        self.assertIn("{{nope}}", body)
        notes = self.client.get("/mcp/skills/demo-skill/reference/notes.md").content.decode()
        self.assertEqual(notes.strip(), "See http://testserver/mcp/skills.")

    @override_settings(MCP_PUBLIC_URL="https://goals.example.com/")
    def test_public_url_override(self):
        body = self.client.get("/mcp/skills/demo-skill/SKILL.md").content.decode()
        self.assertIn("Talk to https://goals.example.com/mcp;", body)

    def test_no_escape_from_the_skill_folder(self):
        for path in (
            "/mcp/skills/demo-skill/../../models.py",
            "/mcp/skills/demo-skill/%2e%2e/%2e%2e/models.py",
            "/mcp/skills/nope/SKILL.md",
            "/mcp/skills/demo-skill/missing.md",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)
