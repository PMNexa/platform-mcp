# Install the {{server_name}} agent skills

You are an AI coding/assistant agent (Claude Code, Codex, Cursor, Gemini CLI, ...).
The user asked you to install the agent skills for **{{server_name}}**, served by
the instance at {{app_url}}. Follow these steps in order. Tell the user what
you're doing as you go, and don't skip the confirmations.

Skills in this instance: {{skill_names}}

{{skill_list}}

## Step 1: Make sure the MCP server is connected

The skills drive {{server_name}} through its MCP server:

- URL: `{{mcp_url}}`
- Transport: Streamable HTTP
- Auth: header `Authorization: Bearer <personal access token>`

Check whether you already have its tools. They're named `<resource>_<action>`
(`<resource>_list`, `<resource>_create`, ...), possibly with a client prefix
such as `mcp__{{server_name}}__<resource>_list`. If you do, go to step 2.

If you don't:

1. Ask the user to create a personal access token at {{tokens_url}}
   (**New token**, one per client) and paste it to you. Never invent or
   guess a token.
2. Connect the server in your own client. For example:
   - Claude Code: `claude mcp add --transport http --scope user {{server_name}} {{mcp_url}} --header "Authorization: Bearer <token>"`
   - Codex CLI: add `[mcp_servers.{{server_name}}]` with `url = "{{mcp_url}}"` and
     `bearer_token_env_var = "<VAR>"` to `~/.codex/config.toml`, and ask the user
     to export `<VAR>` in their shell profile.
   - Anything else: {{tokens_url}} lists exact steps for each client
     (Claude Desktop, Cursor, VS Code, Gemini CLI, Windsurf).
3. Tell the user that the client may need a restart (or `/mcp`) before the tools
   appear. Continue with step 2 either way: the skills can be installed now.

## Step 2: Choose where skills go

Use the location your client loads Agent Skills (`SKILL.md` folders) from:

| Client | User-wide (default) | Project only |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | `.claude/skills/<name>/` |
| Codex CLI | `~/.codex/skills/<name>/` | `.codex/skills/<name>/` |
| Other clients | the client's skills folder, if it supports Agent Skills | |

Install user-wide unless the user asked for this project only. If your client has
no skills support, save each `SKILL.md` into the project's instructions file for
your client (e.g. append it under a heading in `AGENTS.md` or `GEMINI.md`) and
tell the user that's what you did.

## Step 3: Download and save each skill

For every file listed above, download it exactly as served (plain markdown,
already filled in with this instance's URLs) and save it to
`<skills folder>/<skill name>/<file>`, keeping relative paths.

- If a skill folder already exists, show the user what will change and ask
  before overwriting it. Don't touch other skills.
- Save the files as they are. Don't edit them, summarize them or merge them.

## Step 4: Confirm

List what you installed and where, with each skill's one-line description, and
suggest trying one. Mention that the skills
use the user's own access token, so they can do exactly what the user can in
{{server_name}}, and that to update them later the user just repeats the same
one-line request.
