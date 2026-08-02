"""Async task queue — file-based, zero Redis dependency. Cron processes pending jobs every minute."""
import json, os, time, uuid
from dataclasses import dataclass, field

TASK_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "tasks")

@dataclass
class Task:
    id: str
    type: str  # "rank_check", "site_audit", "citation_scan"
    params: dict
    status: str = "pending"  # pending, running, done, failed
    result: dict | None = None
    created_at: float = field(default_factory=time.time)

class TaskQueue:
    def __init__(self): os.makedirs(TASK_DIR, exist_ok=True)

    def enqueue(self, task_type: str, params: dict) -> str:
        tid = str(uuid.uuid4())[:8]
        task = Task(id=tid, type=task_type, params=params)
        with open(f"{TASK_DIR}/{tid}.json", "w") as f:
            json.dump({"id": task.id, "type": task.type, "params": task.params, "status": task.status, "created_at": task.created_at}, f)
        return tid

    def get(self, tid: str) -> dict | None:
        path = f"{TASK_DIR}/{tid}.json"
        if os.path.exists(path):
            with open(path) as f: return json.load(f)
        return None

    def process_pending(self):
        """Called by cron every minute. Picks up pending tasks and runs them."""
        for fn in os.listdir(TASK_DIR):
            if not fn.endswith(".json"): continue
            path = f"{TASK_DIR}/{fn}"
            with open(path) as f: task = json.load(f)
            if task.get("status") != "pending": continue
            # Mark as running
            task["status"] = "running"
            with open(path, "w") as f: json.dump(task, f)
            # Execute
            result = self._execute(task)
            # Save result
            task["status"] = "done"
            task["result"] = result
            with open(path, "w") as f: json.dump(task, f)

    def _execute(self, task: dict) -> dict:
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            if task["type"] == "rank_check":
                from app.services.ai_query import AIQueryService
                ai = AIQueryService()
                report = loop.run_until_complete(ai.query_all(task["params"]["product_name"], task["params"]["keyword"], task["params"].get("brand","")))
                return {"best_rank": report.best_rank, "mentioned_by": report.mentioned_by, "not_mentioned_by": report.not_mentioned_by}
            elif task["type"] == "site_audit":
                from app.services.schema_detector import SchemaDetector
                d = SchemaDetector()
                r = loop.run_until_complete(d.audit_site(task["params"]["domain"]))
                return {"health_score": r.health_score, "total_pages": r.total_pages, "top_issues": r.top_issues}
            elif task["type"] == "collect_questions":
                # Daily real-question collection (circuit breaker + caps inside)
                import os
                from app.services.data_collector import DataCollector, CATEGORY_CONFIG
                collector = DataCollector()
                results = {}
                for cat in task["params"].get("categories", []):
                    try:
                        results[cat] = loop.run_until_complete(
                            collector.collect_category(cat, youtube_key=os.getenv("YOUTUBE_API_KEY", ""))
                        )
                    except Exception as e:
                        results[cat] = {"error": str(e)[:200]}
                return results
            elif task["type"] == "daily_health_check":
                from app.services.health_check import run_daily_health_check
                return loop.run_until_complete(run_daily_health_check())
            return {"error": "unknown task type"}
        except Exception as e:
            return {"error": str(e)}
        finally:
            loop.close()
