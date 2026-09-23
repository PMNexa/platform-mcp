import { Fragment, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode, type SubmitEvent } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, FormControl, FormLabel, Modal } from "platform-core";
import {
  API_BASE_URL,
  MCP_PATH,
  createToken,
  fetchServerInfo,
  listTokens,
  revokeToken,
  type AccessToken,
  type CreatedAccessToken,
  type ServerInfo,
} from "../lib/api";
import { MCP_CLIENTS } from "../lib/clients";

export interface McpAccessScreenProps {
  /** The logged-in session's access token - token management is session-only. */
  accessToken: string;
}

const TOKEN_PLACEHOLDER = "<your-token>";

const CLIENT_STYLE = { background: "transparent", boxShadow: "none" };
const SELECTED_CLIENT_STYLE = {
  background: "var(--tblr-primary-lt, rgba(32, 107, 196, 0.08))",
  color: "var(--tblr-primary, #206bc4)",
  boxShadow: "none",
};

const EXPIRY_OPTIONS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

function formatDate(value: string | null, empty = "—"): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : empty;
}

// The snippets need an absolute URL, which only the browser knows - the
// server render gets the relative path.
const subscribeNever = () => () => {};
const absoluteMcpUrl = () => new URL(`${API_BASE_URL}${MCP_PATH}`, window.location.origin).toString();

/** Renders `code` spans in a guide step. */
function renderInline(text: string): ReactNode {
  return text.split("`").map((part, index) => (index % 2 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>));
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      outline
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * The "MCP access" page: the caller's personal access tokens (create,
 * revoke - a token is shown once, right after it's created) and a
 * per-client guide for connecting an AI client to the MCP server, its
 * snippets filled in with this server's URL and name (asked from the
 * server itself) and the just-created token.
 */
