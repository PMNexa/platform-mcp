import { routeFilePath, type RouteEntry } from "platform-core";

/**
 * The "MCP access" page at a HOST-chosen path, and under it `/authorize`:
 * the OAuth consent page the server's metadata points apps to (backend
 * setting `MCP_OAUTH_AUTHORIZE_PAGE`, default `/mcp/authorize` - keep the
 * two in step). `apps/main` puts both inside its app-shell layout
 * (`...createMcpRoutes("mcp")`) so they're session-gated and get the
 * access token via outlet context.
 * Browser-safe on purpose (exported from `"."`, which is client-bundled):
 * plain route-config object, file path built only when called - see
 * platform-core's `lib/routes.ts` docstring.
 */
export function createMcpRoutes(basePath: string): RouteEntry[] {
  const path = basePath.replace(/^\/+|\/+$/g, "");
  return [
    {
      id: "platform-mcp-access",
      path,
      file: routeFilePath(import.meta.url, "routes/mcp.tsx"),
    },
    {
      id: "platform-mcp-authorize",
      path: `${path}/authorize`,
      file: routeFilePath(import.meta.url, "routes/mcp-authorize.tsx"),
    },
  ];
}
