"""Mount under the host's API prefix, e.g.
`path("api/v1/", include("platform_mcp.urls"))`, giving:

- `POST   api/v1/mcp`                      the MCP server (Streamable HTTP, stateless)
- `GET    api/v1/mcp/tokens`               the caller's PATs
- `POST   api/v1/mcp/tokens`               create one (`{name, expires_in_days?}`); returns `token` once
- `DELETE api/v1/mcp/tokens/<id>`          revoke one
- `GET    api/v1/mcp/skills`               agent-skills index = the install prompt (public, markdown)
- `GET    api/v1/mcp/skills/<name>/<file>` a skill's files (public, markdown)
"""

from django.urls import path

from platform_mcp.views import (
    McpView,
    SkillFileView,
    SkillsIndexView,
    TokenDetailView,
    TokenListView,
)

app_name = "platform_mcp"

urlpatterns = [
    path("mcp", McpView.as_view(), name="server"),
    path("mcp/tokens", TokenListView.as_view(), name="tokens"),
    path("mcp/tokens/<uuid:pk>", TokenDetailView.as_view(), name="token"),
    path("mcp/skills", SkillsIndexView.as_view(), name="skills"),
    path("mcp/skills/<slug:name>/<path:file>", SkillFileView.as_view(), name="skill-file"),
]
