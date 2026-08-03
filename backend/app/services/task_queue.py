"""Async task queue — file-based, zero Redis dependency. The in-app worker
processes pending jobs every 30 minutes.

IMPORTANT: everything here is async. The worker runs inside the FastAPI
event loop; creating a new loop + run_until_complete from there crashes
("Cannot run the event loop while another loop is running") — which silently
killed every scheduled job (collection, health check, competitor watch,
citation watch, regression, weekly report) until this was fixed.
"""

import json
import os
import time
import uuid
from dataclasses import dataclass, field

TASK_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "tasks")


@dataclass
class Task:
    id: str
    type: str  # "rank_check", "site_audit", "collect_questions", ...
    params: dict
    status: str = "pending"  # pending, running, done, failed
    result: dict | None = None
    created_at: float = field(default_factory=time.time)


class TaskQueue:
    def __init__(self):
        os.makedirs(TASK_DIR, exist_ok=True)

    def enqueue(self, task_type: str, params: dict) -> str:
        tid = str(uuid.uuid4())[:8]
        task = Task(id=tid, type=task_type, params=params)
        with open(f"{TASK_DIR}/{tid}.json", "w") as f:
            json.dump({"id": task.id, "type": task.type, "params": task.params,
                       "status": task.status, "created_at": task.created_at}, f)
        return tid

    def get(self, tid: str) -> dict | None:
        path = f"{TASK_DIR}/{tid}.json"
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        return None

    async def process_pending(self):
        """Pick up pending tasks and run them (async — called from the worker)."""
        for fn in os.listdir(TASK_DIR):
            if not fn.endswith(".json"):
                continue
            path = f"{TASK_DIR}/{fn}"
            try:
                with open(path) as f:
                    task = json.load(f)
            except Exception:
                continue
            if task.get("status") != "pending":
                continue
            task["status"] = "running"
            with open(path, "w") as f:
                json.dump(task, f)
            result = await self._execute(task)
            task["status"] = "done"
            task["result"] = result
            with open(path, "w") as f:
                json.dump(task, f)

    async def _execute(self, task: dict) -> dict:
        try:
            if task["type"] == "rank_check":
                from app.services.ai_query import AIQueryService
                ai = AIQueryService()
                report = await ai.query_all(task["params"]["product_name"], task["params"]["keyword"], task["params"].get("brand", ""))
                return {"best_rank": report.best_rank, "mentioned_by": report.mentioned_by, "not_mentioned_by": report.not_mentioned_by}
            elif task["type"] == "site_audit":
                from app.services.schema_detector import SchemaDetector
                d = SchemaDetector()
                r = await d.audit_site(task["params"]["domain"])
                return {"health_score": r.health_score, "total_pages": r.total_pages, "top_issues": r.top_issues}
            elif task["type"] == "collect_questions":
                import os
                from app.services.data_collector import DataCollector, CATEGORY_CONFIG
                collector = DataCollector()
                results = {}
                for cat in task["params"].get("categories", []):
                    try:
                        results[cat] = await collector.collect_category(cat, youtube_key=os.getenv("YOUTUBE_API_KEY", ""))
                    except Exception as e:
                        results[cat] = {"error": str(e)[:200]}
                return results
            elif task["type"] == "daily_health_check":
                from app.services.health_check import run_daily_health_check
                return await run_daily_health_check()
            elif task["type"] == "competitor_watch":
                from app.services.competitor_watch import run_competitor_watch
                return await run_competitor_watch()
            elif task["type"] == "weekly_report":
                from app.services.weekly_report import run_weekly_reports
                return await run_weekly_reports()
            elif task["type"] == "citation_watch":
                from app.services.citation_watch import run_citation_watch
                return await run_citation_watch()
            elif task["type"] == "regression_monitor":
                from app.services.regression_monitor import run_regression_monitor
                return await run_regression_monitor()
            elif task["type"] == "daily_insights":
                from app.services.insights import run_daily_insights
                return await run_daily_insights()
            return {"error": "unknown task type"}
        except Exception as e:
            return {"error": str(e)}
