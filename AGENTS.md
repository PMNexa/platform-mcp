# AGENTS.md - platform-mcp

MCP server over every platform-core `BaseViewSet`, OAuth 2.1 sign-in and
personal access tokens (PATs) for MCP clients, and the frontend pages
that manage them.
Split out of platform-core (`core_api/mcp.py`) so the kernel stays
protocol-free and the tokens (a model, so migrations) have a home. The
root README is the user-facing client setup guide.

No standalone deployment: `backend/config/` exists only to run the
tests. A host imports both halves, the same packaged-both-halves
pattern as platform-org (see the GoalNexa root AGENTS.md).

## Backend (`platform_mcp`)

| File | What |
|---|---|
| `server.py` | The MCP protocol (`McpServerView`) and tool generation. No auth of its own. |
| `views.py` | `McpView` (= server + OAuth/PAT auth + `IsAuthenticated`), the token API, the consent + connected-apps API. |
| `oauth.py` | OAuth: metadata documents, client registration, token and revocation endpoints, authorization-request checks. |
| `wellknown_urls.py` | `/.well-known/oauth-protected-resource[/...]`, `/.well-known/oauth-authorization-server[/...]` - mounted at the host's ROOT. |
| `authentication.py` | `OAuthAccessTokenAuthentication`, `PersonalAccessTokenAuthentication`, `ActorStub`. |
| `models.py` | `PersonalAccessToken`, `OAuthClient`/`OAuthAuthorizationCode`/`OAuthGrant`/`OAuthAccessToken` (hashes only; `user_id` is a bare string). |
| `skills.py` | Agent-skills discovery (`mcp_skills/` in installed apps) and rendering. |
| `skills_index.md` | The skills index template = the one-prompt install procedure. |
| `urls.py` | `mcp`, `mcp/tokens[/<id>]`, `mcp/oauth/{authorize,grants[/<id>],register,token,revoke}`, `mcp/skills`, `mcp/skills/<name>/<file>` (namespace `platform_mcp`) - mount under the API prefix. |

