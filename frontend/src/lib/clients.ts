/**
 * How to connect each AI client to the MCP server - the setup steps the
 * "MCP access" page shows, filled in with this server's name, URL and
 * (right after one is created) the new token. The module README carries
 * the same guide in prose; keep the two in step.
 *
 * The server speaks MCP's Streamable HTTP transport and authenticates
 * with OAuth (a Claude connector signs in through the browser - no token
 * to copy) or `Authorization: Bearer <token>` (every client that can send
 * a header).
 */
export interface McpConnection {
  /** Server name as the client will list it, e.g. "goalnexa". */
  name: string;
  /** Full MCP endpoint URL. */
  url: string;
  /** A personal access token, or a placeholder. */
  token: string;
}

export interface McpClient {
  id: string;
  label: string;
  /** Where the snippet goes / what to do with it. */
  steps: string[];
  language: "shell" | "json" | "toml" | "text";
  /** False when the client signs in with OAuth instead - no token to paste. */
  usesToken?: boolean;
  snippet: (connection: McpConnection) => string;
  /** How to check it worked. */
  verify: string;
}

const envVar = (name: string) => `${name.toUpperCase().replace(/\W/g, "_")}_MCP_TOKEN`;
const json = (value: unknown) => JSON.stringify(value, null, 2);

export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude-connector",
    label: "Claude (connector)",
    usesToken: false,
    steps: [
      "In Claude - the desktop app or claude.ai - open Settings → Connectors and click “Add custom connector”.",
      "Enter the name and URL below. If Claude shows sign-in settings, pick Authentication “Sign in now” and OAuth client “Register automatically” (both marked Detected), and add no request headers. Don't pick “Use Claude's published identity”: this server doesn't support it. Then click Add.",
      "Click Connect. A window opens on this site: sign in if asked, then click Allow.",
      "In a chat, turn the connector on from the tools menu (+). A connector added on claude.ai works in the desktop and mobile apps too. On a Team or Enterprise plan, an owner adds it once under Organization settings → Connectors, then each member clicks Connect.",
    ],
    language: "text",
    snippet: ({ name, url }) =>
      `Name: ${name}\nRemote MCP server URL: ${url}\nAuthentication: Sign in now\nOAuth client: Register automatically\nRequest headers: (none)`,
    verify: "Settings → Connectors shows it as connected, and it appears on this page under Connected apps.",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    steps: [
      "Run this in a terminal. Add `--scope user` to use it in every project, or `--scope project` to share it with a repo through `.mcp.json`.",
      "Or leave out `--header` and no token is needed: run `/mcp` in a session, pick the server and choose Authenticate to sign in through the browser.",
    ],
    language: "shell",
    snippet: ({ name, url, token }) =>
      `claude mcp add --transport http ${name} ${url} \\\n  --header "Authorization: Bearer ${token}"`,
    verify: "Run `claude mcp list`, or `/mcp` inside a session, and check the server shows as connected.",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop (config file)",
    steps: [
      "The “Claude (connector)” option is simpler; use this when custom connectors aren't available to you. Open Settings → Developer → Edit Config (`claude_desktop_config.json`: `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\\Claude\\` on Windows).",
      "Merge this into `mcpServers`, then restart Claude Desktop. It needs Node.js: `mcp-remote` bridges the desktop app to this server with your token.",
      "The server must be reachable over HTTPS unless it's on localhost; for plain `http://` on another host, add `\"--allow-http\"` to `args`.",
    ],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({
        mcpServers: {
          [name]: {
            command: "npx",
            args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
            env: { AUTH_HEADER: `Bearer ${token}` },
          },
        },
      }),
    verify: "The tools icon in a new chat lists the server's tools.",
  },
  {
    id: "codex",
    label: "Codex CLI",
    steps: [
      "Add this to `~/.codex/config.toml` (`codex mcp add <name> --url <url> --bearer-token-env-var <VAR>` writes the same thing).",
      "Codex reads the token from an environment variable, so export it in your shell profile.",
    ],
    language: "toml",
    snippet: ({ name, url, token }) =>
      `# ~/.codex/config.toml\n[mcp_servers.${name}]\nurl = "${url}"\nbearer_token_env_var = "${envVar(name)}"\n\n# ~/.zshrc or ~/.bashrc\n# export ${envVar(name)}="${token}"`,
    verify: "Run `codex mcp list`, or `/mcp` inside a session.",
  },
  {
    id: "cursor",
    label: "Cursor",
    steps: ["Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project)."],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "Settings → MCP shows the server with a green dot and its tools.",
  },
  {
    id: "vscode",
    label: "VS Code",
    steps: [
      "Add this to `.vscode/mcp.json` (or run “MCP: Open User Configuration”). VS Code asks for the token the first time and stores it securely, so it never sits in the file.",
    ],
    language: "json",
    snippet: ({ name, url }) =>
      json({
        inputs: [{ type: "promptString", id: `${name}-token`, description: `${name} personal access token`, password: true }],
        servers: { [name]: { type: "http", url, headers: { Authorization: `Bearer \${input:${name}-token}` } } },
      }),
    verify: "Run “MCP: List Servers”, start the server, and pick its tools in Copilot Chat's agent mode.",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    steps: ["Add this to `~/.gemini/settings.json` (or `.gemini/settings.json` in a project)."],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "Run `/mcp` inside a session.",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    steps: ["Add this to `~/.codeium/windsurf/mcp_config.json`, then refresh in Settings → Cascade → MCP servers."],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { serverUrl: url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "The server shows up with its tools under Cascade's MCP servers.",
  },
  {
    id: "other",
    label: "Other / test",
    steps: [
      "Any client that supports MCP's Streamable HTTP transport with a custom header works: point it at the URL and send `Authorization: Bearer <token>`. To test the token by hand:",
    ],
    language: "shell",
    snippet: ({ url, token }) =>
      `curl -s ${url} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    verify: "The response lists the tools; a 401 means the token is wrong, expired or revoked.",
  },
];
