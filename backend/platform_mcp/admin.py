from django.contrib import admin

from platform_mcp.models import PersonalAccessToken


@admin.register(PersonalAccessToken)
class PersonalAccessTokenAdmin(admin.ModelAdmin):
    list_display = ["name", "prefix", "user_id", "created_at", "last_used_at", "expires_at"]
    readonly_fields = ["prefix", "token_hash", "user_id", "created_at", "last_used_at"]
    search_fields = ["name", "prefix", "user_id"]
