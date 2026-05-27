"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import {
  Cpu, Zap, ShieldAlert, FileText, Mic2, Code2, Sparkles,
  AlertCircle, CheckCircle2, Lightbulb, Star, Loader2, ChevronRight
} from "lucide-react";

type AIAction = "summarize-project" | "whats-blocking-us" | "standup-report" | "task-breakdown" | "code-review";

interface AIResult {
  summary?: string;
  analysis?: string;
  report?: string;
  tasks?: { title: string; description: string; priority?: string }[];
  review?: {
    score: number;
    summary?: string;
    issues: string[];
    suggestions: string[];
    positives?: string[];
  };
  error?: string;
}

const QUICK_ACTIONS = [
  {
    id: "summarize-project" as AIAction,
    icon: FileText,
    label: "Project Summary",
    description: "Get an AI overview of all tasks and project health",
    color: "text-secondary",
    bg: "bg-secondary/10 border-secondary/20",
  },
  {
    id: "whats-blocking-us" as AIAction,
    icon: ShieldAlert,
    label: "What's Blocking Us?",
    description: "Identify stuck tasks and potential blockers",
    color: "text-warning",
    bg: "bg-warning/10 border-warning/20",
  },
  {
    id: "standup-report" as AIAction,
    icon: Mic2,
    label: "Standup Report",
    description: "Auto-generate today's standup based on task movement",
    color: "text-success",
    bg: "bg-success/10 border-success/20",
  },
];

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r="36" fill="none" stroke="#2A2A3D" strokeWidth="8" />
        <circle
          cx="48" cy="48" r="36" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-text-primary">{score}</span>
        <span className="text-[10px] text-text-muted">/ 100</span>
      </div>
    </div>
  );
}

