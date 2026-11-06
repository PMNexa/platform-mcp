import { useCallback, useEffect, useState, useSyncExternalStore, type SubmitEvent } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CopyButton,
  FormControl,
  FormLabel,
  Modal,
  formatDateTime,
  formatNumber,
  useLocale,
  useT,
  type Locale,
} from "platform-core";
import {
  API_BASE_URL,
  MCP_PATH,
  createToken,
  disconnectApp,
  fetchServerInfo,
  listConnectedApps,
  listTokens,
  revokeToken,
  type AccessToken,
  type ConnectedApp,
  type CreatedAccessToken,
  type ServerInfo,
} from "../lib/api";
import McpConnectGuide from "./McpConnectGuide";
import messages from "./McpAccessScreen.messages";

export interface McpAccessScreenProps {
  /** The logged-in session's access token - token management is session-only. */
  accessToken: string;
}

const EXPIRY_OPTIONS = [
  { label: "days30", days: 30 },
  { label: "days90", days: 90 },
  { label: "year1", days: 365 },
  { label: "never", days: null },
] as const;

function formatDate(value: string | null, locale: Locale, empty = "—"): string {
  return value ? formatDateTime(value, { dateStyle: "medium", timeStyle: "short" }, locale) : empty;
}

// The snippets need an absolute URL, which only the browser knows - the
// server render gets the relative path.
const subscribeNever = () => () => {};
const absoluteMcpUrl = () => new URL(`${API_BASE_URL}${MCP_PATH}`, window.location.origin).toString();

/**
 * The "MCP access" page: the caller's personal access tokens (create,
 * revoke - a token is shown once, right after it's created), the apps
 * connected through OAuth (e.g. a Claude connector; disconnect) and a
 * connect wizard (`McpConnectGuide`: pick the client, follow its steps -
 * filled in with this server's URL and name, asked from the server
 * itself, and the just-created token - and see it connect).
 */
