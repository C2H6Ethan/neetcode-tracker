export interface Problem {
  id: number;
  topic: string;
  name: string;
  difficulty: "easy" | "medium" | "hard";
  done: boolean;
  shaky: boolean;
  completed_date: string | null;
  shaky_set_date: string | null;
  review_count: number;
  notes: string;
  kind?: "new" | "review";
}

export interface TopicSummary {
  topic: string;
  total: number;
  done: number;
  shaky: number;
}

export interface AppState {
  daily_goal: number;
  target_date: string;
  today: string;
  is_sunday: boolean;
  problems: Problem[];
  topic_order: string[];
  topic_summary: TopicSummary[];
  todays_problems: Problem[];
  sunday_review: Problem[];
  streak: number;
  pace_7d: number;
  required_pace: number;
  projected_finish: string | null;
  remaining: number;
  total_done: number;
}

const API = "/api";

export async function getState(): Promise<AppState> {
  const r = await fetch(`${API}/state`);
  if (!r.ok) throw new Error("failed");
  return r.json();
}

export async function patchProblem(
  id: number,
  body: { done?: boolean; shaky?: boolean; notes?: string }
) {
  const r = await fetch(`${API}/problems/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

export async function reviewProblem(id: number) {
  const r = await fetch(`${API}/problems/${id}/review`, { method: "POST" });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

export async function setGoal(goal: number) {
  const r = await fetch(`${API}/goal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_goal: goal }),
  });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

export async function resetAll() {
  const r = await fetch(`${API}/reset`, { method: "POST" });
  if (!r.ok) throw new Error("failed");
  return r.json();
}
