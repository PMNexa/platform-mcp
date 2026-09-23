from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from platform_mcp.models import PersonalAccessToken


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
