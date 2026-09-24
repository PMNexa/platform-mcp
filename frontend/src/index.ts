/**
 * Package entry point - what a consuming app (apps/main) imports.
 *
 * `createMcpRoutes(basePath)` is what a host mounts (inside its
 * session-gated layout): one "MCP access" page - the caller's personal
 * access tokens (create / revoke) and how to connect an AI client
 * (Claude Code, Claude Desktop, Codex, Cursor, ...) to the MCP server.
 */
export { default as McpAccessScreen } from "./screens/McpAccessScreen";
export type { McpAccessScreenProps } from "./screens/McpAccessScreen";
export { createMcpRoutes } from "./mcpRoutes";
// Its sidebar entry - same `basePath` as `createMcpRoutes`.
export { createMcpNavItems } from "./mcpNav";
export { MCP_CLIENTS } from "./lib/clients";
export type { McpClient, McpConnection } from "./lib/clients";
