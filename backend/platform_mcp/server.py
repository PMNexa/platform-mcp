"""An MCP server over every registered `BaseViewSet` - the same resources
the REST API serves, as tools an AI client (Claude Code, Claude Desktop,
Codex, Cursor, ...) can call. Nothing per resource to write: a resource
gets tools as soon as it's registered the usual way (a `BaseViewSet`
subclass plus a `register_model_endpoint` call in its app's urls.py). Set
`mcp_enabled = False` on a viewset to leave it out.

Every tool call is an internal sub-request to the resource's REAL API URL
(resolved through the host's own urlconf, dispatched to the viewset) as
the MCP caller - the actor the MCP request authenticated as (a PAT or a
platform-auth JWT) is forced onto the sub-request, so it's
permission-checked, scoped (`get_queryset()`), validated and error-shaped
exactly like the same call over HTTP. There is no second code path to
keep in sync, and no way for a tool to reach a row the caller's API
couldn't. Input schemas come from each resource's own `schema` action,
fetched the same way, so a resource the caller can't read the schema of
gets no tools.

Transport: MCP's Streamable HTTP, stateless - one `POST` per JSON-RPC
message (or batch), answered with plain `application/json` (the spec lets
a server skip SSE when it never streams). No sessions, no server-initiated
messages; `GET` isn't offered (405). `McpServerView` is the protocol
only; views.py's `McpView` adds PAT authentication and `IsAuthenticated`,
and is what `platform_mcp.urls` mounts.
"""

from __future__ import annotations

import io
import json
import logging
import re
from urllib.parse import urlencode

from core_api.registry import _registry, model_viewset
from django.conf import settings
from django.core.handlers.wsgi import WSGIRequest
from django.urls import Resolver404, resolve
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")

_ID_SCHEMA = {"type": ["string", "integer"]}
_TYPE_SCHEMAS = {
    "boolean": {"type": "boolean"},
    "integer": {"type": "integer"},
    "number": {"type": "number"},
    "date": {"type": "string", "format": "date"},
    "datetime": {"type": "string", "format": "date-time"},
    "email": {"type": "string", "format": "email"},
}


def _resources() -> dict[str, str]:
    """`{tool prefix: API path}` for every MCP-enabled `BaseViewSet` with a
    registered endpoint - `/api/v1/check-ins` becomes `check_ins`."""
    resources = {}
    for model, path in _registry.items():
        viewset_class = model_viewset(model)
        if viewset_class is None or not getattr(viewset_class, "mcp_enabled", True):
            continue
        resources[re.sub(r"\W", "_", path.rstrip("/").rsplit("/", 1)[-1])] = path.rstrip("/")
    return resources


def _call_api(request, method: str, path: str, *, query=None, body=None) -> tuple[int, object]:
    """Dispatch `method path` through the host's urlconf as if the MCP
    caller had sent it - same actor, same headers, same remote address. Returns `(status, parsed JSON body or None)`."""
    payload = json.dumps(body).encode() if body is not None else b""
    environ = {
        **request.META,
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": urlencode(query or [], doseq=True),
        "CONTENT_TYPE": "application/json",
        "CONTENT_LENGTH": str(len(payload)),
        "HTTP_ACCEPT": "application/json",
        "wsgi.input": io.BytesIO(payload),
    }
    try:
        match = resolve(path)
    except Resolver404:
        return 404, {"code": "not_found", "message": f"No API at {path}.", "field_errors": None}
    sub_request = WSGIRequest(environ)
    sub_request._dont_enforce_csrf_checks = True
    # DRF's own forced-auth hook (`rest_framework.request.Request` reads
    # these): the sub-request runs as the actor the MCP request already
    # authenticated as, whatever authenticated it - a PAT is accepted at
    # the MCP endpoint only, the resource views never have to know one.
    sub_request._force_auth_user = request.user
    sub_request._force_auth_token = request.auth
    response = match.func(sub_request, *match.args, **match.kwargs)
    if hasattr(response, "render"):
        response.render()
    content = response.content
    return response.status_code, json.loads(content) if content else None


def _field_schema(field: dict) -> dict:
    if field["type"] == "relation":
        tools = {path: key for key, path in _resources().items()}
        key = tools.get((field.get("related_endpoint") or "").rstrip("/"))
        schema = {**_ID_SCHEMA, "description": f"Id of a row from `{key}_list`." if key else "Id of a related row."}
    else:
        schema = dict(_TYPE_SCHEMAS.get(field["type"], {"type": "string"}))
        if field.get("format") == "uuid":
            schema["format"] = "uuid"
    if field.get("choices"):
        schema["enum"] = [choice["value"] for choice in field["choices"]]
    if field.get("nullable"):
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        schema["type"] = [*types, "null"]
        if "enum" in schema:
            schema["enum"] = [*schema["enum"], None]
    schema["title"] = field["label"]
    if field.get("help_text"):
        schema["description"] = " ".join(filter(None, [field["help_text"], schema.get("description")]))
    return schema


