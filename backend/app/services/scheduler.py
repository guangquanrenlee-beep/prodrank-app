"""Redis-backed daily scheduler for auto rank tracking and citation scans."""
import json, time, os
from app.services.task_queue import TaskQueue

async def run_pending():
    """Called periodically by the in-app worker. Processes task queue and daily jobs."""
    queue = TaskQueue()
    await queue.process_pending()

    # Check if daily jobs need to run (once per day per keyword)
    daily_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "daily_jobs.json")
    os.makedirs(os.path.dirname(daily_file), exist_ok=True)
    today = time.strftime("%Y-%m-%d")
    try:
        with open(daily_file) as f: jobs = json.load(f)
    except: jobs = {"last_run": "", "tracked_keywords": [], "last_collect": ""}

    if jobs.get("last_run") != today and jobs.get("tracked_keywords"):
        jobs["last_run"] = today
        for kw in jobs["tracked_keywords"]:
            queue.enqueue("rank_check", {"product_name": kw.get("brand",""), "keyword": kw.get("keyword",""), "brand": kw.get("brand","")})
        with open(daily_file, "w") as f: json.dump(jobs, f)

    # Daily real-question collection (once per day, all categories)
    if jobs.get("last_collect") != today:
        jobs["last_collect"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        from app.services.data_collector import CATEGORY_CONFIG
        queue.enqueue("collect_questions", {"categories": list(CATEGORY_CONFIG.keys())})

    # Daily AI Health Check (once per day)
    if jobs.get("last_health") != today:
        jobs["last_health"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("daily_health_check", {})

    # Daily Competitor Watch (once per day)
    if jobs.get("last_competitors") != today:
        jobs["last_competitors"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("competitor_watch", {})

    # Daily Citation Watch (real-model queries — what sources AI cites)
    if jobs.get("last_citations") != today:
        jobs["last_citations"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("citation_watch", {})

    # Daily Recommendation Regression scan
    if jobs.get("last_regression") != today:
        jobs["last_regression"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("regression_monitor", {})

    # Weekly Opportunity Report (Monday only)
    weekday = time.strftime("%A")
    if weekday == "Monday" and jobs.get("last_weekly") != today:
        jobs["last_weekly"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("weekly_report", {})

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
