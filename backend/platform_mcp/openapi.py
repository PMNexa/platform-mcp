"""How platform_mcp's authentication appears in an OpenAPI document
(drf-spectacular, via platform-core). Its tokens work at the MCP endpoint
only. Registered by being imported - `PlatformMcpConfig.ready`."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class _BearerScheme(OpenApiAuthenticationExtension):
    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "description": self.description}


class PersonalAccessTokenScheme(_BearerScheme):
    target_class = "platform_mcp.authentication.PersonalAccessTokenAuthentication"
    name = "mcpPersonalAccessToken"
    description = "A personal access token (`gnx_...`) from the MCP access page."


class OAuthAccessTokenScheme(_BearerScheme):
    target_class = "platform_mcp.authentication.OAuthAccessTokenAuthentication"
    name = "mcpOAuth"
    description = "An OAuth access token (discovery: `/.well-known/oauth-authorization-server`)."
