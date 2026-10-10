/**
 * How to connect each AI client to the MCP server - ONE record per
 * client, the single source for every place that explains it: the
 * connect wizard (`McpConnectGuide`, on the "MCP access" page and in a
 * host's onboarding) and the README's client section, which
 * `scripts/readme-clients.ts` generates from this file (CI fails when the
 * two differ - edit here, then `npm run readme`).
 *
 * The server speaks MCP's Streamable HTTP transport and authenticates
 * with OAuth (the client signs in through the browser - no token to copy)
 * or `Authorization: Bearer <token>` (every client that can send a
 * header).
 *
 * Step text may use `{name}`, `{url}` (the server's name and MCP URL) and
 * `{site}` ("this site" in the app, "your instance" in the README), and
 * inline `code` spans.
 */
export interface McpConnection {
  /** Server name as the client will list it, e.g. "goalnexa". */
  name: string;
  /** Full MCP endpoint URL. */
  url: string;
  /** A personal access token, or a placeholder. */
  token: string;
}

/** Where the picker lists a client. */
export type McpClientGroup = "chat" | "editor" | "cli" | "other";

export const MCP_CLIENT_GROUPS: { id: McpClientGroup; label: string }[] = [
  { id: "chat", label: "Chat apps" },
  { id: "editor", label: "Code editors" },
  { id: "cli", label: "Command line" },
  { id: "other", label: "Other" },
];

export interface McpGuideStep {
  text: string;
  /** What the step hands over below its text: the server URL to copy, or the client's snippet. */
  show?: "url" | "snippet";
  /**
   * A screenshot of this step: a file under the backend's
   * `platform_mcp/static/platform_mcp/connect/` (e.g. `gemini-web/2.png`),
   * which the host serves at `/static/` - see `guideImageUrl`. How to take
   * one: docs/connect-screenshots.md.
   */
  image?: string;
}

export interface McpClient {
  id: string;
  label: string;
  group: McpClientGroup;
  /** One line on the picker card. */
  summary: string;
  /** `oauth`: signs in through the browser; `token`: needs a personal access token. */
  signIn: "oauth" | "token";
  /** Where it runs once connected, e.g. ["Web", "Desktop", "Phone"]. */
  platforms: string[];
  /** Who can use it at all (plan, country, account type) - shown before the steps. */
  requirements?: string[];
  steps: McpGuideStep[];
  language?: "shell" | "json" | "toml" | "text";
  snippet?: (connection: McpConnection) => string;
  /** More detail after the steps (the README shows it; the wizard too). */
  notes?: string[];
  /** How to check it worked, in the client itself. */
  verify: string;
  /** Known problems: "<symptom>: <fix>". */
  troubleshooting?: string[];
  /** When someone last ran these steps end to end (YYYY-MM-DD); unset = not yet. */
  checkedOn?: string;
}

const envVar = (name: string) => `${name.toUpperCase().replace(/\W/g, "_")}_MCP_TOKEN`;
const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Where `McpGuideStep.image` files live, relative to the module's `backend/`. */
export const GUIDE_IMAGE_DIR = "platform_mcp/static/platform_mcp/connect";

/** What using it looks like: a neutral chat around a real exchange (`npm run screens`). */
export const GUIDE_CHAT_IMAGE = "chat.png";

/** The URL a host serves a step's screenshot at (Django's static files, `/static/`). */
export function guideImageUrl(image: string, apiBaseUrl = ""): string {
  return `${apiBaseUrl}/static/platform_mcp/connect/${image}`;
}

/** Fills `{name}`/`{url}`/`{site}` in a step or note. */
export function fillGuideText(
  text: string,
  { name, url, site = "this site" }: Pick<McpConnection, "name" | "url"> & { site?: string },
): string {
  return text.replaceAll("{name}", name).replaceAll("{url}", url).replaceAll("{site}", site);
}

