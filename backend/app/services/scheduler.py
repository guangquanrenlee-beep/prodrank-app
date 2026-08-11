"""Redis-backed daily scheduler for auto rank tracking and citation scans."""
import json, time, os
from app.services.task_queue import TaskQueue

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
DAILY_FILE = os.path.join(DATA_DIR, "daily_jobs.json")

async def run_pending():
    """Called periodically by the in-app worker. Processes task queue and daily jobs."""
    queue = TaskQueue()
    await queue.process_pending()

    # Check if daily jobs need to run (once per day per keyword)
    daily_file = DAILY_FILE
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
    # The collect task is considered "done for today" ONLY if it completed
    # today (completed_at, falling back to file mtime for legacy tasks).
    # Previously any historical done task in TASK_DIR suppressed collection
    # forever — tasks linger up to 7 days, so the first successful run
    # blocked every later day. Tasks pending/running are left alone
    # (inflight guard) so a slow collect is never double-enqueued.
    from app.services.task_queue import TASK_DIR
    collect_done_today = False
    collect_inflight = False
    for fn in os.listdir(TASK_DIR):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(TASK_DIR, fn)
        try:
            with open(path) as f:
                t = json.load(f)
        except Exception:
            continue
        if t.get("type") != "collect_questions":
            continue
        if t.get("status") in ("pending", "running"):
            collect_inflight = True
        elif t.get("status") == "done" and t.get("result"):
            completed = t.get("completed_at") or os.path.getmtime(path)
            if time.strftime("%Y-%m-%d", time.localtime(completed)) == today:
                collect_done_today = True
    if collect_done_today:
        jobs["last_collect"] = today
    elif not collect_inflight:
        # Not collected today and no task in flight — (re)enqueue. This also
        # recovers the case where last_collect was wrongly marked by a
        # historical task: it now just gets re-run.
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

    # Daily AI Shopping Trend snapshot (attribute frequencies accumulate
    # into 30-day trend series)
    if jobs.get("last_trend") != today:
        jobs["last_trend"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("trend_snapshot", {})

    # Daily AI Insights (one cheap summary per store)
    if jobs.get("last_insights") != today:
        jobs["last_insights"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("daily_insights", {})

    # Weekly Trend Alerts (Monday only — what shoppers newly care about)
    weekday = time.strftime("%A")
    if weekday == "Monday" and jobs.get("last_trend_alerts") != today:
        jobs["last_trend_alerts"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("trend_alerts", {})

    # Weekly Opportunity Report (Monday only)
    weekday = time.strftime("%A")
    if weekday == "Monday" and jobs.get("last_weekly") != today:
        jobs["last_weekly"] = today
        with open(daily_file, "w") as f: json.dump(jobs, f)
        queue.enqueue("weekly_report", {})

def add_daily_keyword(brand: str, keyword: str):
    """Register a keyword for daily auto-tracking."""
    daily_file = DAILY_FILE
    os.makedirs(os.path.dirname(daily_file), exist_ok=True)
    try:
        with open(daily_file) as f: jobs = json.load(f)
    except: jobs = {"last_run": "", "tracked_keywords": []}
    if not any(k.get("keyword") == keyword for k in jobs["tracked_keywords"]):
        jobs["tracked_keywords"].append({"brand": brand, "keyword": keyword})
        with open(daily_file, "w") as f: json.dump(jobs, f)
