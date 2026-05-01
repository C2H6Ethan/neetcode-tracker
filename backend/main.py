from __future__ import annotations
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from problems import NEETCODE_150, TOPIC_ORDER

DATA_PATH = Path(os.environ.get("DATA_PATH", "/data/data.json"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static"))
TARGET_DATE = date(2026, 7, 15)
REVIEW_INTERVALS = [1, 3, 7]  # days

_lock = Lock()


def default_state() -> dict:
    problems = []
    for idx, (topic, name, diff) in enumerate(NEETCODE_150):
        problems.append({
            "id": idx,
            "topic": topic,
            "name": name,
            "difficulty": diff,
            "done": False,
            "shaky": False,
            "completed_date": None,      # ISO date of first completion
            "shaky_set_date": None,      # ISO date when last marked shaky / last reviewed
            "review_count": 0,           # number of spaced reviews completed
            "notes": "",
        })
    return {
        "daily_goal": 3,
        "problems": problems,
        "completions_log": {},  # iso_date -> count of problems completed/reviewed that day
    }


def load() -> dict:
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        s = default_state()
        save(s)
        return s
    with DATA_PATH.open() as f:
        return json.load(f)


def save(state: dict) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_PATH.with_suffix(".json.tmp")
    with tmp.open("w") as f:
        json.dump(state, f, indent=2)
    tmp.replace(DATA_PATH)


def today_iso() -> str:
    return date.today().isoformat()


def bump_today(state: dict) -> None:
    t = today_iso()
    state["completions_log"][t] = state["completions_log"].get(t, 0) + 1


def review_due_date(p: dict) -> Optional[date]:
    if not p["shaky"] or not p["shaky_set_date"]:
        return None
    interval = REVIEW_INTERVALS[min(p["review_count"], len(REVIEW_INTERVALS) - 1)]
    return date.fromisoformat(p["shaky_set_date"]) + timedelta(days=interval)


def is_due(p: dict, today: date) -> bool:
    d = review_due_date(p)
    return d is not None and d <= today


def compute_streak(log: dict, goal: int) -> int:
    streak = 0
    d = date.today()
    while True:
        iso = d.isoformat()
        if log.get(iso, 0) >= goal:
            streak += 1
            d -= timedelta(days=1)
        else:
            # don't break streak for today if today not yet hit goal — start from yesterday
            if d == date.today():
                d -= timedelta(days=1)
                continue
            break
    return streak


def compute_pace(log: dict, days: int = 7) -> float:
    today = date.today()
    total = 0
    for i in range(days):
        d = (today - timedelta(days=i)).isoformat()
        total += log.get(d, 0)
    return total / days if days else 0.0


def projected_finish(state: dict) -> Optional[str]:
    remaining = sum(1 for p in state["problems"] if not p["done"])
    if remaining == 0:
        return None
    pace = compute_pace(state["completions_log"], 7)
    if pace <= 0:
        pace = state["daily_goal"]  # optimistic fallback
    days = remaining / pace
    return (date.today() + timedelta(days=int(round(days)))).isoformat()


def required_pace(state: dict) -> float:
    remaining = sum(1 for p in state["problems"] if not p["done"])
    days_left = (TARGET_DATE - date.today()).days
    if days_left <= 0:
        return float("inf") if remaining else 0.0
    return remaining / days_left


def todays_problems(state: dict) -> list[dict]:
    """Pick today's problems: prioritize due reviews (shaky), fill rest with next unsolved roadmap order.
    Cap reviews to goal-1 so at least one new problem is included unless nothing new remains."""
    today = date.today()
    goal = state["daily_goal"]
    due_reviews = [p for p in state["problems"] if is_due(p, today)]
    unsolved = [p for p in state["problems"] if not p["done"]]
    max_reviews = max(0, goal - 1) if unsolved else goal
    picked_reviews = due_reviews[:max_reviews]
    review_ids = {p["id"] for p in picked_reviews}
    new_picks = [p for p in unsolved if p["id"] not in review_ids][:goal - len(picked_reviews)]
    return [{**p, "kind": "review"} for p in picked_reviews] + [{**p, "kind": "new"} for p in new_picks]


def sunday_review(state: dict) -> list[dict]:
    return [p for p in state["problems"] if p["shaky"]]


def topic_summary(state: dict) -> list[dict]:
    out = []
    for topic in TOPIC_ORDER:
        ps = [p for p in state["problems"] if p["topic"] == topic]
        done = sum(1 for p in ps if p["done"])
        shaky = sum(1 for p in ps if p["shaky"])
        out.append({"topic": topic, "total": len(ps), "done": done, "shaky": shaky})
    return out


# ---- API ----
app = FastAPI(title="NeetCode Tracker")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ProblemUpdate(BaseModel):
    done: Optional[bool] = None
    shaky: Optional[bool] = None
    notes: Optional[str] = None


class GoalUpdate(BaseModel):
    daily_goal: int


@app.get("/api/state")
def get_state():
    with _lock:
        s = load()
        return {
            "daily_goal": s["daily_goal"],
            "target_date": TARGET_DATE.isoformat(),
            "today": today_iso(),
            "is_sunday": date.today().weekday() == 6,
            "problems": s["problems"],
            "topic_order": TOPIC_ORDER,
            "topic_summary": topic_summary(s),
            "todays_problems": todays_problems(s),
            "sunday_review": sunday_review(s),
            "streak": compute_streak(s["completions_log"], s["daily_goal"]),
            "pace_7d": round(compute_pace(s["completions_log"], 7), 2),
            "required_pace": round(required_pace(s), 2),
            "projected_finish": projected_finish(s),
            "remaining": sum(1 for p in s["problems"] if not p["done"]),
            "total_done": sum(1 for p in s["problems"] if p["done"]),
        }


@app.patch("/api/problems/{pid}")
def patch_problem(pid: int, upd: ProblemUpdate):
    with _lock:
        s = load()
        if pid < 0 or pid >= len(s["problems"]):
            raise HTTPException(404)
        p = s["problems"][pid]
        today = today_iso()

        if upd.done is not None and upd.done != p["done"]:
            p["done"] = upd.done
            if upd.done:
                if not p["completed_date"]:
                    p["completed_date"] = today
                bump_today(s)
            else:
                p["completed_date"] = None

        if upd.shaky is not None:
            if upd.shaky and not p["shaky"]:
                p["shaky"] = True
                p["shaky_set_date"] = today
                p["review_count"] = 0
            elif not upd.shaky and p["shaky"]:
                p["shaky"] = False
                p["shaky_set_date"] = None
                p["review_count"] = 0

        if upd.notes is not None:
            p["notes"] = upd.notes

        save(s)
        return p


@app.post("/api/problems/{pid}/review")
def review_problem(pid: int):
    """Mark a shaky problem as reviewed today — advances spaced-rep interval."""
    with _lock:
        s = load()
        if pid < 0 or pid >= len(s["problems"]):
            raise HTTPException(404)
        p = s["problems"][pid]
        if not p["shaky"]:
            raise HTTPException(400, "not shaky")
        p["shaky_set_date"] = today_iso()
        p["review_count"] += 1
        if p["review_count"] >= len(REVIEW_INTERVALS):
            p["shaky"] = False
            p["shaky_set_date"] = None
            p["review_count"] = 0
        bump_today(s)
        save(s)
        return p


@app.put("/api/goal")
def set_goal(g: GoalUpdate):
    with _lock:
        s = load()
        s["daily_goal"] = max(1, min(20, g.daily_goal))
        save(s)
        return {"daily_goal": s["daily_goal"]}


@app.post("/api/reset")
def reset():
    with _lock:
        save(default_state())
        return {"ok": True}


# ---- Static frontend ----
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        idx = STATIC_DIR / "index.html"
        if idx.exists():
            return FileResponse(str(idx))
        raise HTTPException(404)