def _object_schema(properties: dict, required=()) -> dict:
    schema = {"type": "object", "properties": properties, "additionalProperties": False}
    if required:
        schema["required"] = list(required)
    return schema


def _tools_for(key: str, schema: dict) -> list[dict]:
    """The tools one resource gets, derived from its `schema` action's
    response (see `BaseViewSet.schema`)."""
    fields = schema["fields"]
    one, many = schema["label"], schema["label_plural"]
    # A read-only to-one relation stays an input: this platform's views set
    # a child's parent from the request body themselves (a check-in's
    # `metric`, scoped to the caller), the same key the UI's forms send.
    writable = [f for f in fields if not f.get("many") and (not f["read_only"] or f["type"] == "relation")]
    write_props = {f["name"]: _field_schema(f) for f in writable}
    includable = [f["name"] for f in fields if f["type"] == "relation"]
    m2m = [f for f in fields if f.get("kind") == "many_to_many"]
    names = ", ".join(f["name"] for f in fields)
    include = {"type": "array", "items": {"type": "string", "enum": includable}, "description": "Relations to return as full nested rows instead of ids."}

    list_props = {
        "filter": {
            "type": "object",
            "additionalProperties": {"type": ["string", "number", "boolean", "array"]},
            "description": (
                "Field -> value, exact match. Keys may add a lookup (`field.icontains`, `.gt`, `.gte`, "
                "`.lt`, `.lte`, `.isnull`, `.in` with an array), traverse relations (`goal.title`) or be "
                "negated with a leading `-`."
            ),
        },
        "sort": {"type": "string", "description": "Field to sort by, `-field` for descending; comma-separate several."},
        "page": {"type": "integer", "minimum": 1},
        "page_size": {"type": "integer", "minimum": 1, "maximum": 100},
    }
    if schema.get("searchable"):
        list_props["q"] = {"type": "string", "description": "Free-text search."}
    if includable:
        list_props["include"] = include
    get_props = {"id": _ID_SCHEMA, **({"include": include} if includable else {})}

    tools = [
        {
            "name": f"{key}_schema",
            "description": f"Describe {many}: every field with its type, whether it's required/read-only, choices and relations.",
            "inputSchema": _object_schema({}),
            "annotations": {"readOnlyHint": True},
        },
        {
            "name": f"{key}_list",
            "description": f"List {many} (paginated: items, total, page, page_size). Fields: {names}.",
            "inputSchema": _object_schema(list_props),
            "annotations": {"readOnlyHint": True},
        },
        {
            "name": f"{key}_get",
            "description": f"Get one {one} by id.",
            "inputSchema": _object_schema(get_props, ["id"]),
            "annotations": {"readOnlyHint": True},
        },
        {
            "name": f"{key}_create",
            "description": f"Create a {one}. Returns the new row.",
            "inputSchema": _object_schema(write_props, [f["name"] for f in writable if f["required"]]),
        },
        {
            "name": f"{key}_update",
            "description": f"Update a {one}: only the fields given change. Returns the updated row.",
            "inputSchema": _object_schema({"id": _ID_SCHEMA, **write_props}, ["id"]),
        },
        {
            "name": f"{key}_delete",
            "description": f"Delete a {one}.",
            "inputSchema": _object_schema({"id": _ID_SCHEMA}, ["id"]),
            "annotations": {"destructiveHint": True},
        },
    ]
    # Only tools the caller can use: the schema's `can` (platform-core -
    # the viewset serves it and the host's access policy allows it).
    can = schema.get("can") or {}
    tools = [t for t in tools if can.get(t["name"].removeprefix(f"{key}_"), True)]
    if m2m and can.get("update", True):
        relation = {"type": "string", "enum": [f["name"] for f in m2m]}
        ids = {"type": "array", "items": _ID_SCHEMA, "minItems": 1}
        through = {
            f["name"]: _object_schema(
                {t["name"]: _field_schema(t) for t in f.get("through_fields", [])},
                [t["name"] for t in f.get("through_fields", []) if t["required"]],
            )
            for f in m2m
            if f.get("through_fields")
        }
        link_props = {"id": _ID_SCHEMA, "relation": relation, "ids": ids}
        if through:
            link_props["through"] = {
                "type": "object",
                "description": "Extra fields stored on each new link, by relation: "
                + "; ".join(f"{name}: {json.dumps(s['properties'])}" for name, s in through.items()),
            }
        tools += [
            {
                "name": f"{key}_link",
                "description": f"Link a {one} to existing rows of a many-to-many relation. Already-linked ids are left as they are.",
                "inputSchema": _object_schema(link_props, ["id", "relation", "ids"]),
            },
            {
                "name": f"{key}_unlink",
                "description": f"Unlink rows of a many-to-many relation from a {one} (the rows themselves stay).",
                "inputSchema": _object_schema({"id": _ID_SCHEMA, "relation": relation, "ids": ids}, ["id", "relation", "ids"]),
            },
        ]
    return tools


