import { useEffect, useState } from "react";
import { Button, Card, CardBody, useT } from "platform-core";
import { AuthorizationError, checkAuthorization, decideAuthorization, type AuthorizationRequest } from "../lib/api";
import messages from "./McpAuthorizeScreen.messages";

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
  const t = useT(messages);

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
          {state.status === "loading" && <p className="text-secondary mb-0">{t("checking")}</p>}
          {state.status === "sending" && <p className="text-secondary mb-0">{t("returning")}</p>}
          {state.status === "error" && (
            <>
              <h2 className="card-title">{t("cantConnect")}</h2>
              <div className="alert alert-danger" role="alert">
                {state.message}
              </div>
              {state.redirectTo && (
                <Button variant="secondary" outline onClick={() => window.location.assign(state.redirectTo!)}>
                  {t("returnToApp")}
                </Button>
              )}
            </>
          )}
          {state.status === "ready" && (
            <>
              <h2 className="card-title mb-3">
                {t("title", { client: state.request.client_name, server: state.request.server_name })}
              </h2>
              <p>{t.rich("canDo", { client: state.request.client_name, server: state.request.server_name })}</p>
              <p className="text-secondary">{t.rich("afterAllow", { host: hostOf(state.request.redirect_uri) })}</p>
              <div className="d-flex gap-2 justify-content-end">
                <Button variant="secondary" outline onClick={() => void decide(false)}>
                  {t("cancel")}
                </Button>
                <Button variant="primary" onClick={() => void decide(true)}>
                  {t("allow")}
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
