"""Agent skills, served by the instance itself so one prompt installs
them into an AI client - "Install the <name> skills from
<host>/api/v1/mcp/skills".

A skill is a directory `mcp_skills/<skill-name>/` inside ANY installed
Django app, holding a `SKILL.md` (Agent Skills format: YAML front
matter with `name` + `description`, then instructions) and optionally
more files it references. Nothing to register: an app that ships skills
just has the directory, like `templates/`. platform-mcp owns the
mechanism; the domain module owns the content (e.g. goalnexa's
check-in/review/planning skills).

Every served file is rendered with this instance's own values, so a
skill can say "the MCP server at {{mcp_url}}" and mean this one:
`{{app_url}}`, `{{mcp_url}}`, `{{skills_url}}`, `{{tokens_url}}`,
`{{server_name}}`.

The index (`skills_index.md` in this package, rendered the same way)
IS the install prompt: step-by-step instructions an agent follows to
check the MCP connection, then download and save each skill where its
client looks for skills.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.urls import reverse

SKILLS_DIR_NAME = "mcp_skills"
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)


@dataclass
class Skill:
    name: str
    description: str
    path: Path
    files: list[str]


def _front_matter(text: str) -> dict[str, str]:
    match = _FRONT_MATTER_RE.match(text)
    if not match:
        return {}
    values = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith((" ", "\t")):
            values[key.strip()] = value.strip().strip("\"'")
    return values


def discover() -> dict[str, Skill]:
    """Every `mcp_skills/<name>/SKILL.md` across installed apps, by name
    (a later app doesn't override an earlier one's skill of the same
    name - first wins, in INSTALLED_APPS order)."""
    skills: dict[str, Skill] = {}
    for app in apps.get_app_configs():
        root = Path(app.path) / SKILLS_DIR_NAME
        if not root.is_dir():
            continue
        for directory in sorted(root.iterdir()):
            skill_md = directory / "SKILL.md"
            if not (_NAME_RE.match(directory.name) and skill_md.is_file()) or directory.name in skills:
                continue
            meta = _front_matter(skill_md.read_text())
            files = sorted(
                str(file.relative_to(directory))
                for file in directory.rglob("*")
                if file.is_file() and not file.name.startswith(".")
            )
            skills[directory.name] = Skill(directory.name, meta.get("description", ""), directory, files)
    return skills


def skill_file(name: str, relative: str) -> Path | None:
    """A file inside a discovered skill, or None - never anything outside
    the skill's own directory."""
    skill = discover().get(name)
    if skill is None:
        return None
    base = skill.path.resolve()
    target = (base / relative).resolve()
    if not target.is_relative_to(base) or not target.is_file():
        return None
    return target


def context(request) -> dict[str, str]:
    """Absolute URLs as the client sees this instance: `MCP_PUBLIC_URL`
    (e.g. `https://goals.example.com`, for a deployment behind a proxy
    that rewrites Host/scheme), else the request's own origin. Paths come
    from the urlconf, so they follow wherever the host mounted
    `platform_mcp.urls`."""
    app_url = (getattr(settings, "MCP_PUBLIC_URL", "") or request.build_absolute_uri("/")).rstrip("/")
    return {
        "app_url": app_url,
        "mcp_url": app_url + reverse("platform_mcp:server"),
        "skills_url": app_url + reverse("platform_mcp:skills"),
        # The host app's frontend page for tokens (platform-mcp-frontend's
        # createMcpRoutes mount).
        "tokens_url": app_url + getattr(settings, "MCP_TOKENS_PAGE", "/mcp"),
        "server_name": getattr(settings, "MCP_SERVER_NAME", "platform-core"),
    }


def render(text: str, values: dict[str, str]) -> str:
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: values.get(m.group(1), m.group(0)), text)
