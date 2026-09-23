import { useOutletContext } from "react-router";
import McpAccessScreen from "../screens/McpAccessScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "MCP access" }];
}

/**
 * Registered by `createMcpRoutes()` (see `../mcpRoutes.ts`). Mounted
 * inside the host's app-shell layout, which gates on a session and hands
 * the access token down via `<Outlet context={accessToken}>`.
 */
export default function McpRoute() {
  const accessToken = useOutletContext<string>();
  return <McpAccessScreen accessToken={accessToken} />;
}
