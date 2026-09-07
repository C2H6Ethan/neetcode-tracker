from __future__ import annotations
import json
import math
import os
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from anthropic import Anthropic

from problems import NEETCODE_150, TOPIC_ORDER

DATA_PATH = Path(os.environ.get("DATA_PATH", "/data/data.json"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static"))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
REVIEW_INTERVALS = [1, 3, 7]  # days

_lock = Lock()

def get_anthropic():
    """Lazy init Anthropic client."""
    if not ANTHROPIC_API_KEY:
        return None
    return Anthropic(api_key=ANTHROPIC_API_KEY)

# Behavioral interview question bank
BEHAVIORAL_QUESTIONS = {
    "Leadership": [
        "Tell me about a time you had to lead a team on a project with no clear direction.",
        "Describe a situation where you had to motivate a team member who was underperforming.",
        "Give an example of when you took ownership of a problem that wasn't originally your responsibility.",
        "Tell me about a time you delegated work to a team member and how you ensured its quality.",
        "Describe a project where you had to inspire a team to achieve a challenging goal.",
    ],
    "Teamwork": [
        "Tell me about a time you had to work with someone whose work style was very different from yours.",
        "Describe a situation where you had to ask for help from a colleague.",
        "Give an example of when you supported a team member to succeed.",
        "Tell me about a time you collaborated with someone outside your immediate team.",
        "Describe a project where you had to coordinate efforts across multiple teams.",
    ],
    "Conflict Resolution": [
        "Tell me about a time you disagreed with a colleague on how to approach a task.",
        "Describe a situation where you had to deliver bad news to a stakeholder.",
        "Give an example of when you had to stand up for something you believed in at work.",
        "Tell me about a time you mediated a conflict between two team members.",
        "Describe a situation where you had to change your approach based on someone's feedback.",
    ],
    "Problem Solving": [
        "Tell me about a complex problem you solved and walk me through your approach.",
        "Describe a time when you had to solve a problem with incomplete information.",
        "Give an example of when you identified a problem before it became critical.",
        "Tell me about a time you had to think outside the box to solve a problem.",
        "Describe a situation where your initial approach didn't work and how you pivoted.",
    ],
    "Adaptability": [
        "Tell me about a time you had to adapt to a major change in project requirements.",
        "Describe a situation where you had to learn a new skill quickly under pressure.",
        "Give an example of when you had to work with new technology for the first time.",
        "Tell me about a time plans changed and how you handled it.",
        "Describe a situation where you had to be flexible with your priorities.",
    ],
    "Communication": [
        "Tell me about a time you had to explain a complex concept to someone non-technical.",
        "Describe a situation where you had to communicate bad news to a team.",
        "Give an example of when you had to present an idea that wasn't well received initially.",
        "Tell me about a time you had to write documentation or a detailed report.",
        "Describe a situation where miscommunication caused a problem and how you resolved it.",
    ],
    "Time Management": [
        "Tell me about a time you had to juggle multiple priorities with competing deadlines.",
        "Describe a situation where you had to say no to a request.",
        "Give an example of when you successfully delivered a project on a tight timeline.",
        "Tell me about a time you had to reprioritize your work.",
        "Describe a situation where you improved your efficiency or productivity.",
    ],
    "Failure & Growth": [
        "Tell me about a time you failed and what you learned from it.",
        "Describe a situation where you made a mistake that impacted the team.",
        "Give an example of when you had to admit you were wrong.",
        "Tell me about a time you received critical feedback and how you handled it.",
        "Describe a mistake you made and how you prevented it from happening again.",
    ],
}


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
            "source": "neetcode",
        })
    return {
        "daily_goal": 3,
        "problems": problems,
        "completions_log": {},  # iso_date -> count of problems completed/reviewed that day
        "behavioral_history": [],  # list of past behavioral interview attempts
    }


def load() -> dict:
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        s = default_state()
        save(s)
        return s
    with DATA_PATH.open() as f:
        s = json.load(f)
    # Migrations: ensure new fields exist
    if "behavioral_history" not in s:
        s["behavioral_history"] = []
    for p in s["problems"]:
        p.setdefault("source", "neetcode")
    return s


def neetcode_problems(state: dict) -> list[dict]:
    return [p for p in state["problems"] if p.get("source", "neetcode") == "neetcode"]


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


