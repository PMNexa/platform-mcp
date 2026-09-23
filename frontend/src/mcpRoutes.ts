import { routeFilePath, type RouteEntry } from "platform-core";

/**
 * The "MCP access" page, at a HOST-chosen path - `apps/main` puts it
 * inside its app-shell layout (`...createMcpRoutes("mcp")`) so it's
 * session-gated and gets the access token via outlet context.
 * Browser-safe on purpose (exported from `"."`, which is client-bundled):
 * plain route-config object, file path built only when called - see
 * platform-core's `lib/routes.ts` docstring.
 */
export function createMcpRoutes(basePath: string): RouteEntry[] {
  return [
    {
      id: "platform-mcp-access",
      path: basePath.replace(/^\/+|\/+$/g, ""),
      file: routeFilePath(import.meta.url, "routes/mcp.tsx"),
    },
  ];
}
