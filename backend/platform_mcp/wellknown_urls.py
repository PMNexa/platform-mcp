"""OAuth discovery documents (oauth.py) - they live at the host's ROOT,
where clients look for them, not under the API prefix. Mount with
`path("", include("platform_mcp.wellknown_urls"))`; the gateway must send
`/.well-known/oauth-*` to the backend.

Both answer at their bare path and with a suffix: RFC 9728 inserts the
resource's path (`.../oauth-protected-resource/api/v1/mcp`), and some
clients do the same for the authorization server's.
"""

from django.urls import re_path

from platform_mcp.oauth import authorization_server_metadata_view, protected_resource_metadata_view

urlpatterns = [
    re_path(r"^\.well-known/oauth-protected-resource(?P<rest>/.*)?$", protected_resource_metadata_view),
    re_path(r"^\.well-known/oauth-authorization-server(?P<rest>/.*)?$", authorization_server_metadata_view),
]