**Tools**: `<resource>_schema/_list/_get/_create/_update/_delete`, plus
`_link/_unlink` when the resource has a many-to-many relation.
Only tools the caller can use are listed: a resource whose `schema` the
caller can't read is left out, and so is each `_create/_update/_delete`
(and `_link/_unlink`) the schema's `can` says no to (platform-core's
access policy - e.g. RBAC). `<resource>` is the endpoint's last path segment with non-word chars as
`_` (`/api/v1/check-ins` → `check_ins_list`). A resource shows up when it
has both a `BaseViewSet` (auto-registered) and a
`register_model_endpoint` call; `mcp_enabled = False` on the viewset
hides it (read with `getattr`, so platform-core doesn't declare it).

**Every tool call is an internal sub-request to the real API URL**
(`_call_api`: a `WSGIRequest` built from the MCP request's own `META`,
resolved through the host's urlconf, the view called directly). The
MCP request's already-authenticated actor is forced onto it
(`_force_auth_user`/`_force_auth_token` - DRF's own hook, read by
`rest_framework.request.Request`, not test-only), so the resource views
run as the caller whatever authenticated the MCP request. Auth,
permissions, `get_queryset()` scoping, validation and the
`{code, message, field_errors}` error contract are the REST API's own;
an API error comes back as a tool result with `isError: true` and
`HTTP <status>: <body>`. Input schemas are built from each resource's
`schema` action, fetched the same way per `tools/list`. `_create`/
`_update` also take a read-only to-one relation: a child's parent (a
check-in's `metric`) is read-only in the schema but set by the view from
the request body. Don't add a tool that talks to the ORM directly;
that's a second code path with its own permission bugs.

Transport is stateless Streamable HTTP: one `POST` per JSON-RPC message
or batch, JSON answers (no SSE, no sessions, `GET` → 405).

**PATs are MCP-only.** `McpView.get_authenticators()` puts
`PersonalAccessTokenAuthentication` in front of the host's own
authenticators, and nothing else uses it: the resource views never see
a PAT (the sub-request carries the resolved actor instead), and the
token API refuses one (it's not in the host's defaults, and
`_SessionOnlyView` rejects `request.auth` being a token, in case a host
adds it there). So a leaked token can't mint tokens or hide by revoking
others. The PAT class returns `None` for a bearer without the prefix,
so a platform-auth JWT still works at the MCP endpoint.

Tokens: `MCP_TOKEN_PREFIX` + 40 random letters/digits; only a SHA-256 is
stored; `prefix` (prefix + 6 chars) is kept for display. `last_used_at`
is written at most once a minute. A PAT resolves to `ActorStub(id=
user_id)` - `.id` is all the resource views read (true of platform-org
and goalnexa); a view needing a real `User` would break under a PAT.

**OAuth** (`oauth.py`) is for clients that can't be given a static
header - Claude's custom connectors (desktop, claude.ai, mobile), also
Claude Code without `--header`. MCP's authorization flow: the MCP
endpoint's 401 carries `WWW-Authenticate: Bearer resource_metadata=
"<origin>/.well-known/oauth-protected-resource/<mcp path>"` (set in
`McpView.finalize_response`, on every 401); that names this server as
its own authorization server (issuer = the origin); the client registers
itself (`register`, RFC 7591 - public clients by default, a secret only
if it asks for `client_secret_post/basic`; redirect URIs https, loopback
http or a custom scheme), sends the user to the consent page, and trades
the code at `token`. PKCE S256 is required; codes are single-use, 10
minutes, bound to client + redirect URI; `resource` must be our MCP URL
if sent. The consent page is a FRONTEND route
(`<basePath>/authorize`, `MCP_OAUTH_AUTHORIZE_PAGE`, default
`MCP_TOKENS_PAGE + "/authorize"`) behind the host's own login - so no
server-side session or cookie is involved: the page calls
`GET|POST mcp/oauth/authorize` with the session's access token (bearer
header, so no CSRF), and follows the returned `redirect_to`. A bad
client or redirect URI is shown on the page, never redirected to (open
redirect); other errors go back to the client OAuth-style.

An approval is an `OAuthGrant` - a "connected app", listed and revoked
through `mcp/oauth/grants` next to the PATs. It holds ONE refresh token
(`mcprt_`, rotated on every use, 30-day sliding window) and has
short-lived access tokens (`mcpat_`, 1 hour), which
`OAuthAccessTokenAuthentication` accepts at the MCP endpoint only - the
same reach and the same "can't manage tokens or grants" rule as a PAT
(`_SessionOnlyView` refuses both). `revoke` (RFC 7009) with either token
deletes the grant. `register` and `token`/`revoke` are throttled per IP
(`MCP_OAUTH_REGISTER_RATE`, `MCP_OAUTH_TOKEN_RATE`, in the default
cache). Gaps: no refresh-token replay detection (a reused old refresh
token just fails), no Client ID Metadata Documents (clients must
register), one scope (`mcp`).

A tool call that raises (the API crashed instead of answering) becomes
that tool's `isError` result (`HTTP 500`, generic message, logged), not
a 500 for the whole JSON-RPC request.

**Agent skills** (`skills.py`): a skill is `mcp_skills/<name>/SKILL.md`
(+ any files it references) inside ANY installed app, found like
`templates/` - nothing to register; the domain module owns the content
(goalnexa: check-in / review / plan), this module the mechanism. Served
publicly (plain Django views, markdown, no auth - instructions, no data;
an agent reads them before it has a token): `GET mcp/skills` renders
`skills_index.md` - the install procedure an agent follows from the one
line "Install the <name> skills from <url>" (check/connect MCP, pick the
client's skills folder, download each file verbatim, confirm before
overwriting) - and `GET mcp/skills/<name>/<file>` serves a file, never
outside its skill folder. Every served file is rendered with
`{{app_url}}`/`{{mcp_url}}`/`{{skills_url}}`/`{{tokens_url}}`/
`{{server_name}}` (unknown placeholders stay as-is); the URLs come from
`reverse()` + the request origin, or `MCP_PUBLIC_URL` behind a proxy
that rewrites Host/scheme - which is why the gateway must forward the
client's real `Host` with its port (GoalNexa's nginx uses `$http_host`).
Skills must only use the MCP tools (no REST/ORM assumptions), since
that's all a client has.

Settings (all optional): `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`,
`MCP_INSTRUCTIONS`, `MCP_TOKEN_PREFIX` (default `pat_`; GoalNexa uses
`gnx_`), `MCP_PUBLIC_URL`, `MCP_TOKENS_PAGE` (frontend path of the
tokens page, default `/mcp`), `MCP_OAUTH_AUTHORIZE_PAGE` (the consent
page, default `<MCP_TOKENS_PAGE>/authorize`), `MCP_OAUTH_ACCESS_TOKEN_TTL`
(seconds, 3600), `MCP_OAUTH_REFRESH_TOKEN_DAYS` (30),
`MCP_OAUTH_REGISTER_RATE` (`20/hour`), `MCP_OAUTH_TOKEN_RATE` (`60/min`).

Host wiring: `pip install -e` this `backend/` (next to platform-core's),
add `"platform_mcp"` to `INSTALLED_APPS`, `path("api/v1/",
include("platform_mcp.urls"))` and `path("", include(
"platform_mcp.wellknown_urls"))`, route `/.well-known/oauth-*` to the
backend at the gateway, migrate. OAuth needs the public origin right
(forwarded `Host` + scheme, or `MCP_PUBLIC_URL`): it's the issuer and
every URL in the metadata.

Gap: the registry path is resolved as-is, so a module mounted under a
gateway prefix the backend never sees would 404.

## Frontend (`platform-mcp-frontend`)

`createMcpNavItems(basePath)` (`src/mcpNav.tsx`, from `"."`) is its
"MCP access" sidebar link with its own icon - same `basePath` as the
routes; apps/main spreads it into `app-shell.tsx`'s `NAV_ITEMS`. No
`permission` on it: every signed-in user manages their own tokens.

`createMcpRoutes(basePath)` (from `"."`) registers two route files:
`routes/mcp.tsx` (`McpAccessScreen` - tokens, connected apps, client
guide) and `routes/mcp-authorize.tsx` at `<basePath>/authorize`
(`McpAuthorizeScreen` - the OAuth consent page; it leaves through
`window.location`, since the destination is the app's own site). Both
read the access token from the host layout's outlet context. Mount it inside the
session-gated layout (`...createMcpRoutes("mcp")`), add the package to
the host's `optimizeDeps.exclude` and `ssr.noExternal`.

`McpConnectGuide` (also from `"."`) is the client guide on its own, for
another package's screen (goalnexa's onboarding wizard): pick ONE
client, see its steps and snippet; a token-based client gets "Create a
token" (a personal access token, shown once, filled into the snippet).
Same `MCP_CLIENTS`, so the two stay in step.

The screen asks the MCP server itself (`initialize` + `tools/list`, as
the logged-in user) for its name and tool count, so nothing about the
host is configured in the package. The absolute server URL comes from
`window.location` (`useSyncExternalStore`, relative on the server
render). Per-client setup steps live in `lib/clients.ts` - keep them in
step with README.md.

## Tests

`cd backend && python manage.py test tests --settings=config.test_settings`
(see README.md for the venv). `tests/testapp` has the same models as
platform-core's, scoped to `request.user.id`, an `X-As: <id>`
header login standing in for the host's, and a `demo-skill` under
`tests/testapp/mcp_skills/`.
