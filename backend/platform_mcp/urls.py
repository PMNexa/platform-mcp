"""Mount under the host's API prefix (and `wellknown_urls` at the root),
e.g.
`path("api/v1/", include("platform_mcp.urls"))`, giving:

- `POST   api/v1/mcp`                      the MCP server (Streamable HTTP, stateless)
- `GET    api/v1/mcp/tokens`               the caller's PATs
- `POST   api/v1/mcp/tokens`               create one (`{name, expires_in_days?}`); returns `token` once
- `DELETE api/v1/mcp/tokens/<id>`          revoke one
- `GET|POST api/v1/mcp/oauth/authorize`   consent page backend (session)
- `GET    api/v1/mcp/oauth/grants`         the caller's connected apps (session)
- `DELETE api/v1/mcp/oauth/grants/<id>`    disconnect one (session)
- `POST   api/v1/mcp/oauth/register`       Dynamic Client Registration (public)
- `POST   api/v1/mcp/oauth/token`          token endpoint (public)
- `POST   api/v1/mcp/oauth/revoke`         token revocation (public)
- `GET    api/v1/mcp/skills`               agent-skills index = the install prompt (public, markdown)
- `GET    api/v1/mcp/skills/<name>/<file>` a skill's files (public, markdown)
"""

from django.urls import path

from platform_mcp.oauth import RegisterView, RevokeView, TokenView
from platform_mcp.views import (
    AuthorizeView,
    GrantDetailView,
    GrantListView,
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
    path("mcp/oauth/authorize", AuthorizeView.as_view(), name="oauth-authorize"),
    path("mcp/oauth/grants", GrantListView.as_view(), name="oauth-grants"),
    path("mcp/oauth/grants/<uuid:pk>", GrantDetailView.as_view(), name="oauth-grant"),
    path("mcp/oauth/register", RegisterView.as_view(), name="oauth-register"),
    path("mcp/oauth/token", TokenView.as_view(), name="oauth-token"),
    path("mcp/oauth/revoke", RevokeView.as_view(), name="oauth-revoke"),
    path("mcp/skills", SkillsIndexView.as_view(), name="skills"),
    path("mcp/skills/<slug:name>/<path:file>", SkillFileView.as_view(), name="skill-file"),
]
