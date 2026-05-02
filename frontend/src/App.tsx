import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconFlame, IconTarget, IconCalendarStats, IconAlertTriangle,
  IconCheck, IconRocket, IconNotebook, IconTrash, IconChevronRight, IconBolt,
  IconTrophy, IconSparkles, IconArrowRight,
} from "@tabler/icons-react";
import {
  AppState, Problem, getState, patchProblem, reviewProblem, setGoal, resetAll,
  BehavioralQuestion, BehavioralReview, getQuestion, reviewAnswer,
} from "./api";

type TabKey = "today" | "all" | "review" | "topics" | "interview";

// ----- helpers -----
const fmtDate = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
};

// ====== Animated SVG ring ======
function Ring({ pct }: { pct: number }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, pct) / 100) * c;
  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 220 220">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="110" cy="110" r={r} strokeWidth="14" fill="none" />
        <circle
          className="ring-fg"
          cx="110" cy="110" r={r}
          strokeWidth="14"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <div>
          <div className="ring-num gradient-text">{Math.round(pct)}<span style={{ fontSize: 26, opacity: 0.6 }}>%</span></div>
          <div className="ring-pct">complete</div>
        </div>
      </div>
    </div>
  );
}

// ====== Custom checkbox ======
function Check({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div className={`check ${checked ? "checked" : ""}`} onClick={onClick} role="checkbox" aria-checked={checked}>
      {checked && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" strokeDashoffset="0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

// ====== Stat card ======
function Stat({
  icon, label, value, sub, accent, bar,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  accent: { bg: string; color: string; gradient: string }; bar?: number;
}) {
  return (
    <div
      className="stat fade-up"
      style={{
        // @ts-ignore CSS custom props
        "--accent": accent.bg,
        "--icon-bg": accent.bg,
        "--icon-color": accent.color,
        "--accent-bar": accent.gradient,
        "--bar-scale": bar !== undefined ? bar : 1,
      } as any}
    >
      <div className="stat-head">
        <div className="stat-icon">{icon}</div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {bar !== undefined && <div className="stat-spark" />}
    </div>
  );
}

// ====== Problem row ======
function ProblemRow({
  p, onToggleDone, onToggleShaky, onReview, onNotes, showKind,
}: {
  p: Problem; onToggleDone: () => void; onToggleShaky: () => void;
  onReview?: () => void; onNotes: (s: string) => void; showKind?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.notes);
  useEffect(() => setDraft(p.notes), [p.notes]);

  return (
    <div className={`problem ${p.done && !p.shaky ? "done" : ""} ${p.shaky ? "shaky" : ""}`}>
      <Check checked={p.done} onClick={onToggleDone} />
      <div className="problem-body">
        <div className="problem-title-row">
          <span className="problem-name">{p.name}</span>
          <span className={`chip ${p.difficulty}`}>{p.difficulty}</span>
          {p.shaky && <span className="chip shaky"><IconAlertTriangle size={10} /> shaky</span>}
          {showKind && p.kind === "review" && <span className="chip review">review</span>}
          {showKind && p.kind === "new" && <span className="chip new">new</span>}
          {p.completed_date && <span className="chip date">✓ {p.completed_date}</span>}
        </div>
        {p.notes && !editing && <div className="problem-notes">{p.notes}</div>}
        {editing && (
          <div className="notes-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Pattern / technique notes…"
              autoFocus
            />
            <button className="btn-save" onClick={() => { onNotes(draft); setEditing(false); }}>
              Save
            </button>
          </div>
        )}
      </div>
      <div className="problem-actions">
        <Tooltip label={p.shaky ? "Unmark shaky" : "Flag as shaky"} withArrow>
          <button
            className={`iaction ${p.shaky ? "active-warn" : ""}`}
            onClick={onToggleShaky}
          >
            <IconAlertTriangle size={15} />
          </button>
        </Tooltip>
        {onReview && p.shaky && (
          <Tooltip label="Mark reviewed today" withArrow>
            <button className="iaction good" onClick={onReview}>
              <IconCheck size={15} />
            </button>
          </Tooltip>
        )}
        <Tooltip label={editing ? "Close notes" : "Edit notes"} withArrow>
          <button className="iaction" onClick={() => setEditing(v => !v)}>
            <IconNotebook size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ====== Topic accordion item ======
function TopicItem({ topic, problems, defaultOpen, children }: {
  topic: string; problems: Problem[]; defaultOpen: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = problems.filter(p => p.done).length;
  const total = problems.length;
  const pct = total ? (done / total) * 100 : 0;
  const complete = done === total;

  return (
    <div className="topic">
      <button className="topic-head" onClick={() => setOpen(o => !o)}>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconChevronRight size={16} className={`caret ${open ? "open" : ""}`} />
          {topic}
        </span>
        <span className="meta">
          <div className={`topic-mini-bar ${complete ? "complete" : ""}`}><div style={{ width: `${pct}%` }} /></div>
          <span className={`topic-count ${complete ? "complete" : ""}`}>{done}/{total}</span>
        </span>
      </button>
      {open && <div className="topic-body">{children}</div>}
    </div>
  );
}

// ====== Tabs ======
function Tabs({ value, onChange, items }: {
  value: TabKey;
  onChange: (v: TabKey) => void;
  items: { key: TabKey; label: string; icon?: React.ReactNode; badge?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map(it => (
        <button
          key={it.key}
          className={`tab ${value === it.key ? "active" : ""}`}
          onClick={() => onChange(it.key)}
        >
          {it.icon}
          {it.label}
          {it.badge !== undefined && it.badge > 0 && <span className="tab-badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ====== Confetti ======
const CONFETTI_COLORS = ["#a78bfa", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#818cf8"];
function Confetti() {
  const particles = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    duration: `${2.2 + Math.random() * 1.8}s`,
    delay: `${Math.random() * 0.8}s`,
    size: `${8 + Math.random() * 8}px`,
    borderRadius: Math.random() > 0.5 ? "50%" : "2px",
  })), []);
  return (
    <div className="confetti-wrap">
      {particles.map(p => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: p.left,
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: p.borderRadius,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}

// ====== Celebration card ======
function GoalDoneCard({
  streak, dailyGoal, remaining, todayProblems, extraCredit, onToggleDone, onToggleShaky, onReview, onNotes,
}: {
  streak: number; dailyGoal: number; remaining: number;
  todayProblems: Problem[];
  extraCredit: Problem[];
  onToggleDone: (p: Problem) => void;
  onToggleShaky: (p: Problem) => void;
  onReview: (p: Problem) => void;
  onNotes: (p: Problem, n: string) => void;
}) {
  const [showList, setShowList] = useState(false);
  // bonusIndex: how many extra-credit problems are visible
  const [bonusIndex, setBonusIndex] = useState(0);
  const visibleBonus = extraCredit.slice(0, bonusIndex + 1);
  const currentBonus = extraCredit[bonusIndex];
  const currentBonusDone = currentBonus?.done;

  return (
    <>
      {/* Celebration hero */}
      <div className="celebration">
        <div className="celebration-icon">
          <IconCheck size={32} color="white" strokeWidth={3} />
        </div>
        <div className="celebration-title">Done for today.</div>
        <div className="celebration-sub">
          You hit your goal of {dailyGoal} problem{dailyGoal === 1 ? "" : "s"}. Come back tomorrow to keep the streak alive.
        </div>
        <div className="celebration-stats">
          <div className="celebration-stat">
            <div className="num">🔥 {streak}</div>
            <div className="label">day streak</div>
          </div>
          <div className="celebration-stat">
            <div className="num">{remaining}</div>
            <div className="label">left in 150</div>
          </div>
        </div>
        <button className="show-list-btn" onClick={() => setShowList(v => !v)}>
          <IconChevronRight size={14} className={`caret ${showList ? "open" : ""}`} />
          {showList ? "Hide" : "Show"} today's problems
        </button>
      </div>

      {/* Collapsed done list */}
      {showList && (
        <div className="done-list">
          {todayProblems.map(p => (
            <ProblemRow
              key={p.id} p={p} showKind
              onToggleDone={() => onToggleDone(p)}
              onToggleShaky={() => onToggleShaky(p)}
              onReview={p.shaky ? () => onReview(p) : undefined}
              onNotes={(n) => onNotes(p, n)}
            />
          ))}
        </div>
      )}

      {/* Extra credit */}
      {extraCredit.length > 0 && (
        <div className="extra-credit-section">
          <div className="extra-credit-header">
            <span className="extra-credit-badge">Extra credit</span>
            <span className="extra-credit-label">
              Want to keep going? No pressure.
            </span>
          </div>

          {visibleBonus.map((p, i) => (
            <ProblemRow
              key={p.id} p={p}
              onToggleDone={() => onToggleDone(p)}
              onToggleShaky={() => onToggleShaky(p)}
              onReview={p.shaky ? () => onReview(p) : undefined}
              onNotes={(n) => onNotes(p, n)}
            />
          ))}

          {/* Pull next — show only after current bonus is done, and more exist */}
          {currentBonusDone && bonusIndex + 1 < extraCredit.length && (
            <button className="pull-btn" onClick={() => setBonusIndex(i => i + 1)}>
              Pull another <IconArrowRight size={14} />
            </button>
          )}
          {/* First pull prompt */}
          {!currentBonusDone && bonusIndex === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 6 }}>
              Solve it, then pull another if you want more.
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ====== Interview trainer ======
function InterviewTrainer() {
  const [question, setQuestion] = useState<BehavioralQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState<BehavioralReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [category, setCategory] = useState<string>("All");

  const categories = ["All", "Leadership", "Teamwork", "Conflict Resolution", "Problem Solving", "Adaptability", "Communication", "Time Management", "Failure & Growth"];

  const loadQuestion = async (cat?: string) => {
    setAnswer("");
    setReview(null);
    const q = await getQuestion(cat === "All" ? undefined : cat);
    setQuestion(q);
  };

  useEffect(() => { loadQuestion(category === "All" ? undefined : category); }, []);

  const handleMic = async () => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      notifications.show({ color: "red", message: "Speech recognition not supported" });
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    setMicActive(true);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setAnswer(transcript);
    };
    rec.onend = () => setMicActive(false);
    rec.start();
  };

  const handleSubmit = async () => {
    if (!question || !answer.trim()) {
      notifications.show({ color: "red", message: "Please provide an answer" });
      return;
    }
    setLoading(true);
    try {
      const rev = await reviewAnswer(question.question, answer);
      setReview(rev);
    } catch {
      notifications.show({ color: "red", message: "Review failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="section-head">
        <div className="section-title">Behavioral Interview Trainer</div>
        <div className="section-meta">Practice your STAR answers</div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {categories.map(cat => (
          <button
            key={cat}
            className={`tab ${category === cat ? "active" : ""}`}
            onClick={() => { setCategory(cat); loadQuestion(cat === "All" ? undefined : cat); }}
            style={{ fontSize: 12, padding: "6px 12px" }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Question card */}
      {question && (
        <div style={{
          padding: "24px", borderRadius: "16px", background: "var(--surface)",
          border: "1px solid var(--border)", marginBottom: 16, backdropFilter: "blur(20px)",
        }}>
          <div style={{ fontSize: 10, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>
            {question.category}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.6, color: "var(--text)" }}>
            {question.question}
          </div>
          {!review && (
            <button className="show-list-btn" style={{ marginTop: 16 }} onClick={() => loadQuestion(category === "All" ? undefined : category)}>
              <IconChevronRight size={14} /> New question
            </button>
          )}
        </div>
      )}

      {/* Answer section (hide if review is shown) */}
      {!review && (
        <div style={{
          padding: "20px", borderRadius: "16px", background: "var(--surface)",
          border: "1px solid var(--border)", marginBottom: 16, backdropFilter: "blur(20px)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-dim)" }}>YOUR ANSWER</div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer or use the mic button..."
            style={{
              width: "100%", minHeight: "120px", padding: "12px", borderRadius: "10px",
              background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", color: "var(--text)",
              fontFamily: "inherit", fontSize: "14px", resize: "vertical", outline: "none",
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Tooltip label={micActive ? "Recording..." : "Hold to speak"} withArrow>
              <button
                onMouseDown={handleMic}
                style={{
                  background: micActive ? "var(--grad-warn)" : "rgba(34, 211, 238, 0.1)",
                  border: "1px solid rgba(34, 211, 238, 0.3)", borderRadius: "10px",
                  color: micActive ? "#1a0e00" : "var(--cyan)", padding: "8px 16px",
                  cursor: "pointer", fontWeight: 600, fontSize: 12, transition: "all 0.2s",
                }}
              >
                🎤 Speak
              </button>
            </Tooltip>
            <button
              onClick={handleSubmit}
              disabled={loading || !answer.trim()}
              style={{
                flex: 1, background: loading ? "rgba(255,255,255,0.1)" : "var(--grad-1)",
                color: "white", border: "none", borderRadius: "10px", padding: "10px",
                fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading || !answer.trim() ? 0.5 : 1,
              }}
            >
              {loading ? "Reviewing..." : "Submit →"}
            </button>
          </div>
        </div>
      )}

      {/* Review card */}
      {review && (
        <div style={{
          padding: "28px", borderRadius: "20px",
          background: "linear-gradient(135deg, rgba(52, 211, 153, 0.08), rgba(34, 211, 238, 0.08))",
          border: "1px solid rgba(52, 211, 153, 0.2)", marginBottom: 16, backdropFilter: "blur(20px)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>REVIEW</div>
            <div style={{
              fontSize: 44, fontWeight: 700, color: review.score >= 7 ? "var(--teal)" : review.score >= 5 ? "var(--amber)" : "var(--red)",
              fontFamily: "Space Grotesk",
            }}>
              {review.score}<span style={{ fontSize: 20, opacity: 0.6 }}>/10</span>
            </div>
          </div>

          {/* STAR breakdown */}
          <div style={{ marginBottom: 20 }}>
            {Object.entries(review.star).map(([key, val]) => (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,0.03)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--violet)", minWidth: 20 }}>
                  {key.toUpperCase()[0]}
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <span style={{ color: val === "clear" ? "var(--teal)" : val === "weak" ? "var(--amber)" : "var(--red)" }}>
                    {val === "clear" ? "✓" : val === "weak" ? "⚠" : "✗"}
                  </span>
                  {" " + key}
                </div>
              </div>
            ))}
          </div>

          {/* Strengths & improvements */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", marginBottom: 6, textTransform: "uppercase" }}>Strengths</div>
              {review.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>• {s}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", marginBottom: 6, textTransform: "uppercase" }}>To Improve</div>
              {review.improvements.map((imp, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>• {imp}</div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{
            padding: "12px", borderRadius: "8px", background: "rgba(255,255,255,0.04)",
            fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16,
          }}>
            {review.summary}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setAnswer(""); setReview(null); }}
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
                borderRadius: "10px", padding: "10px", color: "var(--text-dim)", cursor: "pointer",
                fontWeight: 600, fontSize: 12,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => loadQuestion(category === "All" ? undefined : category)}
              style={{
                flex: 1, background: "var(--grad-1)", border: "none",
                borderRadius: "10px", padding: "10px", color: "white", cursor: "pointer",
                fontWeight: 600, fontSize: 12,
              }}
            >
              Next question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  APP
// ============================================================
export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("today");

  const refresh = async () => {
    try { setState(await getState()); }
    catch { notifications.show({ color: "red", message: "Failed to load" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  // Fire confetti once per day when goal is first hit
  const confettiKey = state ? `celebrated:${state.today}` : null;
  const [showConfetti, setShowConfetti] = useState(false);
  const prevGoalHit = useRef(false);

  const problemsByTopic = useMemo(() => {
    if (!state) return {};
    const map: Record<string, Problem[]> = {};
    for (const t of state.topic_order) map[t] = [];
    for (const p of state.problems) map[p.topic].push(p);
    return map;
  }, [state]);

  if (loading || !state) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const handleToggle = async (p: Problem) => {
    await patchProblem(p.id, { done: !p.done });
    if (!p.done) notifications.show({
      color: "violet",
      title: "Solved!",
      message: `${p.name}`,
      icon: <IconCheck size={16}/>,
    });
    refresh();
  };
  const handleShaky = async (p: Problem) => { await patchProblem(p.id, { shaky: !p.shaky }); refresh(); };
  const handleReview = async (p: Problem) => {
    await reviewProblem(p.id);
    notifications.show({ color: "green", message: `Reviewed: ${p.name}` });
    refresh();
  };
  const handleNotes = async (p: Problem, notes: string) => { await patchProblem(p.id, { notes }); refresh(); };
  const handleGoal = async (g: number) => { await setGoal(g); refresh(); };
  const handleReset = async () => {
    await resetAll(); setResetOpen(false);
    notifications.show({ message: "Progress wiped" }); refresh();
  };

  const pct = (state.total_done / 150) * 100;
  const daysLeft = Math.max(0, Math.ceil((new Date(state.target_date).getTime() - Date.now()) / 86400000));
  const todayList = state.todays_problems;
  const todayDoneCount = todayList.filter(p => p.done).length;
  // Goal is hit when every problem in today's sticky list is checked off.
  // Using the list (not the log) means raising the goal correctly un-hits it.
  const goalHit = todayList.length > 0 && todayList.every(p => p.done) && state.remaining > 0;
  const todayPct = todayList.length > 0 ? todayDoneCount / todayList.length : 0;
  const onPace = state.pace_7d >= state.required_pace;

  // Trigger confetti once per day on goal hit
  if (goalHit && !prevGoalHit.current && confettiKey && !localStorage.getItem(confettiKey)) {
    localStorage.setItem(confettiKey, "1");
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }
  prevGoalHit.current = goalHit;

  return (
    <div className="shell">
      {showConfetti && <Confetti />}
      {/* TOPBAR */}
      <div className="topbar fade-up">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <div className="brand-name">NeetCode 150</div>
            <div className="brand-sub">Tracker · Spaced Repetition</div>
          </div>
        </div>
        <div className="topbar-actions">
          <Tooltip label="Daily goal" withArrow>
            <div className="goal-input">
              <IconTarget size={13} color="var(--violet)" />
              <input
                type="number"
                min={1}
                max={20}
                value={state.daily_goal}
                onChange={(e) => handleGoal(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
              <span>/day</span>
            </div>
          </Tooltip>
          <Tooltip label="Reset all progress" withArrow>
            <button className="icon-btn danger" onClick={() => setResetOpen(true)}><IconTrash size={16} /></button>
          </Tooltip>
        </div>
      </div>

      {/* HERO */}
      <section className="hero fade-up delay-1">
        <div>
          <div className="hero-eyebrow">
            <span className="dot" />
            {fmtDate(state.today)}{state.is_sunday && " · Review Sunday"}
          </div>
          <h1 className="hero-title">
            {state.remaining === 0 ? (
              <>You did it. <em>All 150.</em></>
            ) : (
              <>
                <em>{state.remaining}</em> problems<br />
                between you and<br />
                <em>that internship.</em>
              </>
            )}
          </h1>
          <p className="hero-sub">
            Daily picks blend due spaced-repetition reviews of your shaky problems
            (1d / 3d / 7d intervals) with the next problem in NeetCode roadmap order.
            Stay consistent. Trust the process.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="num gradient-text">{state.total_done}</div>
              <div className="label">Solved</div>
            </div>
            <div className="hero-stat">
              <div className="num">{state.streak}<span style={{ color: "var(--text-mute)", fontSize: 16, marginLeft: 4 }}>day{state.streak === 1 ? "" : "s"}</span></div>
              <div className="label">Streak</div>
            </div>
            <div className="hero-stat">
              <div className="num">{daysLeft}<span style={{ color: "var(--text-mute)", fontSize: 16, marginLeft: 4 }}>d</span></div>
              <div className="label">Until target</div>
            </div>
          </div>
        </div>
        <Ring pct={pct} />
      </section>

      {/* STATS */}
      <div className="stats-grid">
        <Stat
          icon={<IconFlame size={16} />}
          label="Streak"
          value={`${state.streak}`}
          sub={`hitting ${state.daily_goal}/day`}
          accent={{ bg: "rgba(251, 146, 60, 0.14)", color: "#fdba74", gradient: "linear-gradient(90deg, #fb923c, #fbbf24)" }}
          bar={Math.min(1, state.streak / 30)}
        />
        <Stat
          icon={<IconBolt size={16} />}
          label="Pace · 7d"
          value={<>{state.pace_7d}<span style={{ color: "var(--text-mute)", fontSize: 14, fontWeight: 500 }}> /day</span></>}
          sub={`need ${state.required_pace}/day`}
          accent={onPace
            ? { bg: "rgba(52, 211, 153, 0.14)", color: "#6ee7b7", gradient: "linear-gradient(90deg, #34d399, #22d3ee)" }
            : { bg: "rgba(251, 191, 36, 0.14)", color: "#fcd34d", gradient: "linear-gradient(90deg, #fbbf24, #fb7185)" }
          }
          bar={state.required_pace ? Math.min(1, state.pace_7d / state.required_pace) : 1}
        />
        <Stat
          icon={<IconTrophy size={16} />}
          label="Progress"
          value={<>{state.total_done}<span style={{ color: "var(--text-mute)", fontSize: 14, fontWeight: 500 }}> / 150</span></>}
          sub={`${state.remaining} to go`}
          accent={{ bg: "rgba(167, 139, 250, 0.14)", color: "#c4b5fd", gradient: "var(--grad-1)" }}
          bar={pct / 100}
        />
        <Stat
          icon={<IconCalendarStats size={16} />}
          label="Projected finish"
          value={state.projected_finish ?? "—"}
          sub={`target ${state.target_date}`}
          accent={{ bg: "rgba(244, 114, 182, 0.14)", color: "#f9a8d4", gradient: "linear-gradient(90deg, #f472b6, #a78bfa)" }}
        />
      </div>

      {/* TABS */}
      <div className="fade-up delay-2">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "today",  label: "Today",        icon: <IconRocket size={14}/> },
            { key: "all",    label: "All Problems", icon: <IconSparkles size={14}/> },
            { key: "review", label: "Shaky",        icon: <IconAlertTriangle size={14}/>, badge: state.sunday_review.length },
            { key: "topics", label: "By Topic" },
            { key: "interview", label: "Interview" },
          ]}
        />

        {/* TODAY */}
        {tab === "today" && (
          <div>
            {/* ── All 150 done ── */}
            {state.remaining === 0 && (
              <div className="empty">
                <div className="empty-emoji">🚀</div>
                <div>All 150 done. Go get that internship.</div>
              </div>
            )}

            {/* ── Goal hit for today ── */}
            {state.remaining > 0 && goalHit && (
              <GoalDoneCard
                streak={state.streak}
                dailyGoal={state.daily_goal}
                remaining={state.remaining}
                todayProblems={state.todays_problems}
                extraCredit={state.extra_credit}
                onToggleDone={handleToggle}
                onToggleShaky={handleShaky}
                onReview={handleReview}
                onNotes={handleNotes}
              />
            )}

            {/* ── In progress ── */}
            {state.remaining > 0 && !goalHit && (
              <>
                <div className="section-head">
                  <div className="section-title">
                    Today's <span className="gradient-text">{state.daily_goal}</span> problems
                  </div>
                  <div className="section-meta">{todayDoneCount}/{state.daily_goal} done</div>
                </div>
                <div className="today-progress">
                  <div className="today-progress-fill" style={{ transform: `scaleX(${todayPct})` }} />
                </div>
                {state.todays_problems.map(p => (
                  <ProblemRow
                    key={p.id} p={p} showKind
                    onToggleDone={() => handleToggle(p)}
                    onToggleShaky={() => handleShaky(p)}
                    onReview={p.shaky ? () => handleReview(p) : undefined}
                    onNotes={(n) => handleNotes(p, n)}
                  />
                ))}
                <div className="note">
                  <strong>How today's pick works:</strong> due spaced-repetition reviews of your
                  shaky problems come first (1d → 3d → 7d intervals), then the next unsolved
                  problem in NeetCode roadmap order — until you hit your daily goal.
                </div>
              </>
            )}
          </div>
        )}

        {/* ALL */}
        {tab === "all" && (
          <div>
            <div className="section-head">
              <div className="section-title">All problems by topic</div>
              <div className="section-meta">{state.problems.length} total</div>
            </div>
            {state.topic_order.map((topic, i) => (
              <TopicItem
                key={topic}
                topic={topic}
                problems={problemsByTopic[topic] ?? []}
                defaultOpen={i === 0}
              >
                {(problemsByTopic[topic] ?? []).map(p => (
                  <ProblemRow
                    key={p.id} p={p}
                    onToggleDone={() => handleToggle(p)}
                    onToggleShaky={() => handleShaky(p)}
                    onReview={p.shaky ? () => handleReview(p) : undefined}
                    onNotes={(n) => handleNotes(p, n)}
                  />
                ))}
              </TopicItem>
            ))}
          </div>
        )}

        {/* SHAKY */}
        {tab === "review" && (
          <div>
            <div className="section-head">
              <div className="section-title">Shaky · flagged for review</div>
              <div className="section-meta">{state.sunday_review.length} flagged</div>
            </div>
            {state.sunday_review.length === 0 ? (
              <div className="empty">
                <div className="empty-emoji">✨</div>
                <div>Nothing flagged. Mark problems shaky as you struggle through them.</div>
              </div>
            ) : (
              state.sunday_review.map(p => (
                <ProblemRow
                  key={p.id} p={p}
                  onToggleDone={() => handleToggle(p)}
                  onToggleShaky={() => handleShaky(p)}
                  onReview={() => handleReview(p)}
                  onNotes={(n) => handleNotes(p, n)}
                />
              ))
            )}
          </div>
        )}

        {/* TOPICS */}
        {tab === "topics" && (
          <div>
            <div className="section-head">
              <div className="section-title">Topic mastery</div>
              <div className="section-meta">{state.topic_summary.length} topics</div>
            </div>
            <div className="topic-summary-grid">
              {state.topic_summary.map(t => {
                const pct = t.total ? (t.done / t.total) * 100 : 0;
                const complete = t.done === t.total;
                return (
                  <div key={t.topic} className="topic-card">
                    <div className="topic-card-head">
                      <div className="topic-card-name">{t.topic}</div>
                      <div className="topic-card-pct">{Math.round(pct)}%</div>
                    </div>
                    <div className={`topic-bar ${complete ? "complete" : ""}`}>
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <div className="topic-card-meta">
                      <span>{t.done} of {t.total} solved</span>
                      {t.shaky > 0 && <span style={{ color: "var(--amber)" }}>⚠ {t.shaky} shaky</span>}
                      {complete && <span style={{ color: "var(--teal)" }}>✓ mastered</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INTERVIEW */}
        {tab === "interview" && <InterviewTrainer />}
      </div>

      {/* RESET MODAL */}
      <Modal opened={resetOpen} onClose={() => setResetOpen(false)} title="Reset all progress?" centered>
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 0 }}>
          This wipes completion, shaky flags, notes, and the streak log. Cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="icon-btn" style={{ width: "auto", padding: "0 14px" }} onClick={() => setResetOpen(false)}>
            Cancel
          </button>
          <button
            onClick={handleReset}
            style={{
              background: "linear-gradient(135deg, #fb7185, #ef4444)",
              color: "white", border: "none", borderRadius: 10, padding: "0 16px",
              height: 36, fontWeight: 600, cursor: "pointer",
            }}
          >
            Reset everything
          </button>
        </div>
      </Modal>
    </div>
  );
}
