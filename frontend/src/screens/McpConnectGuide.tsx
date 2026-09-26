import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "platform-core";
import { API_BASE_URL, MCP_PATH, createToken, fetchServerInfo, type ServerInfo } from "../lib/api";
import { MCP_CLIENTS } from "../lib/clients";

export interface McpConnectGuideProps {
  /** The logged-in session's access token - to create a personal access token when the client needs one. */
  accessToken: string;
  /** Name for a token created here (the client's label is appended). @default "Setup" */
  tokenName?: string;
}

const TOKEN_PLACEHOLDER = "<your-token>";

const subscribeNever = () => () => {};
const absoluteMcpUrl = () => new URL(`${API_BASE_URL}${MCP_PATH}`, window.location.origin).toString();

function renderInline(text: string): ReactNode {
  return text.split("`").map((part, index) => (index % 2 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>));
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button variant="secondary" outline onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * How to connect ONE AI client, picked from a list: its own steps and
 * snippet, filled in with this server's URL and name. A client that
 * authenticates with a token gets a "Create a token" button that makes a
 * personal access token and puts it in the snippet (shown once). For a
 * host's onboarding (goalnexa's wizard); the "MCP access" page has the
 * full version with token management.
 */
function McpConnectGuide({ accessToken, tokenName = "Setup" }: McpConnectGuideProps) {
  const [clientId, setClientId] = useState(MCP_CLIENTS[0].id);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mcpUrl = useSyncExternalStore(subscribeNever, absoluteMcpUrl, () => `${API_BASE_URL}${MCP_PATH}`);

  useEffect(() => {
    fetchServerInfo(accessToken)
      .then(setServer)
      .catch(() => setServer(null));
  }, [accessToken]);

  const client = MCP_CLIENTS.find((candidate) => candidate.id === clientId) ?? MCP_CLIENTS[0];
  const needsToken = client.usesToken !== false;
  const token = tokens[client.id];
  const snippet = client.snippet({ name: server?.name ?? "mcp", url: mcpUrl, token: token ?? TOKEN_PLACEHOLDER });

  async function handleCreateToken() {
    setCreating(true);
    setError(null);
    try {
      const created = await createToken(accessToken, { name: `${tokenName} - ${client.label}`, expires_in_days: 365 });
      setTokens((prev) => ({ ...prev, [client.id]: created.token }));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <label className="form-label" htmlFor="mcp-connect-client">
        Your AI assistant
      </label>
      <select
        id="mcp-connect-client"
        className="form-select form-select-sm mb-3"
        value={client.id}
        onChange={(event) => setClientId(event.target.value)}
      >
        {MCP_CLIENTS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>

      <ol className="ps-3">
        {client.steps.map((step) => (
          <li key={step} className="mb-1">
            {renderInline(step)}
          </li>
        ))}
      </ol>

      {needsToken && !token && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <Button variant="primary" outline disabled={creating} onClick={() => void handleCreateToken()}>
            {creating ? "Creating…" : "Create a token"}
          </Button>
          <span className="text-secondary small">
            Fills in <code>{TOKEN_PLACEHOLDER}</code> below. It's shown only once - copy the snippet now.
          </span>
        </div>
      )}
      {error && (
        <div className="text-danger small mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="position-relative">
        <pre className="mb-2" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {snippet}
        </pre>
        <div className="position-absolute top-0 end-0 m-2">
          <CopyButton text={snippet} />
        </div>
      </div>
      <div className="text-secondary small">{renderInline(client.verify)}</div>
    </div>
  );
}

export default McpConnectGuide;