function ResultCard({ action, result }: { action: AIAction; result: AIResult }) {
  if (result.error) {
    return (
      <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger flex items-start gap-3">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-1">AI Error</p>
          <p>{result.error}</p>
        </div>
      </div>
    );
  }

  if (action === "code-review" && result.review) {
    const r = result.review;
    const scoreColor = r.score >= 80 ? "text-success" : r.score >= 60 ? "text-warning" : "text-danger";

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-6">
          <ScoreRing score={r.score} />
          <div>
            <p className="text-lg font-semibold text-text-primary">Code Quality Score</p>
            <p className={`text-3xl font-bold ${scoreColor}`}>{r.score}/100</p>
            {r.summary && <p className="text-sm text-text-muted mt-1 max-w-sm">{r.summary}</p>}
          </div>
        </div>

        {r.positives && r.positives.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-success mb-2">
              <CheckCircle2 size={14} /> What's Good
            </h4>
            <ul className="space-y-1.5">
              {r.positives.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <Star size={12} className="text-success flex-shrink-0 mt-1" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.issues && r.issues.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-danger mb-2">
              <AlertCircle size={14} /> Issues Found
            </h4>
            <ul className="space-y-1.5">
              {r.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <ChevronRight size={12} className="text-danger flex-shrink-0 mt-1" />
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.suggestions && r.suggestions.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-primary-light mb-2">
              <Lightbulb size={14} /> Suggestions
            </h4>
            <ul className="space-y-1.5">
              {r.suggestions.map((sug, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <ChevronRight size={12} className="text-primary flex-shrink-0 mt-1" />
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (action === "task-breakdown" && result.tasks) {
    const priorityColor: Record<string, string> = {
      P0: "badge-red", P1: "badge-amber", P2: "badge-cyan",
    };
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-muted">{result.tasks.length} subtasks generated</p>
        <div className="grid gap-3">
          {result.tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-bg-base rounded-lg border border-border">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-text-primary">{task.title}</p>
                  {task.priority && (
                    <span className={`badge ${priorityColor[task.priority] || "badge-gray"} text-[10px]`}>
                      {task.priority}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">{task.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const text = result.summary || result.analysis || result.report || "";
  return (
    <div className="prose prose-sm max-w-none">
      <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary leading-relaxed bg-transparent border-0 p-0 m-0">
        {text}
      </pre>
    </div>
  );
}

export default function AIPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const workspaceId = params.workspaceId as string;

  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [result, setResult] = useState<AIResult | null>(null);
  const [codeContent, setCodeContent] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [taskDesc, setTaskDesc] = useState("");

  const runAction = async (action: AIAction, payload: Record<string, string> = {}) => {
    setLoading(true);
    setActiveAction(action);
    setResult(null);
    try {
      const res = await api.post(`/ai/${action}`, { projectId, workspaceId, ...payload });
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error || err.message || "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: AIAction) => {
    return QUICK_ACTIONS.find(a => a.id === action)?.label ||
      (action === "task-breakdown" ? "Task Breakdown" : "Code Review");
  };

  return (
    <div className="h-full overflow-y-auto bg-bg-base">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">AI Project Assistant</h1>
            <p className="text-sm text-text-muted">Powered by Google Gemini</p>
          </div>
          <div className="ml-auto">
            <span className="badge badge-violet text-xs flex items-center gap-1">
              <Sparkles size={10} /> AI Enabled
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => runAction(action.id)}
                disabled={loading}
                className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${action.bg}`}
              >
                <action.icon size={20} className={action.color} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{action.label}</p>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Task Breakdown */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Task Breakdown</h2>
            <span className="text-xs text-text-muted">— Turn a feature into subtasks</span>
          </div>
          <div className="flex gap-2">
            <input
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="Describe a feature (e.g. 'Build forgot password flow')"
              className="input flex-1"
              onKeyDown={(e) => e.key === "Enter" && taskDesc && runAction("task-breakdown", { description: taskDesc })}
            />
            <button
              onClick={() => runAction("task-breakdown", { description: taskDesc })}
              disabled={!taskDesc.trim() || loading}
              className="btn-primary whitespace-nowrap"
            >
              {loading && activeAction === "task-breakdown" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : <Zap size={14} />}
              Break Down
            </button>
          </div>
        </div>

        {/* Code Reviewer */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Code2 size={16} className="text-secondary" />
            <h2 className="text-sm font-semibold text-text-primary">AI Code Reviewer</h2>
            <span className="text-xs text-text-muted">— Get instant code quality score</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Language:</label>
              <select
                value={codeLanguage}
                onChange={(e) => setCodeLanguage(e.target.value)}
                className="input py-1 w-auto text-xs"
              >
                {["javascript", "typescript", "python", "java", "cpp", "go", "rust"].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <textarea
              value={codeContent}
              onChange={(e) => setCodeContent(e.target.value)}
              placeholder="Paste your code here..."
              className="input min-h-[140px] font-mono text-xs resize-y"
              spellCheck={false}
            />
            <div className="flex justify-end">
              <button
                onClick={() => runAction("code-review", { code: codeContent, language: codeLanguage })}
                disabled={!codeContent.trim() || loading}
                className="btn-primary"
              >
                {loading && activeAction === "code-review" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : <Code2 size={14} />}
                Review Code
              </button>
            </div>
          </div>
        </div>

        {/* Result Panel */}
        {(loading || result) && (
          <div className="card border-primary/30 bg-bg-surface animate-slide-up">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              {loading ? (
                <Loader2 size={16} className="animate-spin text-primary" />
              ) : (
                <Sparkles size={16} className="text-primary" />
              )}
              <h3 className="text-sm font-semibold text-primary-light">
                {activeAction ? getActionLabel(activeAction) : "AI Response"}
              </h3>
              {loading && (
                <span className="text-xs text-text-muted ml-auto animate-pulse">Gemini is thinking...</span>
              )}
            </div>

            {loading && !result && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton h-4 rounded-md" style={{ width: `${70 + i * 10}%` }} />
                ))}
              </div>
            )}

            {result && activeAction && <ResultCard action={activeAction} result={result} />}
          </div>
        )}
      </div>
    </div>
  );
}