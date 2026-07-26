"""Async task API — submit jobs, check status, get results."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.task_queue import TaskQueue

router = APIRouter()
queue = TaskQueue()

class EnqueueRequest(BaseModel):
    type: str  # "rank_check", "site_audit"
    params: dict = {}

@router.post("/enqueue")
async def enqueue_task(req: EnqueueRequest):
    tid = queue.enqueue(req.type, req.params)
    return {"task_id": tid, "status": "queued", "check": f"/api/tasks/{tid}"}

@router.get("/{tid}")
async def get_task(tid: str):
    t = queue.get(tid)
    if not t: raise HTTPException(404, "Task not found")
    return t
