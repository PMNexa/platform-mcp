"""The MCP endpoint, the token-management API behind the frontend's
"MCP access" screen, and the public agent-skills files (skills.py).

Token management is session-only on purpose: its views use the host's
own `DEFAULT_AUTHENTICATION_CLASSES` (a platform-auth login), never a
PAT - a leaked token can't mint more tokens or hide its tracks by
revoking others.
"""

from pathlib import Path

from django.http import Http404, HttpResponse
from django.views import View
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core_api.errors import NotFoundError, PermissionDeniedError

from platform_mcp.authentication import PersonalAccessTokenAuthentication
from platform_mcp.models import PersonalAccessToken
from platform_mcp.serializers import (
    CreatePersonalAccessTokenSerializer,
    PersonalAccessTokenSerializer,
)
from platform_mcp.server import McpServerView
from platform_mcp.skills import context, discover, render, skill_file


class McpView(McpServerView):
    """`POST` = one MCP JSON-RPC message or batch (see server.py).
    Accepts a PAT first, then whatever the host authenticates with."""

    permission_classes = [IsAuthenticated]

    def get_authenticators(self):
        return [PersonalAccessTokenAuthentication(), *super().get_authenticators()]


class _SessionOnlyView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if isinstance(request.auth, PersonalAccessToken):
            raise PermissionDeniedError()

    def tokens(self, request):
        return PersonalAccessToken.objects.filter(user_id=str(request.user.id))


class TokenListView(_SessionOnlyView):
    def get(self, request):
        return Response({"items": PersonalAccessTokenSerializer(self.tokens(request), many=True).data})

    def post(self, request):
        serializer = CreatePersonalAccessTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row, token = PersonalAccessToken.issue(
            user_id=request.user.id,
            name=serializer.validated_data["name"],
            expires_at=serializer.expires_at(),
        )
        # The plaintext token, this once - only its hash is stored.
        return Response({**PersonalAccessTokenSerializer(row).data, "token": token}, status=201)


class TokenDetailView(_SessionOnlyView):
    def delete(self, request, pk):
        deleted, _ = self.tokens(request).filter(pk=pk).delete()
        if not deleted:
            raise NotFoundError()
        return Response(status=204)


def _markdown(text: str) -> HttpResponse:
    return HttpResponse(text, content_type="text/markdown; charset=utf-8")


class SkillsIndexView(View):
    """The install prompt: `skills_index.md` rendered with this instance's
    URLs and the discovered skills' list. Public - it's instructions, no
    data; an agent fetches it before it has any token."""

    def get(self, request):
        values = context(request)
        skills = discover().values()
        listing = "\n".join(
            f"- **{skill.name}**: {render(skill.description, values)}\n"
            + "\n".join(f"  - `{values['skills_url']}/{skill.name}/{file}`" for file in skill.files)
            for skill in skills
        ) or "(This instance ships no skills.)"
        template = (Path(__file__).parent / "skills_index.md").read_text()
        return _markdown(render(template, {**values, "skill_list": listing, "skill_names": ", ".join(s.name for s in skills)}))


class SkillFileView(View):
    def get(self, request, name, file):
        target = skill_file(name, file)
        if target is None:
            raise Http404
        return _markdown(render(target.read_text(), context(request)))
