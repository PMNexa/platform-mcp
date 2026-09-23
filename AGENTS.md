# AGENTS.md - platform-mcp

MCP server over every platform-core `BaseViewSet`, personal access
tokens (PATs) for MCP clients, and the frontend page that manages them.
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
| `views.py` | `McpView` (= server + PAT auth + `IsAuthenticated`) and the token API. |
| `authentication.py` | `PersonalAccessTokenAuthentication`, `ActorStub`. |
| `models.py` | `PersonalAccessToken` (hash only; `user_id` is a bare string). |
| `urls.py` | `mcp`, `mcp/tokens`, `mcp/tokens/<id>` - mount under the API prefix. |

**Tools**: `<resource>_schema/_list/_get/_create/_update/_delete`, plus
`_link/_unlink` when the resource has a many-to-many relation.
`<resource>` is the endpoint's last path segment with non-word chars as
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

Settings (all optional): `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`,
`MCP_INSTRUCTIONS`, `MCP_TOKEN_PREFIX` (default `pat_`; GoalNexa uses
`gnx_`).

Host wiring: `pip install -e` this `backend/` (next to platform-core's),
add `"platform_mcp"` to `INSTALLED_APPS`, `path("api/v1/",
include("platform_mcp.urls"))`, migrate.

Gap: the registry path is resolved as-is, so a module mounted under a
gateway prefix the backend never sees would 404.

## Frontend (`platform-mcp-frontend`)

`createMcpRoutes(basePath)` (from `"."`) registers one route file,
`routes/mcp.tsx`, which reads the access token from the host layout's
outlet context and renders `McpAccessScreen`. Mount it inside the
session-gated layout (`...createMcpRoutes("mcp")`), add the package to
the host's `optimizeDeps.exclude` and `ssr.noExternal`.

The screen asks the MCP server itself (`initialize` + `tools/list`, as
the logged-in user) for its name and tool count, so nothing about the
host is configured in the package. The absolute server URL comes from
`window.location` (`useSyncExternalStore`, relative on the server
render). Per-client setup steps live in `lib/clients.ts` - keep them in
step with README.md.

## Tests

`cd backend && python manage.py test tests --settings=config.test_settings`
(see README.md for the venv). `tests/testapp` has the same models as
platform-core's, scoped to `request.user.id`, and an `X-As: <id>`
header login standing in for the host's.
