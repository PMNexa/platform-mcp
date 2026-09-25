import { useLocation, useOutletContext } from "react-router";
import McpAuthorizeScreen from "../screens/McpAuthorizeScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "Connect an app" }];
}

/**
 * Registered by `createMcpRoutes()` at `<basePath>/authorize` - the OAuth
 * authorization endpoint the server advertises (`MCP_OAUTH_AUTHORIZE_PAGE`).
 * Inside the host's session-gated layout, so a signed-out user logs in
 * first and comes back here with the query intact (`?next=`).
 */
export default function McpAuthorizeRoute() {
  const accessToken = useOutletContext<string>();
  const { search } = useLocation();
  return <McpAuthorizeScreen accessToken={accessToken} search={search} />;
}
