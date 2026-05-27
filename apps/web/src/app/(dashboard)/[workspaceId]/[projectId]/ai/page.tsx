"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function AIPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const workspaceId = params.workspaceId as string;

  const [loading, setLoading] = useState(false);
  const [resultTitle, setResultTitle] = useState("");
  const [result, setResult] = useState<any>(null);

  const [codeReviewContent, setCodeReviewContent] = useState("");
  const [taskBreakdownDesc, setTaskBreakdownDesc] = useState("");

  const handleAction = async (action: string, payload: any, title: string) => {
    try {
      setLoading(true);
      setResultTitle(title);
      setResult(null);
      const res = await api.post(`/ai/${action}`, { projectId, workspaceId, ...payload });
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-8 h-full flex flex-col overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-primary">✨</span> AI Assistant
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-5xl mb-8">
        <div className="card-elevated flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Project Intelligence</h2>
          <p className="text-sm text-text-secondary">
            Get instant insights into the state of your project.
          </p>
          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={() => handleAction("summarize-project", {}, "Project Summary")}
              disabled={loading}
              className="btn btn-secondary justify-center w-full"
            >
              📝 Summarize Project
            </button>
            <button
              onClick={() => handleAction("whats-blocking-us", {}, "Blocker Analysis")}
              disabled={loading}
              className="btn btn-secondary justify-center w-full"
            >
              🚧 What's Blocking Us?
            </button>
            <button
              onClick={() => handleAction("standup-report", {}, "Standup Report")}
              disabled={loading}
              className="btn btn-secondary justify-center w-full"
            >
              🎤 Generate Standup Report
            </button>
          </div>
        </div>

        <div className="card-elevated flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Task Breakdown</h2>
          <p className="text-sm text-text-secondary">
            Turn a rough idea into actionable subtasks.
          </p>
          <textarea
            value={taskBreakdownDesc}
            onChange={(e) => setTaskBreakdownDesc(e.target.value)}
            placeholder="Describe a feature (e.g. 'Implement forgot password flow')"
            className="input min-h-[80px]"
          />
          <button
            onClick={() => handleAction("task-breakdown", { description: taskBreakdownDesc }, "Task Breakdown")}
            disabled={!taskBreakdownDesc || loading}
            className="btn btn-primary justify-center mt-auto"
          >
            Break Down Task
          </button>
        </div>

        <div className="card-elevated flex flex-col gap-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">Code Reviewer</h2>
          <p className="text-sm text-text-secondary">
            Paste code to receive an automated review of bugs, performance, security, and readability.
          </p>
          <textarea
            value={codeReviewContent}
            onChange={(e) => setCodeReviewContent(e.target.value)}
            placeholder="Paste code here..."
            className="input min-h-[150px] font-mono whitespace-pre"
            spellCheck={false}
          />
          <div className="flex justify-end">
            <button
              onClick={() =>
                handleAction("code-review", { code: codeReviewContent, language: "javascript" }, "Code Review")
              }
              disabled={!codeReviewContent || loading}
              className="btn btn-primary"
            >
              🔍 Review Code
            </button>
          </div>
        </div>
      </div>

      {(loading || result) && (
        <div className="w-full max-w-5xl card bg-bg-surface border border-primary/30 shadow-glow mb-8 animate-in fade-in slide-in-from-bottom-4">
          <h3 className="text-xl font-semibold mb-4 text-primary-light">
            {resultTitle}
          </h3>
          
          {loading && (
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="animate-pulse">✨ AI is thinking...</span>
            </div>
          )}
          
          {result && result.error && (
            <div className="p-3 bg-danger/10 text-danger rounded-md border border-danger/20 text-sm">
              Error: {result.error}
            </div>
          )}

          {result && !result.error && (
            <div className="prose prose-invert prose-p:text-text-secondary max-w-none text-sm">
              {result.summary && <pre className="whitespace-pre-wrap font-sans">{result.summary}</pre>}
              {result.analysis && <pre className="whitespace-pre-wrap font-sans">{result.analysis}</pre>}
              {result.report && <pre className="whitespace-pre-wrap font-sans">{result.report}</pre>}
              
              {result.tasks && Array.isArray(result.tasks) && (
                <ul className="space-y-3 pl-0 list-none">
                  {result.tasks.map((t: any, i: number) => (
                    <li key={i} className="p-3 rounded-lg bg-bg-elevated border border-border">
                      <div className="font-semibold text-text-primary mb-1">{t.title}</div>
                      <div className="text-text-secondary">{t.description}</div>
                    </li>
                  ))}
                </ul>
              )}

              {result.review && (
                <div className="space-y-4">
                  <div className="inline-block px-3 py-1 bg-primary/20 text-primary-light rounded-full font-bold">
                    Score: {result.review.score}/100
                  </div>
                  <div>
                    <h4 className="font-semibold text-danger mb-2">Issues Identified:</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.review.issues?.map((iss: string, i: number) => (
                        <li key={i}>{iss}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-success mb-2">Suggestions:</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.review.suggestions?.map((sug: string, i: number) => (
                        <li key={i}>{sug}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}