def _query_value(value) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"  # what both a BooleanField and `.isnull` accept
    if isinstance(value, list):
        return ",".join(_query_value(v) for v in value)
    return str(value)


def _list_query(arguments: dict) -> list[tuple[str, str]]:
    query = [(f"filter{{{key}}}", _query_value(value)) for key, value in (arguments.get("filter") or {}).items()]
    for name in ("sort", "q", "page", "page_size"):
        if arguments.get(name) not in (None, ""):
            query.append((name, str(arguments[name])))
    return query + _include_query(arguments)


def _include_query(arguments: dict) -> list[tuple[str, str]]:
    return [("include[]", name) for name in arguments.get("include") or []]


def _call_tool(request, name: str, arguments: dict) -> tuple[int, object]:
    key, _, op = name.rpartition("_")
    path = _resources().get(key)
    if path is None:
        raise KeyError(name)
    arguments = dict(arguments)
    row = f"{path}/{arguments.pop('id', '')}"
    if op == "schema":
        return _call_api(request, "GET", f"{path}/schema")
    if op == "list":
        return _call_api(request, "GET", path, query=_list_query(arguments))
    if op == "get":
        return _call_api(request, "GET", row, query=_include_query(arguments))
    if op == "create":
        return _call_api(request, "POST", path, body=arguments)
    if op == "update":
        return _call_api(request, "PATCH", row, body=arguments)
    if op == "delete":
        return _call_api(request, "DELETE", row)
    if op in ("link", "unlink"):
        relation = arguments.pop("relation", "")
        return _call_api(request, "POST", f"{row}/relations/{relation}/{op}", body=arguments)
    raise KeyError(name)


def _tool_result(status: int, data) -> dict:
    if data is None:
        text = "Done."
    else:
        text = json.dumps(data, ensure_ascii=False)
    if status >= 400:
        text = f"HTTP {status}: {text}"
    return {"content": [{"type": "text", "text": text}], "isError": status >= 400}


class _RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class McpServerView(APIView):
    """The MCP protocol - see this module's docstring. Settings read (all
    optional): `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`, `MCP_INSTRUCTIONS`.
    """

    def post(self, request):
        try:
            message = json.loads(request._request.body or b"null")
        except ValueError:
            return Response(_rpc_error(None, -32700, "Parse error."))
        if isinstance(message, list):
            replies = [reply for reply in (self._handle(request, m) for m in message) if reply is not None]
            return Response(replies) if replies else Response(status=202)
        reply = self._handle(request, message)
        return Response(reply) if reply is not None else Response(status=202)

    def _handle(self, request, message):
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _rpc_error(None, -32600, "Invalid request.")
        if "method" not in message:
            return None  # a response to a server request - this server never sends any
        if "id" not in message:
            return None  # a notification - nothing to answer
        try:
            result = self._dispatch(request, message["method"], message.get("params") or {})
        except _RpcError as error:
            return _rpc_error(message["id"], error.code, error.message)
        return {"jsonrpc": "2.0", "id": message["id"], "result": result}

    def _dispatch(self, request, method: str, params: dict):
        if method == "initialize":
            requested = params.get("protocolVersion")
            return {
                "protocolVersion": requested if requested in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": getattr(settings, "MCP_SERVER_NAME", "platform-core"),
                    "version": getattr(settings, "MCP_SERVER_VERSION", "0.1.0"),
                },
                "instructions": getattr(
                    settings,
                    "MCP_INSTRUCTIONS",
                    "Each resource has <resource>_schema/_list/_get/_create/_update/_delete tools "
                    "(plus _link/_unlink for many-to-many relations). Call _schema first to see a "
                    "resource's fields and relations.",
                ),
            }
        if method == "ping":
            return {}
        if method == "tools/list":
            tools = []
            for key, path in _resources().items():
                status, schema = _call_api(request, "GET", f"{path}/schema")
                if status == 200:
                    tools += _tools_for(key, schema)
            return {"tools": tools}
        if method == "tools/call":
            name = params.get("name", "")
            try:
                status, data = _call_tool(request, name, params.get("arguments") or {})
            except KeyError:
                raise _RpcError(-32602, f"Unknown tool: {name}") from None
            except Exception:
                # A bug behind one tool call (the API raised instead of
                # answering) is that call's error, not the whole MCP
                # request's - the client sees a tool error it can report.
                logger.exception("MCP tool %s failed", name)
                status, data = 500, {"code": "server_error", "message": "The server failed to handle this call."}
            return _tool_result(status, data)
        raise _RpcError(-32601, f"Method not found: {method}")


def _rpc_error(message_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}