def compute_pace(state: dict, days: int = 7) -> float:
    # Count distinct problems whose completed_date falls in the last `days`.
    # Source of truth is the problem itself, so undo/refinish can't desync it.
    today = date.today()
    cutoff = today - timedelta(days=days - 1)
    n = 0
    for p in neetcode_problems(state):
        cd = p.get("completed_date")
        if not cd:
            continue
        try:
            d = date.fromisoformat(cd)
        except ValueError:
            continue
        if cutoff <= d <= today:
            n += 1
    return n / days if days else 0.0


def projected_finish(state: dict) -> Optional[str]:
    remaining = sum(1 for p in neetcode_problems(state) if not p["done"])
    if remaining == 0:
        return None
    # Project assuming you keep hitting the daily goal going forward.
    pace = state["daily_goal"]
    if pace <= 0:
        return None
    days = math.ceil(remaining / pace)
    return (date.today() + timedelta(days=days)).isoformat()


def required_pace(state: dict) -> float:
    """Pace needed to hit the user's own daily goal."""
    return float(state["daily_goal"])


def todays_problems(state: dict) -> list[dict]:
    """Pick today's problems: sticky — problems completed today hold their slot so the list
    doesn't refill mid-session. Prioritize due reviews, fill rest with next unsolved."""
    today = date.today()
    today_str = today.isoformat()
    goal = state["daily_goal"]
    pool = neetcode_problems(state)
    due_reviews = [p for p in pool if is_due(p, today)]
    # unsolved problems OR problems already completed today (they keep their slot)
    sticky = [p for p in pool if not p["done"] or p["completed_date"] == today_str]
    unsolved = [p for p in sticky if not p["done"]]
    max_reviews = max(0, goal - 1) if unsolved else goal
    picked_reviews = due_reviews[:max_reviews]
    review_ids = {p["id"] for p in picked_reviews}
    # new picks: unsolved problems (not done) excluding reviews, or completed-today to keep mid-session
    new_picks = [p for p in sticky if p["id"] not in review_ids][:goal - len(picked_reviews)]
    return [{**p, "kind": "review"} for p in picked_reviews] + [{**p, "kind": "new"} for p in new_picks]


def extra_credit_problems(state: dict, today_ids: set, n: int = 5) -> list[dict]:
    """Next N unsolved problems beyond today's queue — for bonus work."""
    return [
        {**p, "kind": "new"}
        for p in neetcode_problems(state)
        if not p["done"] and p["id"] not in today_ids
    ][:n]


def sunday_review(state: dict) -> list[dict]:
    return [p for p in state["problems"] if p["shaky"]]


def topic_summary(state: dict) -> list[dict]:
    out = []
    pool = neetcode_problems(state)
    for topic in TOPIC_ORDER:
        ps = [p for p in pool if p["topic"] == topic]
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


class ProblemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


def find_problem(state: dict, pid: int) -> dict:
    p = next((p for p in state["problems"] if p["id"] == pid), None)
    if p is None:
        raise HTTPException(404)
    return p


class GoalUpdate(BaseModel):
    daily_goal: int


@app.get("/api/state")
def get_state():
    with _lock:
        s = load()
        today_probs = todays_problems(s)
        today_ids = {p["id"] for p in today_probs}
        return {
            "daily_goal": s["daily_goal"],
            "today": today_iso(),
            "is_sunday": date.today().weekday() == 6,
            "problems": s["problems"],
            "topic_order": TOPIC_ORDER,
            "topic_summary": topic_summary(s),
            "todays_problems": today_probs,
            "extra_credit": extra_credit_problems(s, today_ids),
            "today_done_count": s["completions_log"].get(today_iso(), 0),
            "sunday_review": sunday_review(s),
            "streak": compute_streak(s["completions_log"], s["daily_goal"]),
            "pace_7d": round(compute_pace(s, 7), 2),
            "required_pace": round(required_pace(s), 2),
            "projected_finish": projected_finish(s),
            "remaining": sum(1 for p in neetcode_problems(s) if not p["done"]),
            "total_done": sum(1 for p in neetcode_problems(s) if p["done"]),
        }


