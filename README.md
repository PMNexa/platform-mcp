# platform-mcp

An [MCP](https://modelcontextprotocol.io) server over every platform-core
`BaseViewSet` resource, plus personal access tokens (PATs) for MCP
clients and a frontend page to manage them. A host app (GoalNexa's
`apps/main`) imports both halves:

- **Backend**: the `platform_mcp` Django app (`backend/`). The MCP
  endpoint gets `<resource>_schema/_list/_get/_create/_update/_delete`
  tools (plus `_link/_unlink` for many-to-many relations) for every
  registered resource, with nothing to write per resource.
- **Frontend**: the `platform-mcp-frontend` package (`frontend/`). One
  "MCP access" page to create and revoke tokens, with setup steps for
  each client below, filled in with the server URL and the new token.

## Using it with an AI client

1. Sign in and open **MCP access** in the sidebar (`/mcp`).
2. Click **New token**, name it after the client (e.g. "Claude Code on
   my laptop"), pick an expiry, and copy the token. It's shown once.
3. Pick your client below (the page shows the same steps with your
   server URL and token already filled in).

The server speaks MCP's **Streamable HTTP** transport at
`https://<your-host>/api/v1/mcp` and authenticates with
`Authorization: Bearer <token>`. Below, `goalnexa` is the server name
and `gnx_...` the token. Replace both, and the URL.

A token acts as you: the assistant can read and change exactly what you
can in the app, and nothing else. Use one token per client so you can
revoke them one at a time. Tokens only work at the MCP endpoint, not
the rest of the API, and can't create or revoke other tokens.

### Claude Code

```sh
claude mcp add --transport http goalnexa https://your-host/api/v1/mcp \
  --header "Authorization: Bearer gnx_..."
```

Add `--scope user` to use it in every project, or `--scope project` to
share it with a repo through `.mcp.json` (then keep the token out of the
file: `"Authorization": "Bearer ${GOALNEXA_MCP_TOKEN}"` is expanded from
the environment). Check with `claude mcp list`, or `/mcp` in a session.

### Claude Desktop

Claude Desktop's own connector settings only support OAuth servers, so
it connects through the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
bridge (needs Node.js). Settings → Developer → Edit Config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "goalnexa": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-host/api/v1/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer gnx_..." }
    }
  }
}
```

Restart Claude Desktop. The header is passed through `env` because a
space inside `args` gets mangled on some platforms. For plain `http://`
on a host other than localhost, add `"--allow-http"` to `args`.

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.goalnexa]
url = "https://your-host/api/v1/mcp"
bearer_token_env_var = "GOALNEXA_MCP_TOKEN"
```

and export the token in your shell profile:
`export GOALNEXA_MCP_TOKEN="gnx_..."`. (`codex mcp add goalnexa --url
... --bearer-token-env-var GOALNEXA_MCP_TOKEN` writes the same config.)
Check with `codex mcp list`, or `/mcp` in a session.

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "goalnexa": {
      "url": "https://your-host/api/v1/mcp",
      "headers": { "Authorization": "Bearer gnx_..." }
    }
  }
}
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json`, or "MCP: Open User Configuration". VS Code asks for
the token once and keeps it in secret storage:

```json
{
  "inputs": [
    { "type": "promptString", "id": "goalnexa-token", "description": "goalnexa personal access token", "password": true }
  ],
  "servers": {
    "goalnexa": {
      "type": "http",
      "url": "https://your-host/api/v1/mcp",
      "headers": { "Authorization": "Bearer ${input:goalnexa-token}" }
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "goalnexa": {
      "httpUrl": "https://your-host/api/v1/mcp",
      "headers": { "Authorization": "Bearer gnx_..." }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "goalnexa": {
      "serverUrl": "https://your-host/api/v1/mcp",
      "headers": { "Authorization": "Bearer gnx_..." }
    }
  }
}
```

### Anything else / testing a token

Any client that supports Streamable HTTP with a custom header works. To
check a token by hand:

```sh
curl -s https://your-host/api/v1/mcp \
  -H "Authorization: Bearer gnx_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A `401` means the token is wrong, expired or revoked.

### Tips for prompting

Each resource has a `<resource>_schema` tool; the server tells clients
to call it first, so the assistant learns the fields and relations on
its own. Things like "log a check-in of 42 on my *Weekly runs* metric",
"which of my goals are behind?" or "create a goal for Q4 with three
metrics" work without further setup.

## Running the tests

```sh
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ../../platform-core/backend -e .
python manage.py test tests --settings=config.test_settings
```

See [AGENTS.md](AGENTS.md) for how it works and how a host wires it in.
