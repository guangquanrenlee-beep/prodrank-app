"""Redis-backed daily scheduler for auto rank tracking and citation scans."""
import json, time, os
from app.services.task_queue import TaskQueue

def run_pending():
    """Called by cron every minute. Processes task queue and daily jobs."""
    queue = TaskQueue()
    queue.process_pending()

    # Check if daily jobs need to run (once per day per keyword)
    daily_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "daily_jobs.json")
    os.makedirs(os.path.dirname(daily_file), exist_ok=True)
    today = time.strftime("%Y-%m-%d")
    try:
        with open(daily_file) as f: jobs = json.load(f)
    except: jobs = {"last_run": "", "tracked_keywords": []}

    if jobs.get("last_run") != today and jobs.get("tracked_keywords"):
        jobs["last_run"] = today
        for kw in jobs["tracked_keywords"]:
            queue.enqueue("rank_check", {"product_name": kw.get("brand",""), "keyword": kw.get("keyword",""), "brand": kw.get("brand","")})
        with open(daily_file, "w") as f: json.dump(jobs, f)

def add_daily_keyword(brand: str, keyword: str):
    """Register a keyword for daily auto-tracking."""
    daily_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "daily_jobs.json")
    os.makedirs(os.path.dirname(daily_file), exist_ok=True)
    try:
        with open(daily_file) as f: jobs = json.load(f)
    except: jobs = {"last_run": "", "tracked_keywords": []}
    if not any(k.get("keyword") == keyword for k in jobs["tracked_keywords"]):
        jobs["tracked_keywords"].append({"brand": brand, "keyword": keyword})
        with open(daily_file, "w") as f: json.dump(jobs, f)