export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude-connector",
    label: "Claude",
    group: "chat",
    summary: "claude.ai, the desktop app and the phone app - a custom connector.",
    signIn: "oauth",
    platforms: ["Web", "Desktop", "Phone"],
    steps: [
      {
        text: "In Claude - claude.ai or the desktop app - open Customize → Connectors, click Add, then “Add custom connector”. (Older versions: Settings → Connectors.)",
        image: "claude-connector/1.png",
      },
      { text: "Name: `{name}`. MCP server URL - then click Continue:", show: "url", image: "claude-connector/2.png" },
      {
        text: "Claude checks the server and shows sign-in settings: keep the ones it marks Detected - Authentication “Sign in now”, OAuth client “Register automatically”, no request headers. Don't pick “Use Claude's published identity”: this server doesn't support it. Then click Add.",
        image: "claude-connector/3.png",
      },
      { text: "Click Connect. A window opens on {site}: sign in if asked, then click Allow.", image: "consent.png" },
      { text: "In a chat, open + → Connectors and turn it on.", image: "claude-connector/5.png" },
    ],
    notes: [
      "A connector added on claude.ai works in the desktop and phone apps too. On a Team or Enterprise plan, an owner adds it once under Organization settings → Connectors, then each member clicks Connect.",
      "The server must be reachable from the internet over HTTPS: Claude connects from Anthropic's servers, not from your computer.",
    ],
    verify: "Customize → Connectors shows it as connected, and it's listed under Connected apps on the MCP access page.",
    troubleshooting: [
      "“Couldn't connect” right after Add: the URL must be public HTTPS - a localhost or LAN address can't be reached from Anthropic's servers.",
      "“A connector with this URL already exists”: it's already added - turn it on from + → Connectors in a chat.",
      "Connected but Claude never uses it: turn it on from + → Connectors in that chat, or name it in your prompt.",
    ],
    checkedOn: "2026-10-02",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    group: "chat",
    summary: "chatgpt.com - a custom MCP server, added as a plugin.",
    signIn: "oauth",
    platforms: ["Web"],
    requirements: [
      "On Business and Enterprise, a workspace owner may need to allow custom MCP servers first.",
    ],
    steps: [
      {
        text: "On chatgpt.com, open Plugins in the sidebar, click Add, then “Add custom MCP server”.",
        image: "chatgpt/1.png",
      },
      { text: "Name: `{name}`. Under Connection, keep Server URL and paste:", show: "url", image: "chatgpt/2.png" },
      {
        text: "Authentication: OAuth. Tick “I understand and want to continue”, then click “Create as a plugin”.",
        image: "chatgpt/3.png",
      },
      { text: "A window opens on {site}: sign in if asked, then click Allow.", image: "consent.png" },
      {
        text: "In a chat, click + and pick the app, or name it in your prompt. ChatGPT asks before each change.",
        image: "chatgpt/5.png",
      },
    ],
    verify: "Plugins lists it under Installed, and it's listed under Connected apps on the MCP access page.",
    troubleshooting: [
      "No Plugins page or no “Add custom MCP server”: older accounts have it under Settings → Apps → Advanced settings → Developer mode, then Create.",
      "It reads but never changes anything: check the app's permission under Settings → Plugins (“Allow low-risk tools” asks before changes).",
      "Connected but never used: pick it from + in that chat, or name it in your prompt.",
    ],
    checkedOn: "2026-10-10",
  },
  {
    id: "gemini-web",
    label: "Gemini",
    group: "chat",
    summary: "gemini.google.com and the Gemini phone app - a custom app.",
    signIn: "oauth",
    platforms: ["Web", "Phone"],
    requirements: [
      "A personal Google account (not work or school), 18 or older. Custom apps are still rolling out, so not every account has them yet.",
      "Keep Activity turned on (Gemini → Settings → Activity).",
    ],
    steps: [
      {
        text: "On a computer, open gemini.google.com → Settings (bottom left) → Personal Intelligence → Connected Apps.",
        image: "gemini-web/1.png",
      },
      {
        text: "Under Custom apps, click “Add a custom app” and paste this URL exactly - no trailing slash:",
        show: "url",
        image: "gemini-web/2.png",
      },
      { text: "Click Next. A window opens on {site}: sign in if asked, then click Allow.", image: "consent.png" },
      {
        text: "In a chat, type @ and pick the app. Once connected here it works in the Gemini phone app too. Gemini asks before each change.",
        image: "gemini-web/4.png",
      },
    ],
    verify: "Connected Apps lists it under Custom apps, and it's listed under Connected apps on the MCP access page.",
    troubleshooting: [
      "No Personal Intelligence or Custom apps: the account doesn't have custom apps yet (see above) - they're still rolling out.",
      "“This MCP server is already connected”: it's already added - type @ in a chat to use it.",
      "Signed in, but Gemini does nothing with it: turn on Keep Activity.",
    ],
    checkedOn: "2026-10-10",
  },
  {
    id: "cursor",
    label: "Cursor",
    group: "editor",
    summary: "A config file, all projects or one.",
    signIn: "token",
    platforms: ["Desktop"],
    steps: [{ text: "Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project).", show: "snippet" }],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "Settings → MCP shows the server with a green dot and its tools.",
  },
  {
    id: "vscode",
    label: "VS Code",
    group: "editor",
    summary: "Copilot agent mode; the token goes in secret storage.",
    signIn: "token",
    platforms: ["Desktop"],
    steps: [
      {
        text: "Add this to `.vscode/mcp.json` (or run “MCP: Open User Configuration”). VS Code asks for the token the first time and stores it securely, so it never sits in the file.",
        show: "snippet",
      },
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
    id: "windsurf",
    label: "Windsurf",
    group: "editor",
    summary: "A config file for Cascade.",
    signIn: "token",
    platforms: ["Desktop"],
    steps: [
      { text: "Add this to `~/.codeium/windsurf/mcp_config.json`, then refresh in Settings → Cascade → MCP servers.", show: "snippet" },
    ],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { serverUrl: url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "The server shows up with its tools under Cascade's MCP servers.",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    group: "cli",
    summary: "One command; sign in through the browser or use a token.",
    signIn: "token",
    platforms: ["Terminal"],
    steps: [
      {
        text: "Run this in a terminal. Add `--scope user` to use it in every project, or `--scope project` to share it with a repo through `.mcp.json`.",
        show: "snippet",
      },
      {
        text: "Or leave out `--header` and no token is needed: run `/mcp` in a session, pick the server and choose Authenticate to sign in through the browser.",
      },
    ],
    language: "shell",
    snippet: ({ name, url, token }) =>
      `claude mcp add --transport http ${name} ${url} \\\n  --header "Authorization: Bearer ${token}"`,
    notes: [
      "With `--scope project`, keep the token out of the shared file: `\"Authorization\": \"Bearer ${MCP_TOKEN}\"` in `.mcp.json` is read from the environment.",
    ],
    verify: "Run `claude mcp list`, or `/mcp` inside a session, and check the server shows as connected.",
  },
  {
    id: "codex",
    label: "Codex CLI",
    group: "cli",
    summary: "A config file; the token comes from an environment variable.",
    signIn: "token",
    platforms: ["Terminal"],
    steps: [
      {
        text: "Add this to `~/.codex/config.toml` (`codex mcp add <name> --url <url> --bearer-token-env-var <VAR>` writes the same thing).",
        show: "snippet",
      },
      { text: "Codex reads the token from an environment variable, so export it in your shell profile." },
    ],
    language: "toml",
    snippet: ({ name, url, token }) =>
      `# ~/.codex/config.toml\n[mcp_servers.${name}]\nurl = "${url}"\nbearer_token_env_var = "${envVar(name)}"\n\n# ~/.zshrc or ~/.bashrc\n# export ${envVar(name)}="${token}"`,
    verify: "Run `codex mcp list`, or `/mcp` inside a session.",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    group: "cli",
    summary: "A settings file, for you or one project.",
    signIn: "token",
    platforms: ["Terminal"],
    steps: [{ text: "Add this to `~/.gemini/settings.json` (or `.gemini/settings.json` in a project).", show: "snippet" }],
    language: "json",
    snippet: ({ name, url, token }) =>
      json({ mcpServers: { [name]: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } } }),
    verify: "Run `/mcp` inside a session.",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop (config file)",
    group: "other",
    summary: "Only where custom connectors aren't available - needs Node.js.",
    signIn: "token",
    platforms: ["Desktop"],
    steps: [
      {
        text: "The Claude connector is simpler; use this when custom connectors aren't available to you. Open Settings → Developer → Edit Config (`claude_desktop_config.json`: `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\\Claude\\` on Windows).",
      },
      {
        text: "Merge this into `mcpServers`, then restart Claude Desktop. It needs Node.js: `mcp-remote` bridges the desktop app to this server with your token.",
        show: "snippet",
      },
      {
        text: "The server must be reachable over HTTPS unless it's on localhost; for plain `http://` on another host, add `\"--allow-http\"` to `args`.",
      },
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
    notes: ["The header goes through `env` because a space inside `args` gets mangled on some platforms."],
    verify: "The tools icon in a new chat lists the server's tools.",
  },
  {
    id: "other",
    label: "Other / test",
    group: "other",
    summary: "Any client with Streamable HTTP and a custom header.",
    signIn: "token",
    platforms: [],
    steps: [
      {
        text: "Any client that supports MCP's Streamable HTTP transport with a custom header works: point it at the URL and send `Authorization: Bearer <token>`. To test the token by hand:",
        show: "snippet",
      },
    ],
    language: "shell",
    snippet: ({ url, token }) =>
      `curl -s ${url} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    verify: "The response lists the tools; a 401 means the token is wrong, expired or revoked.",
  },
];
