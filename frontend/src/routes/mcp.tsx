import { useOutletContext } from "react-router";
import McpAccessScreen from "../screens/McpAccessScreen";
import { localeFromMatches, translator } from "platform-core";
import titles from "./titles.messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(titles, localeFromMatches(matches))("mcpAccess") }];
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
