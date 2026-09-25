import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "platform-core";
import { AuthorizationError, checkAuthorization, decideAuthorization, type AuthorizationRequest } from "../lib/api";

export interface McpAuthorizeScreenProps {
  /** The logged-in session's access token - only a signed-in user can approve. */
  accessToken: string;
  /** The page's query string: the OAuth authorization request the app sent. */
  search: string;
}

type State =
  | { status: "loading" }
  | { status: "ready"; request: AuthorizationRequest }
  | { status: "sending" }
  | { status: "error"; message: string; redirectTo: string | null };

function hostOf(uri: string): string {
  try {
    return new URL(uri).host || uri;
  } catch {
    return uri;
  }
}

function errorState(thrown: unknown): State {
  return thrown instanceof AuthorizationError
    ? { status: "error", message: thrown.message, redirectTo: thrown.redirectTo }
    : { status: "error", message: thrown instanceof Error ? thrown.message : String(thrown), redirectTo: null };
}

/**
 * The OAuth consent page: an app (e.g. a Claude connector) asks to use
 * the MCP server as the signed-in user. "Allow" gets a code from the
 * server and sends the browser back to the app with it; "Cancel" sends
 * it back with `access_denied`. Leaving goes through `window.location`
 * - the destination is another site, not a route.
 */
function McpAuthorizeScreen({ accessToken, search }: McpAuthorizeScreenProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    checkAuthorization(accessToken, search)
      .then((request) => !cancelled && setState({ status: "ready", request }))
      .catch((thrown: unknown) => !cancelled && setState(errorState(thrown)));
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  async function decide(approve: boolean) {
    setState({ status: "sending" });
    try {
      window.location.assign(await decideAuthorization(accessToken, search, approve));
    } catch (thrown) {
      setState(errorState(thrown));
    }
  }

  return (
    <div className="container-tight py-4">
      <Card>
        <CardBody>
          {state.status === "loading" && <p className="text-secondary mb-0">Checking the request…</p>}
          {state.status === "sending" && <p className="text-secondary mb-0">Returning you to the app…</p>}
          {state.status === "error" && (
            <>
              <h2 className="card-title">Can't connect this app</h2>
              <div className="alert alert-danger" role="alert">
                {state.message}
              </div>
              {state.redirectTo && (
                <Button variant="secondary" outline onClick={() => window.location.assign(state.redirectTo!)}>
                  Return to the app
                </Button>
              )}
            </>
          )}
          {state.status === "ready" && (
            <>
              <h2 className="card-title mb-3">
                Connect {state.request.client_name} to {state.request.server_name}?
              </h2>
              <p>
                <strong>{state.request.client_name}</strong> will be able to read and change your data through the MCP
                server: everything you can do in {state.request.server_name}, nothing more.
              </p>
              <p className="text-secondary">
                After you allow it, you'll go back to <strong>{hostOf(state.request.redirect_uri)}</strong>. Only allow
                apps you started connecting yourself. You can disconnect it any time on the MCP access page.
              </p>
              <div className="d-flex gap-2 justify-content-end">
                <Button variant="secondary" outline onClick={() => void decide(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void decide(true)}>
                  Allow
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default McpAuthorizeScreen;
