from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from platform_mcp.models import OAuthGrant, PersonalAccessToken


class PersonalAccessTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonalAccessToken
        fields = ["id", "name", "prefix", "created_at", "last_used_at", "expires_at"]
        read_only_fields = fields


class CreatePersonalAccessTokenSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    # Omitted or null = never expires.
    expires_in_days = serializers.IntegerField(min_value=1, max_value=3650, required=False, allow_null=True)

    def expires_at(self):
        days = self.validated_data.get("expires_in_days")
        return timezone.now() + timedelta(days=days) if days else None


class OAuthGrantSerializer(serializers.ModelSerializer):
    """A connected app, as the "MCP access" page lists it."""

    client_name = serializers.CharField(source="client.name")

    class Meta:
        model = OAuthGrant
        fields = ["id", "client_name", "created_at", "last_used_at"]
        read_only_fields = fields