@app.patch("/api/problems/{pid}")
def patch_problem(pid: int, upd: ProblemUpdate):
    with _lock:
        s = load()
        p = find_problem(s, pid)
        today = today_iso()

        if upd.done is not None and upd.done != p["done"]:
            p["done"] = upd.done
            if upd.done:
                if not p["completed_date"]:
                    p["completed_date"] = today
                p["last_done_date"] = today
                bump_today(s)
            else:
                # Roll back the day this completion was logged against
                d = p.get("last_done_date")
                if d and s["completions_log"].get(d, 0) > 0:
                    s["completions_log"][d] -= 1
                p["completed_date"] = None
                p["last_done_date"] = None

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
        p = find_problem(s, pid)
        if not p["shaky"]:
            raise HTTPException(400, "not shaky")
        today = today_iso()
        p["shaky_set_date"] = today
        p["review_count"] += 1
        bump_today(s)
        if p["review_count"] >= len(REVIEW_INTERVALS):
            p["shaky"] = False
            p["shaky_set_date"] = None
            p["review_count"] = 0
        save(s)
        return p


@app.post("/api/problems")
def create_problem(body: ProblemCreate):
    with _lock:
        s = load()
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "name required")
        new_id = max((p["id"] for p in s["problems"]), default=-1) + 1
        p = {
            "id": new_id,
            "topic": "Custom",
            "name": name,
            "difficulty": body.difficulty,
            "done": False,
            "shaky": False,
            "completed_date": None,
            "shaky_set_date": None,
            "review_count": 0,
            "notes": "",
            "source": "custom",
        }
        s["problems"].append(p)
        save(s)
        return p


@app.delete("/api/problems/{pid}")
def delete_problem(pid: int):
    with _lock:
        s = load()
        p = find_problem(s, pid)
        if p.get("source") != "custom":
            raise HTTPException(400, "cannot delete a NeetCode 150 problem")
        s["problems"] = [q for q in s["problems"] if q["id"] != pid]
        save(s)
        return {"ok": True}


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


# ---- Behavioral Interview ----
@app.get("/api/behavioral/question")
def get_behavioral_question(category: Optional[str] = None):
    """Get a random behavioral interview question."""
    if category and category in BEHAVIORAL_QUESTIONS:
        questions = BEHAVIORAL_QUESTIONS[category]
    else:
        questions = [q for qs in BEHAVIORAL_QUESTIONS.values() for q in qs]
    question = random.choice(questions)
    actual_category = next(k for k, v in BEHAVIORAL_QUESTIONS.items() if question in v)
    return {"question": question, "category": actual_category}


class BehavioralReviewRequest(BaseModel):
    question: str
    answer: str


@app.post("/api/behavioral/review")
def review_behavioral_answer(req: BehavioralReviewRequest):
    """Review a behavioral answer using Claude and return score + feedback."""
    client = get_anthropic()
    if not client:
        raise HTTPException(500, "Claude API not configured")

    prompt = f"""You are an expert behavioral interview coach. Evaluate this answer using the STAR method (Situation, Task, Action, Result).

Question: {req.question}

Answer: {req.answer}

Evaluate on a scale of 1-10. For each STAR component, indicate if it's clear, missing, or weak.
Provide constructive feedback.

Return ONLY valid JSON (no markdown, no triple backticks):
{{
  "score": <1-10>,
  "star": {{
    "situation": "<clear/weak/missing>",
    "task": "<clear/weak/missing>",
    "action": "<clear/weak/missing>",
    "result": "<clear/weak/missing>"
  }},
  "strengths": [<list of 2-3 strengths>],
  "improvements": [<list of 2-3 areas to improve>],
  "summary": "<1-2 sentence summary>"
}}"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text
        review = json.loads(response_text)

        # Store in history
        with _lock:
            s = load()
            s["behavioral_history"].append({
                "date": today_iso(),
                "question": req.question,
                "category": next((k for k, v in BEHAVIORAL_QUESTIONS.items() if req.question in v), "Other"),
                "answer_snippet": req.answer[:100],
                "score": review.get("score", 0),
            })
            # Keep last 20
            s["behavioral_history"] = s["behavioral_history"][-20:]
            save(s)

        return review
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid response from Claude")
    except Exception as e:
        raise HTTPException(500, f"Claude API error: {str(e)}")


# ---- Static frontend ----
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        idx = STATIC_DIR / "index.html"
        if idx.exists():
            return FileResponse(str(idx))
        raise HTTPException(404)
