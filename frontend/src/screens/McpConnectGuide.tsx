import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, CodeBlock, CopyButton, FormControl } from "platform-core";
import { API_BASE_URL, MCP_PATH, createToken, fetchServerInfo, type ServerInfo } from "../lib/api";
import {
  GUIDE_CHAT_IMAGE,
  MCP_CLIENTS,
  MCP_CLIENT_GROUPS,
  fillGuideText,
  guideImageUrl,
  type McpClient,
} from "../lib/clients";
import { useConnectionWatch } from "../lib/useConnectionWatch";

export interface McpConnectGuideProps {
  /** The logged-in session's access token - to create a personal access token and to watch for the connection. */
  accessToken: string;
  /** Name for a token created here (the client's label is appended). @default "Setup" */
  tokenName?: string;
  /** A token the page already created - filled into the snippets instead of offering a new one. */
  token?: string;
  /** What to suggest asking once connected. @default one generic prompt naming the server */
  firstPrompts?: string[];
  /** After it creates a token or sees a client connect - e.g. to refresh the page's token and app lists. */
  onChange?: () => void;
}

const TOKEN_PLACEHOLDER = "<your-token>";

const subscribeNever = () => () => {};
const absoluteMcpUrl = () => new URL(`${API_BASE_URL}${MCP_PATH}`, window.location.origin).toString();

/** Renders `code` spans in a guide step. */
function renderInline(text: string): ReactNode {
  return text.split("`").map((part, index) => (index % 2 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>));
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * The connect wizard: pick your AI app (grouped, from `MCP_CLIENTS`),
 * follow its steps - the server URL and snippet filled in, "Create a
 * token" for a client that needs one - and watch it connect: the
 * server's own record of a new sign-in or a token in use turns
 * "Waiting for <app>" into "Connected", then suggests a first prompt.
 * Used by the "MCP access" page and by a host's onboarding (goalnexa's
 * wizard).
 */
