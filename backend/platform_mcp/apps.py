from django.apps import AppConfig


class PlatformMcpConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "platform_mcp"

    def ready(self):
        from core_api.system import register_export_provider, register_session_provider, user_removed
        from platform_mcp.accounts import PROVIDERS, export, on_user_removed

        for provider in PROVIDERS:
            register_session_provider(provider)
        user_removed.connect(on_user_removed, dispatch_uid="platform_mcp.user_removed")
        register_export_provider("ai_access", export)