function McpAccessScreen({ accessToken }: McpAccessScreenProps) {
  const [tokens, setTokens] = useState<AccessToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const mcpUrl = useSyncExternalStore(subscribeNever, absoluteMcpUrl, () => `${API_BASE_URL}${MCP_PATH}`);
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const t = useT(messages);
  const locale = useLocale();

  const refresh = useCallback(() => {
    listTokens(accessToken)
      .then(setTokens)
      .catch((thrown: unknown) => setError(thrown instanceof Error ? thrown.message : String(thrown)));
  }, [accessToken]);

  useEffect(refresh, [refresh]);

  const refreshApps = useCallback(() => {
    listConnectedApps(accessToken)
      .then(setApps)
      .catch((thrown: unknown) => setError(thrown instanceof Error ? thrown.message : String(thrown)));
  }, [accessToken]);

  useEffect(refreshApps, [refreshApps]);

  async function handleDisconnect(app: ConnectedApp) {
    if (!window.confirm(t("confirmDisconnect", { name: app.client_name }))) return;
    try {
      await disconnectApp(accessToken, app.id);
      refreshApps();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  useEffect(() => {
    fetchServerInfo(accessToken)
      .then(setServer)
      .catch(() => setServer(null));
  }, [accessToken]);

  async function handleRevoke(token: AccessToken) {
    if (!window.confirm(t("confirmRevoke", { name: token.name }))) return;
    try {
      await revokeToken(accessToken, token.id);
      if (created?.id === token.id) setCreated(null);
      refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  const skillsUrl = `${mcpUrl}/skills`;
  const skillsPrompt = `Install the ${server?.name ?? "MCP"} skills from ${skillsUrl}`;

  return (
    <div className="container-xl py-3">
      <div className="mb-3">
        <h2 className="page-title">{t("title")}</h2>
        <div className="text-secondary">{t("intro")}</div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>{t("tokensTitle")}</CardTitle>
          <div className="card-actions">
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t("newToken")}
            </Button>
          </div>
        </CardHeader>
        {created && (
          <CardBody className="border-bottom">
            <div className="alert alert-success mb-0" role="status">
              <div className="flex-fill">
                <h4 className="alert-title">{t("tokenCreated", { name: created.name })}</h4>
                <div className="text-secondary mb-2">{t("copyNow")}</div>
                <div className="d-flex gap-2 align-items-center">
                  <code className="flex-fill text-break p-2" style={{ userSelect: "all" }}>
                    {created.token}
                  </code>
                  <CopyButton text={created.token} />
                </div>
              </div>
            </div>
          </CardBody>
        )}
        {tokens === null ? (
          <CardBody className="text-secondary">{t("loading")}</CardBody>
        ) : tokens.length === 0 ? (
          <CardBody className="text-secondary">{t("noTokens")}</CardBody>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>{t("colName")}</th>
                  <th>{t("colToken")}</th>
                  <th>{t("colCreated")}</th>
                  <th>{t("colLastUsed")}</th>
                  <th>{t("colExpires")}</th>
                  <th className="w-1" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => {
                  const expired = token.expires_at !== null && new Date(token.expires_at) <= new Date();
                  return (
                    <tr key={token.id}>
                      <td>{token.name}</td>
                      <td>
                        <code>{token.prefix}…</code>
                      </td>
                      <td className="text-secondary">{formatDate(token.created_at, locale)}</td>
                      <td className="text-secondary">{formatDate(token.last_used_at, locale, t("never"))}</td>
                      <td className={expired ? "text-danger" : "text-secondary"}>
                        {expired ? t("expired") : formatDate(token.expires_at, locale, t("never"))}
                      </td>
                      <td>
                        <Button variant="danger" outline onClick={() => void handleRevoke(token)}>
                          {t("revoke")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>{t("appsTitle")}</CardTitle>
        </CardHeader>
        {apps === null ? (
          <CardBody className="text-secondary">{t("loading")}</CardBody>
        ) : apps.length === 0 ? (
          <CardBody className="text-secondary">{t("noApps")}</CardBody>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>{t("colApp")}</th>
                  <th>{t("colConnected")}</th>
                  <th>{t("colLastUsed")}</th>
                  <th className="w-1" />
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>{app.client_name}</td>
                    <td className="text-secondary">{formatDate(app.created_at, locale)}</td>
                    <td className="text-secondary">{formatDate(app.last_used_at, locale, t("never"))}</td>
                    <td>
                      <Button variant="danger" outline onClick={() => void handleDisconnect(app)}>
                        {t("disconnect")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("connectTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="border-bottom">
          <FormLabel htmlFor="mcp-server-url">{t("serverUrl")}</FormLabel>
          <div className="d-flex gap-2">
            <FormControl id="mcp-server-url" readOnly value={mcpUrl} onFocus={(event) => event.target.select()} />
            <CopyButton text={mcpUrl} />
          </div>
          <small className="form-hint">
            {t.rich("transportHint", { header: "Authorization: Bearer <token>" })}
            {server && t.rich("serverFacts", { name: server.name, tools: formatNumber(server.toolCount, undefined, locale) })}
          </small>
        </CardBody>
        <CardBody>
          <McpConnectGuide
            accessToken={accessToken}
            token={created?.token}
            onChange={() => {
              refresh();
              refreshApps();
            }}
          />
        </CardBody>
      </Card>

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{t("skillsTitle")}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-secondary">{t("skillsIntro", { app: server?.name ?? t("thisApp") })}</p>
          <div className="d-flex gap-2">
            <FormControl id="mcp-skills-prompt" readOnly value={skillsPrompt} onFocus={(event) => event.target.select()} />
            <CopyButton text={skillsPrompt} />
          </div>
          <small className="form-hint">{t.rich("skillsHint", { url: skillsUrl })}</small>
        </CardBody>
      </Card>

      <NewTokenModal
        open={creating}
        accessToken={accessToken}
        onClose={() => setCreating(false)}
        onCreated={(token) => {
          setCreating(false);
          setCreated(token);
          refresh();
        }}
      />
    </div>
  );
}

function NewTokenModal({
  open,
  accessToken,
  onClose,
  onCreated,
}: {
  open: boolean;
  accessToken: string;
  onClose: () => void;
  onCreated: (token: CreatedAccessToken) => void;
}) {
  const t = useT(messages);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t("newTokenTitle")}
      footer={
        <>
          <Button variant="secondary" outline onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" form="mcp-new-token-form">
            {t("createToken")}
          </Button>
        </>
      }
    >
      {/* Remounted on each open so the fields start empty. */}
      {open && <NewTokenForm accessToken={accessToken} onCreated={onCreated} />}
    </Modal>
  );
}

function NewTokenForm({ accessToken, onCreated }: { accessToken: string; onCreated: (token: CreatedAccessToken) => void }) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT(messages);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createToken(accessToken, { name, expires_in_days: expiry ? Number(expiry) : null }));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
      setSubmitting(false);
    }
  }

  return (
    <form id="mcp-new-token-form" onSubmit={handleSubmit}>
      <div className="mb-3">
        <FormLabel htmlFor="mcp-token-name" required>
          {t("colName")}
        </FormLabel>
        <FormControl
          id="mcp-token-name"
          required
          autoFocus
          maxLength={100}
          placeholder={t("tokenNamePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <FormLabel htmlFor="mcp-token-expiry">{t("expiresAfter")}</FormLabel>
        <select
          id="mcp-token-expiry"
          className="form-select"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.label} value={option.days ?? ""}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-danger mt-3 mb-0" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default McpAccessScreen;
