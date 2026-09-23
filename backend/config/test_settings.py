"""Settings for `python manage.py test --settings=config.test_settings` -
the base settings plus a test-only app (`tests.testapp`: BaseViewSet
resources to expose, and an `X-As` header login standing in for the
host's), on an in-memory sqlite db.
"""

from config.settings import *

INSTALLED_APPS = [*INSTALLED_APPS, "tests.testapp"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
ROOT_URLCONF = "tests.testapp.urls"
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_AUTHENTICATION_CLASSES": ["tests.testapp.authentication.HeaderAuthentication"],
}
