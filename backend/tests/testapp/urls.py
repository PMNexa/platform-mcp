from core_api.registry import register_model_endpoint
from django.urls import include, path
from rest_framework.routers import SimpleRouter

from tests.testapp.models import Book, Club, Shelf, Tag
from tests.testapp.views import BookViewSet, ClubViewSet, ShelfViewSet, TagViewSet

router = SimpleRouter(trailing_slash=False)
router.register("shelves", ShelfViewSet, basename="shelves")
router.register("tags", TagViewSet, basename="tags")
router.register("books", BookViewSet, basename="books")
router.register("clubs", ClubViewSet, basename="clubs")
for model, endpoint in ((Shelf, "/shelves"), (Tag, "/tags"), (Book, "/books"), (Club, "/clubs")):
    register_model_endpoint(model, endpoint)

urlpatterns = [
    *router.urls,
    path("", include("platform_mcp.urls")),
    path("", include("platform_mcp.wellknown_urls")),
]