function McpConnectGuide({ accessToken, tokenName = "Setup", token: pageToken, firstPrompts, onChange }: McpConnectGuideProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mcpUrl = useSyncExternalStore(subscribeNever, absoluteMcpUrl, () => `${API_BASE_URL}${MCP_PATH}`);
  // Counts picks, so picking the same app again watches afresh.
  const [picks, setPicks] = useState(0);
  const { state: watch, restart } = useConnectionWatch(accessToken, clientId && `${clientId}:${picks}`);

  useEffect(() => {
    fetchServerInfo(accessToken)
      .then(setServer)
      .catch(() => setServer(null));
  }, [accessToken]);

  // Called on the change to connected only - not again when the host passes a new callback.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const connected = watch.status === "connected";
  useEffect(() => {
    if (connected) onChangeRef.current?.();
  }, [connected]);

  const client = MCP_CLIENTS.find((candidate) => candidate.id === clientId);
  const serverName = server?.name ?? "mcp";

  if (!client) {
    return (
      <div>
        <p className="text-secondary">Which app do you use?</p>
        {MCP_CLIENT_GROUPS.map((group) => {
          const clients = MCP_CLIENTS.filter((candidate) => candidate.group === group.id);
          if (clients.length === 0) return null;
          return (
            <div key={group.id} className="mb-3">
              <div className="subheader mb-2">{group.label}</div>
              <div className="row g-2">
                {clients.map((candidate) => (
                  <div key={candidate.id} className="col-12 col-sm-6 col-lg-4">
                    <ClientCard
                      client={candidate}
                      onPick={() => {
                        setClientId(candidate.id);
                        setPicks((value) => value + 1);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const token = tokens[client.id] ?? pageToken;
  const connection = { name: serverName, url: mcpUrl, token: token ?? TOKEN_PLACEHOLDER };
  const prompts = firstPrompts ?? [`What can you do with ${serverName}?`];

  async function handleCreateToken(forClient: McpClient) {
    setCreating(true);
    setError(null);
    try {
      const created = await createToken(accessToken, { name: `${tokenName} - ${forClient.label}`, expires_in_days: 365 });
      setTokens((prev) => ({ ...prev, [forClient.id]: created.token }));
      onChange?.();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
        <Button variant="link" className="px-0" onClick={() => setClientId(null)}>
          ← All apps
        </Button>
        <h3 className="card-title mb-0 ms-2">{client.label}</h3>
        <span className={`badge ${client.signIn === "oauth" ? "bg-green-lt" : "bg-azure-lt"}`}>
          {client.signIn === "oauth" ? "Sign in, no token" : "Personal access token"}
        </span>
      </div>

      {client.requirements && (
        <div className="alert alert-info" role="note">
          <div className="flex-fill">
            <div className="fw-bold mb-1">Before you start</div>
            <ul className="mb-0 ps-3">
              {client.requirements.map((requirement) => (
                <li key={requirement}>{renderInline(fillGuideText(requirement, connection))}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ol className="ps-3">
        {client.steps.map((step) => (
          <li key={step.text} className="mb-3">
            {renderInline(fillGuideText(step.text, connection))}
            {step.show === "url" && (
              <div className="d-flex gap-2 mt-2">
                <FormControl readOnly value={mcpUrl} aria-label="Server URL" onFocus={(event) => event.target.select()} />
                <CopyButton text={mcpUrl} />
              </div>
            )}
            {step.show === "snippet" && client.snippet && (
              <div className="mt-2">
                {client.signIn === "token" && !token && (
                  <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                    <Button variant="primary" outline disabled={creating} onClick={() => void handleCreateToken(client)}>
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
                <CodeBlock code={client.snippet(connection)} />
              </div>
            )}
            {step.image && <GuideImage image={step.image} alt={`Screenshot: ${fillGuideText(step.text, connection)}`} />}
          </li>
        ))}
      </ol>

      {client.notes?.map((note) => (
        <p key={note} className="text-secondary small">
          {renderInline(fillGuideText(note, connection))}
        </p>
      ))}

      {watch.status === "connected" ? (
        <div className="alert alert-success" role="status">
          <div className="flex-fill">
            <div className="fw-bold">Connected{watch.via ? ` - ${watch.via}` : ""}</div>
            <div className="mb-2">{client.label} reached the server. Try asking it:</div>
            <ul className="list-unstyled mb-0">
              {prompts.map((prompt) => (
                <li key={prompt} className="d-flex align-items-center gap-2 mb-1">
                  <span className="flex-fill">“{prompt}”</span>
                  <CopyButton text={prompt} />
                </li>
              ))}
            </ul>
            <GuideImage image={GUIDE_CHAT_IMAGE} alt={`Example: asking “What can you do with ${serverName}?” in a chat`} />
          </div>
        </div>
      ) : watch.status === "timeout" ? (
        <div className="alert alert-warning" role="status">
          <div className="flex-fill">
            <div className="fw-bold mb-1">Nothing from {client.label} yet</div>
            <div className="mb-2">{renderInline(client.verify)}</div>
            <Troubleshooting client={client} />
            <Button variant="secondary" outline onClick={restart}>
              Keep waiting
            </Button>
          </div>
        </div>
      ) : (
        <div className="d-flex align-items-start gap-2 border rounded p-3" role="status">
          <span className="spinner-border spinner-border-sm text-primary mt-1" aria-hidden="true" />
          <div>
            <div className="fw-bold">Waiting for {client.label} to connect…</div>
            <div className="text-secondary small">
              This updates by itself as soon as {client.label}{" "}
              {client.signIn === "oauth" ? "signs in" : "uses the token"}. In {client.label}:{" "}
              {renderInline(client.verify)}
            </div>
          </div>
        </div>
      )}

      {watch.status !== "timeout" && client.troubleshooting && (
        <details className="mt-3">
          <summary className="text-secondary">Not working?</summary>
          <div className="mt-2">
            <Troubleshooting client={client} />
          </div>
        </details>
      )}

      <div className="text-secondary small mt-3">
        {client.checkedOn
          ? `Steps last checked ${formatDay(client.checkedOn)}.`
          : "These steps haven't been tested end to end yet - menus may differ."}
      </div>
    </div>
  );
}

function ClientCard({ client, onPick }: { client: McpClient; onPick: () => void }) {
  const signIn = client.signIn === "oauth" ? "Sign in, no token" : "Token";
  return (
    <button type="button" className="card card-sm card-link w-100 h-100 text-start" onClick={onPick}>
      <div className="card-body">
        <div className="fw-bold">{client.label}</div>
        <div className="text-secondary small">{client.summary}</div>
        <div className="text-secondary small mt-1">{[signIn, ...client.platforms].join(" · ")}</div>
      </div>
    </button>
  );
}

function Troubleshooting({ client }: { client: McpClient }) {
  if (!client.troubleshooting) return null;
  return (
    <ul className="ps-3 mb-2">
      {client.troubleshooting.map((item) => (
        <li key={item}>{renderInline(item)}</li>
      ))}
    </ul>
  );
}

/** A guide screenshot, opening full size on click. */
function GuideImage({ image, alt }: { image: string; alt: string }) {
  const url = guideImageUrl(image, API_BASE_URL);
  return (
    <a href={url} target="_blank" rel="noreferrer" className="d-block mt-2" title="Open full size">
      <img
        src={url}
        alt={alt}
        className="border rounded shadow-sm"
        style={{ maxWidth: "min(100%, 520px)" }}
        loading="lazy"
      />
    </a>
  );
}

export default McpConnectGuide;
