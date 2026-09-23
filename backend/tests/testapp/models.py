"""Test-only models (same as platform-core's): one of each relation shape
the MCP tools handle. `owner` scoping mirrors how real modules scope their querysets
(e.g. goalnexa's `owner_id`), so linking across owners can be tested.
"""

from django.db import models


class Shelf(models.Model):
    name = models.CharField(max_length=64)
    owner = models.CharField(max_length=32)


class Tag(models.Model):
    name = models.CharField(max_length=64)
    owner = models.CharField(max_length=32)


class Book(models.Model):
    title = models.CharField(max_length=64)
    blurb = models.TextField(blank=True, default="")
    ref = models.UUIDField(null=True, blank=True)
    owner = models.CharField(max_length=32)
    # one_to_many seen from Shelf (`books`)
    shelf = models.ForeignKey(Shelf, null=True, on_delete=models.SET_NULL, related_name="books")
    # many_to_many, auto-created through
    tags = models.ManyToManyField(Tag, related_name="books", blank=True)


class Club(models.Model):
    name = models.CharField(max_length=64)
    owner = models.CharField(max_length=32)
    # many_to_many with a custom through carrying `role`
    books = models.ManyToManyField(Book, through="ClubBook", related_name="clubs", blank=True)


class ClubBook(models.Model):
    club = models.ForeignKey(Club, on_delete=models.CASCADE)
    book = models.ForeignKey(Book, on_delete=models.CASCADE)
    role = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)
