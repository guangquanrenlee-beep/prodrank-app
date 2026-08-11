"""Regression tests for the admin data summary fetch.

History (2026-08): /api/admin/data/summary used .limit(50000), which
PostgREST silently caps at its db-max-rows (1000 on Supabase). The page
always reported exactly "1000" questions no matter how big the library
really was — the number stopped growing. The fix walks pages with Range
headers and uses an exact count; these tests pin that behavior.
"""

from types import SimpleNamespace

from app.api import admin_api


class _FakeResponse:
    def __init__(self, rows, count):
        self.data = rows
        self.count = count


class _FakeQuery:
    def __init__(self, all_rows, count):
        self.all_rows = all_rows
        self.count = count
        self._range = (0, 0)

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        start, end = self._range
        chunk = self.all_rows[start:end + 1]
        return _FakeResponse(chunk, self.count)


class _FakeTable:
    def __init__(self, all_rows):
        self.all_rows = all_rows

    def select(self, cols, count=None):
        # First call carries count="exact" (the total); later pages don't.
        return _FakeQuery(self.all_rows, len(self.all_rows) if count == "exact" else None)


class _FakeClient:
    def __init__(self, all_rows):
        self.table = lambda name: _FakeTable(all_rows)


class _FakeDb:
    """Mimics app.services.db.DB — the fetch helper accesses db.client."""
    def __init__(self, all_rows):
        self.client = _FakeClient(all_rows)


def _rows(n, prefix="q"):
    return [{"category": "fashion:Size", "added_at": "2026-08-08T00:00:00"} for _ in range(n)]


def test_fetch_all_returns_every_row_when_larger_than_page():
    """2500 rows > 1000-row page: all rows must come back, total exact."""
    n = 2500
    rows, total = admin_api._fetch_all_rows(_FakeDb(_rows(n)), "questions", "category,added_at")
    assert total == n
    assert len(rows) == n


def test_fetch_all_small_table_single_request():
    n = 7
    rows, total = admin_api._fetch_all_rows(_FakeDb(_rows(n)), "questions", "category,added_at")
    assert total == n
    assert len(rows) == n


def test_fetch_all_exact_multiple_of_page_size():
    n = 2000  # exactly 2 pages of 1000
    rows, total = admin_api._fetch_all_rows(_FakeDb(_rows(n)), "questions", "category,added_at")
    assert total == n
    assert len(rows) == n


def test_fetch_all_empty_table():
    rows, total = admin_api._fetch_all_rows(_FakeDb([]), "questions", "category,added_at")
    assert total == 0
    assert rows == []
