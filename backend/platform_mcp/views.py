"""The MCP endpoint, the token-management API behind the frontend's
"MCP access" screen (PATs, and OAuth consent + connected apps - see
oauth.py), and the public agent-skills files (skills.py).

Token management is session-only on purpose: its views use the host's
own `DEFAULT_AUTHENTICATION_CLASSES` (a platform-auth login), never a
PAT - a leaked token can't mint more tokens or hide its tracks by
revoking others.
"""

from pathlib import Path

from django.http import Http404, HttpResponse
from django.utils import timezone
from django.views import View
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core_api.errors import NotFoundError, PermissionDeniedError

from platform_mcp.authentication import OAuthAccessTokenAuthentication, PersonalAccessTokenAuthentication
from platform_mcp.models import OAuthAccessToken, OAuthAuthorizationCode, OAuthGrant, PersonalAccessToken, hash_token, random_secret
from platform_mcp.oauth import (
    CODE_TTL,
    _AuthorizeError,
    _authorize_error_response,
    _with_query,
    urls,
    validate_authorization_request,
    www_authenticate,
)
from platform_mcp.serializers import (
    CreatePersonalAccessTokenSerializer,
    OAuthGrantSerializer,
    PersonalAccessTokenSerializer,
)
from platform_mcp.server import McpServerView
from platform_mcp.skills import context, discover, render, skill_file


class McpView(McpServerView):
    """`POST` = one MCP JSON-RPC message or batch (see server.py).
    Accepts an OAuth access token or a PAT, then whatever the host
    authenticates with. Every 401 carries the OAuth discovery header, so
    a client that can do OAuth (Claude's connectors) knows where to go."""

    permission_classes = [IsAuthenticated]

    def get_authenticators(self):
        return [OAuthAccessTokenAuthentication(), PersonalAccessTokenAuthentication(), *super().get_authenticators()]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if response.status_code == 401:
            sent_token = request.headers.get("Authorization", "").startswith("Bearer ")
            response["WWW-Authenticate"] = www_authenticate(request, error="invalid_token" if sent_token else None)
        return response


class _SessionOnlyView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if isinstance(request.auth, (PersonalAccessToken, OAuthAccessToken)):
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


class AuthorizeView(_SessionOnlyView):
    """The consent page's backend (the page itself is platform-mcp-
    frontend's): `GET` with the authorization request's query checks it
    and says who is asking; `POST` the same parameters plus `approve`
    returns `{redirect_to}` - the client's redirect URI with a code, or
    with `error=access_denied` - for the page to follow."""

    def get(self, request):
        try:
            client, checked = validate_authorization_request(request, request.query_params)
        except _AuthorizeError as exc:
            return _authorize_error_response(exc)
        return Response(
            {
                "client_name": client.name,
                "redirect_uri": checked["redirect_uri"],
                "server_name": urls(request)["server_name"],
            }
        )

    def post(self, request):
        params = request.data if isinstance(request.data, dict) else {}
        try:
            client, checked = validate_authorization_request(request, params)
        except _AuthorizeError as exc:
            return _authorize_error_response(exc)
        base = {"state": checked["state"], "iss": urls(request)["issuer"]}
        if params.get("approve") is not True:
            return Response({"redirect_to": _with_query(checked["redirect_uri"], {"error": "access_denied", **base})})
        code = random_secret(length=48)
        OAuthAuthorizationCode.objects.filter(expires_at__lte=timezone.now()).delete()
        OAuthAuthorizationCode.objects.create(
            code_hash=hash_token(code),
            client=client,
            user_id=str(request.user.id),
            redirect_uri=checked["redirect_uri"],
            code_challenge=checked["code_challenge"],
            scope=checked["scope"],
            resource=checked["resource"],
            expires_at=timezone.now() + CODE_TTL,
        )
        return Response({"redirect_to": _with_query(checked["redirect_uri"], {"code": code, **base})})


class GrantListView(_SessionOnlyView):
    """The caller's connected apps (OAuth grants)."""

    def get(self, request):
        grants = OAuthGrant.objects.filter(user_id=str(request.user.id)).select_related("client")
        return Response({"items": OAuthGrantSerializer(grants, many=True).data})


class GrantDetailView(_SessionOnlyView):
    """Disconnect: the app's tokens stop working at once."""

    def delete(self, request, pk):
        deleted, _ = OAuthGrant.objects.filter(user_id=str(request.user.id), pk=pk).delete()
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
