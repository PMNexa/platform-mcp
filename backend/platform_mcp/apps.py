from django.apps import AppConfig


class PlatformMcpConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "platform_mcp"

    def ready(self):
        from platform_mcp import openapi  # noqa: F401 - registers its OpenAPI auth scheme(s)

        from core_api.system import register_export_provider, register_session_provider, user_removed
        from platform_mcp.accounts import PROVIDERS, export, on_user_removed

        for provider in PROVIDERS:
            register_session_provider(provider)
        user_removed.connect(on_user_removed, dispatch_uid="platform_mcp.user_removed")
        register_export_provider("ai_access", export)
        _register_insights()


def _register_insights() -> None:
    """System > Insights: tool calls per day, and who has an assistant connected."""
    from datetime import datetime, timedelta
    from datetime import timezone as dt_timezone

    from core_api.system import InsightSeries, counted, register_insight_series
    from platform_mcp.models import OAuthGrant, PersonalAccessToken

    def connected(day):
        end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=dt_timezone.utc)
        users = set(PersonalAccessToken.objects.filter(created_at__lt=end).values_list("user_id", flat=True))
        users |= set(OAuthGrant.objects.filter(created_at__lt=end).values_list("user_id", flat=True))
        return len(users)

    register_insight_series(InsightSeries(
        "mcp_calls", "MCP tool calls", "AI assistants", lambda day: counted("mcp.tool", day)[0], kind="daily",
    ))
    register_insight_series(InsightSeries(
        "mcp_connected", "Users with an assistant connected", "AI assistants", connected,
        help="A personal access token or an OAuth connection that still exists.",
    ))