function McpAccessScreen({ accessToken }: McpAccessScreenProps) {
  const [tokens, setTokens] = useState<AccessToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const mcpUrl = useSyncExternalStore(subscribeNever, absoluteMcpUrl, () => `${API_BASE_URL}${MCP_PATH}`);
  const [clientId, setClientId] = useState(MCP_CLIENTS[0].id);

  const refresh = useCallback(() => {
    listTokens(accessToken)
      .then(setTokens)
      .catch((thrown: unknown) => setError(thrown instanceof Error ? thrown.message : String(thrown)));
  }, [accessToken]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    fetchServerInfo(accessToken)
      .then(setServer)
      .catch(() => setServer(null));
  }, [accessToken]);

  async function handleRevoke(token: AccessToken) {
    if (!window.confirm(`Revoke "${token.name}"? Any client using it stops working immediately.`)) return;
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
  const client = MCP_CLIENTS.find((candidate) => candidate.id === clientId) ?? MCP_CLIENTS[0];
  const snippet = client.snippet({ name: server?.name ?? "mcp", url: mcpUrl, token: created?.token ?? TOKEN_PLACEHOLDER });

  return (
    <div className="container-xl py-3">
      <div className="mb-3">
        <h2 className="page-title">MCP access</h2>
        <div className="text-secondary">
          Let an AI assistant (Claude, Codex, Cursor, …) read and update your data through the MCP server. It can do
          exactly what you can, nothing more.
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Personal access tokens</CardTitle>
          <div className="card-actions">
            <Button variant="primary" onClick={() => setCreating(true)}>
              New token
            </Button>
          </div>
        </CardHeader>
        {created && (
          <CardBody className="border-bottom">
            <div className="alert alert-success mb-0" role="status">
              <div className="flex-fill">
                <h4 className="alert-title">Token “{created.name}” created</h4>
                <div className="text-secondary mb-2">
                  Copy it now: it won't be shown again. The setup steps below already include it.
                </div>
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
          <CardBody className="text-secondary">Loading…</CardBody>
        ) : tokens.length === 0 ? (
          <CardBody className="text-secondary">No tokens yet. Create one for each client you connect.</CardBody>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Expires</th>
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
                      <td className="text-secondary">{formatDate(token.created_at)}</td>
                      <td className="text-secondary">{formatDate(token.last_used_at, "Never")}</td>
                      <td className={expired ? "text-danger" : "text-secondary"}>
                        {expired ? "Expired" : formatDate(token.expires_at, "Never")}
                      </td>
                      <td>
                        <Button variant="danger" outline onClick={() => void handleRevoke(token)}>
                          Revoke
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

      <Card>
        <CardHeader>
          <CardTitle>Connect an AI client</CardTitle>
        </CardHeader>
        <CardBody className="border-bottom">
          <FormLabel htmlFor="mcp-server-url">Server URL</FormLabel>
          <div className="d-flex gap-2">
            <FormControl id="mcp-server-url" readOnly value={mcpUrl} onFocus={(event) => event.target.select()} />
            <CopyButton text={mcpUrl} />
          </div>
          <small className="form-hint">
            Streamable HTTP transport, authenticated with <code>Authorization: Bearer &lt;token&gt;</code>
            {server && (
              <>
                {" "}
                · server name <code>{server.name}</code> · {server.toolCount} tools
              </>
            )}
          </small>
        </CardBody>
        <div className="row g-0">
          <div className="col-12 col-md-auto border-end" style={{ minWidth: 200 }}>
            <CardBody>
              <div className="subheader mb-2">Client</div>
              <div className="d-flex flex-column gap-1" role="tablist" aria-orientation="vertical">
                {MCP_CLIENTS.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="tab"
                    aria-selected={candidate.id === client.id}
                    className={`btn btn-sm w-100 justify-content-start border-0 ${candidate.id === client.id ? "fw-bold" : "text-secondary"}`}
                    style={candidate.id === client.id ? SELECTED_CLIENT_STYLE : CLIENT_STYLE}
                    onClick={() => setClientId(candidate.id)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </CardBody>
          </div>
          <div className="col" role="tabpanel" style={{ minWidth: 0 }}>
            <CardBody>
              <h3 className="card-title mb-3">{client.label}</h3>
              {!created && (
                <p className="text-secondary">
                  Replace <code>{TOKEN_PLACEHOLDER}</code> with a token, or create one above and it's filled in here.
                </p>
              )}
              <ol className="ps-3">
                {client.steps.map((step) => (
                  <li key={step} className="mb-1">
                    {renderInline(step)}
                  </li>
                ))}
              </ol>
              <div className="position-relative">
                <pre className="mb-2" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {snippet}
                </pre>
                <div className="position-absolute top-0 end-0 m-2">
                  <CopyButton text={snippet} />
                </div>
              </div>
              <div className="text-secondary">{renderInline(client.verify)}</div>
            </CardBody>
          </div>
        </div>
      </Card>

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>Agent skills</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-secondary">
            Skills are ready-made playbooks that teach your assistant the everyday jobs in{" "}
            {server?.name ?? "this app"}, on top of the raw tools. To install them, paste this into Claude Code, Codex or
            any agent that supports skills. It also walks through connecting the server if that isn't done yet.
          </p>
          <div className="d-flex gap-2">
            <FormControl id="mcp-skills-prompt" readOnly value={skillsPrompt} onFocus={(event) => event.target.select()} />
            <CopyButton text={skillsPrompt} />
          </div>
          <small className="form-hint">
            <a href={skillsUrl} target="_blank" rel="noreferrer">
              See what gets installed
            </a>
            . Run the same prompt again to update them.
          </small>
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="New personal access token"
      footer={
        <>
          <Button variant="secondary" outline onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" form="mcp-new-token-form">
            Create token
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
          Name
        </FormLabel>
        <FormControl
          id="mcp-token-name"
          required
          autoFocus
          maxLength={100}
          placeholder="e.g. Claude Code on my laptop"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <FormLabel htmlFor="mcp-token-expiry">Expires after</FormLabel>
        <select
          id="mcp-token-expiry"
          className="form-select"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.label} value={option.days ?? ""}>
              {option.label}
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
