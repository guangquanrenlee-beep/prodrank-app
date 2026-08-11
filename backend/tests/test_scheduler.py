"""Regression tests for the daily question-collection scheduler.

History (2026-08): the collect scheduler treated ANY done collect_questions
task in TASK_DIR as "collected today". Task files linger up to 7 days
(housekeeping), so the first successful run blocked every later day —
08-07/08-08 collected zero rows while last_collect claimed completion, and
the Data Assets page stopped growing. These tests pin the fixed rules:

  - only a task COMPLETED TODAY counts as "collected today"
  - a pending/running task blocks re-enqueue (inflight guard)
  - a wrongly-marked last_collect must not suppress collection
  - legacy done tasks without completed_at fall back to file mtime
"""

import json
import os
import time

import pytest

from app.services import scheduler, task_queue


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def _write_task(path, status="done", completed_at=None, result=None,
                task_type="collect_questions", created_at=None):
    """Write a task file. Defaults: created yesterday, done with a result."""
    t = {
        "id": os.path.basename(path).replace(".json", ""),
        "type": task_type,
        "params": {"categories": ["fashion"]},
        "status": status,
        "created_at": created_at if created_at is not None else time.time() - 86400,
    }
    if completed_at is not None:
        t["completed_at"] = completed_at
    if result is not None:
        t["result"] = result
    with open(path, "w") as f:
        json.dump(t, f)


def _write_daily(path, **fields):
    base = {"last_run": "", "tracked_keywords": []}
    base.update(fields)
    with open(path, "w") as f:
        json.dump(base, f)


def _collect_tasks():
    """All collect_questions task files in the (patched) task dir."""
    out = []
    for fn in os.listdir(task_queue.TASK_DIR):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(task_queue.TASK_DIR, fn)) as f:
            t = json.load(f)
        if t.get("type") == "collect_questions":
            out.append(t)
    return out


async def _noop_process_pending(self):
    """Isolate the scheduler's decision logic — do not actually run tasks."""
    pass


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    """Point the scheduler at a scratch task dir + daily file, and never
    actually execute queued tasks (network/DB free)."""
    monkeypatch.setattr(task_queue, "TASK_DIR", str(tmp_path / "tasks"))
    monkeypatch.setattr(scheduler, "DAILY_FILE", str(tmp_path / "daily_jobs.json"))
    monkeypatch.setattr(task_queue.TaskQueue, "process_pending", _noop_process_pending)
    os.makedirs(task_queue.TASK_DIR, exist_ok=True)
    return tmp_path


@pytest.mark.asyncio
async def test_historical_done_task_reenqueues_collect(isolated):
    """A done task from a previous day must NOT suppress today's collection."""
    yesterday = time.time() - 86400
    _write_task(os.path.join(task_queue.TASK_DIR, "old1.json"),
                completed_at=yesterday, result={"fashion": {"saved": 10}})
    _write_daily(scheduler.DAILY_FILE, last_collect=_today())

    await scheduler.run_pending()

    tasks = _collect_tasks()
    assert len(tasks) == 2, f"expected a fresh collect task, got {tasks}"
    fresh = [t for t in tasks if t["id"] != "old1"]
    assert fresh, "no re-enqueued collect task"
    assert fresh[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_today_done_task_marks_collected_no_reenqueue(isolated):
    """A task completed TODAY is the only thing that marks the day collected."""
    _write_task(os.path.join(task_queue.TASK_DIR, "tod1.json"),
                completed_at=time.time(), result={"fashion": {"saved": 10}})
    _write_daily(scheduler.DAILY_FILE, last_collect="2000-01-01")

    await scheduler.run_pending()

    assert len(_collect_tasks()) == 1, "completed-today task must not re-enqueue"
    with open(scheduler.DAILY_FILE) as f:
        jobs = json.load(f)
    assert jobs.get("last_collect") == _today()


@pytest.mark.asyncio
async def test_inflight_running_task_blocks_reenqueue(isolated):
    """A pending/running collect task must not be double-enqueued."""
    _write_task(os.path.join(task_queue.TASK_DIR, "run1.json"),
                status="running", created_at=time.time())
    _write_daily(scheduler.DAILY_FILE, last_collect="2000-01-01")

    await scheduler.run_pending()

    assert len(_collect_tasks()) == 1, "inflight task must block re-enqueue"


@pytest.mark.asyncio
async def test_legacy_done_task_without_completed_at_uses_mtime(isolated):
    """Old task files (no completed_at) fall back to file mtime — a stale
    file from yesterday must not block today's collection."""
    path = os.path.join(task_queue.TASK_DIR, "leg1.json")
    _write_task(path, result={"fashion": {"saved": 10}})  # no completed_at
    old_mtime = time.time() - 86400
    os.utime(path, (old_mtime, old_mtime))
    _write_daily(scheduler.DAILY_FILE, last_collect="2000-01-01")

    await scheduler.run_pending()

    assert len(_collect_tasks()) == 2, "legacy done task must not block"


@pytest.mark.asyncio
async def test_wrongly_marked_last_collect_still_reenqueues(isolated):
    """Production bug: last_collect was stamped 'today' by a historical
    task, yet nothing ran today. The stale stamp must not suppress
    collection — the decision is made from task files only."""
    yesterday = time.time() - 86400
    _write_task(os.path.join(task_queue.TASK_DIR, "old1.json"),
                completed_at=yesterday, result={"fashion": {"saved": 10}})
    _write_daily(scheduler.DAILY_FILE, last_collect=_today())  # wrongly marked

    await scheduler.run_pending()

    assert len(_collect_tasks()) == 2, "wrongly-marked last_collect must not suppress"


@pytest.mark.asyncio
async def test_empty_dir_reenqueues_collect(isolated):
    """No task files at all → collection must be enqueued."""
    _write_daily(scheduler.DAILY_FILE, last_collect="2000-01-01")

    await scheduler.run_pending()

    tasks = _collect_tasks()
    assert len(tasks) == 1
    assert tasks[0]["status"] == "pending"
    assert tasks[0]["params"].get("categories"), "must enqueue with category list"
