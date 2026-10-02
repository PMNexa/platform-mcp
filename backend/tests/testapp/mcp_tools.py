"""Custom MCP tools for the tests - see platform_mcp.server.custom_tools."""

_ID = {"type": ["string", "integer"]}

TOOLS = [
    {
        "name": "shelves_summary",
        "description": "Summarize a shelf.",
        "inputSchema": {"type": "object", "properties": {"id": _ID, "days": {"type": "integer"}}, "required": ["id"]},
        "annotations": {"readOnlyHint": True},
        "method": "GET",
        "path": "/shelves/{id}/summary",
    },
    {
        "name": "shelves_summary_set",
        "description": "Replace a shelf's summary.",
        "inputSchema": {"type": "object", "properties": {"id": _ID, "dry_run": {"type": "boolean"}, "note": {"type": "string"}}},
        "method": "PUT",
        "path": "/shelves/{id}/summary",
        "query": ["dry_run"],
    },
]
