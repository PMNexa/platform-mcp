"""Mount under the host's API prefix, e.g.
`path("api/v1/", include("platform_mcp.urls"))`, giving:

- `POST   api/v1/mcp`               the MCP server (Streamable HTTP, stateless)
- `GET    api/v1/mcp/tokens`        the caller's PATs
- `POST   api/v1/mcp/tokens`        create one (`{name, expires_in_days?}`); returns `token` once
- `DELETE api/v1/mcp/tokens/<id>`   revoke one
"""

from django.urls import path

from platform_mcp.views import McpView, TokenDetailView, TokenListView

urlpatterns = [
    path("mcp", McpView.as_view()),
    path("mcp/tokens", TokenListView.as_view()),
    path("mcp/tokens/<uuid:pk>", TokenDetailView.as_view()),
]
