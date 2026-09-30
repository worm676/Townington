"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AGENT_BY_ID } from "@/lib/agents";
import { STATUS_COLOR, STATUS_LABEL, type Step, type Task } from "@/lib/types";
import { api } from "@/lib/useTasks";

export function StatusPill({ status }: { status: Task["status"] | "idle" }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${STATUS_COLOR[status]}26`, color: STATUS_COLOR[status] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TaskCard({
  task,
  parent,
  defaultOpen = false,
}: {
  task: Task;
  parent?: Task;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || task.status === "needs_input");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"none" | "revise" | "decline">("none");
  const [showSteps, setShowSteps] = useState(false);
  const agent = AGENT_BY_ID[task.agent_id];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setText("");
      setMode("none");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const respond = (body: unknown) => run(() => api(`/api/tasks/${task.id}/respond`, body));
  const act = (body: unknown) => run(() => api(`/api/tasks/${task.id}/action`, body));
  const pending = task.status === "needs_input" ? task.pending_action : null;

  return (
    <div
      className="rounded-lg border bg-slate-900/80 text-sm"
      style={{ borderColor: task.status === "needs_input" ? "#f59e0b88" : "#334155" }}
    >
      <button className="flex w-full items-start gap-2 p-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: agent?.color ?? "#888" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-100">{task.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <span>{agent?.name ?? task.agent_id}</span>
            <span>·</span>
            <span className="capitalize">{task.priority}</span>
            {task.due_date && <span>· due {task.due_date}</span>}
            <span>· {timeAgo(task.updated_at)}</span>
            {task.approved_at && <span className="text-emerald-400">· approved</span>}
          </span>
        </span>
        <StatusPill status={task.status} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-800 px-3 pb-3 pt-2">
          {parent && (
            <div className="text-[11px] text-slate-400">
              Subtask of <span className="text-slate-200">{parent.title}</span>
            </div>
          )}
          {task.instructions && (
            <details className="text-slate-300">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-slate-500">
                Instructions
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{task.instructions}</p>
            </details>
          )}

          {pending?.kind === "question" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                {agent?.name} asks
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-100">{pending.question}</p>
              <textarea
                className="mt-2 w-full rounded bg-slate-950 p-2 text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-amber-400"
                rows={3}
                placeholder="Your answer…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                className="mt-1 rounded bg-amber-500 px-3 py-1 font-semibold text-black disabled:opacity-50"
                disabled={busy || !text.trim()}
                onClick={() => respond({ kind: "answer", answer: text })}
              >
                Send answer
              </button>
            </div>
          )}

          {pending?.kind === "approval" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                Approval needed · {pending.webhook} webhook
              </div>
              {pending.summary && <p className="mt-1 text-slate-100">{pending.summary}</p>}
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-300">
                {JSON.stringify(pending.payload, null, 2)}
              </pre>
              {mode === "decline" && (
                <textarea
                  className="mt-2 w-full rounded bg-slate-950 p-2 text-slate-100 outline-none ring-1 ring-slate-700"
                  rows={2}
                  placeholder="Why / what to change (optional)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-emerald-500 px-3 py-1 font-semibold text-black disabled:opacity-50"
                  disabled={busy}
                  onClick={() => respond({ kind: "approve" })}
                >
                  Approve & send
                </button>
                {mode === "decline" ? (
                  <button
                    className="rounded bg-red-500 px-3 py-1 font-semibold text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => respond({ kind: "reject", feedback: text || undefined })}
                  >
                    Confirm decline
                  </button>
                ) : (
                  <button className="rounded bg-slate-700 px-3 py-1 text-slate-100" onClick={() => setMode("decline")}>
                    Decline
                  </button>
                )}
              </div>
            </div>
          )}

          {task.result && (
            <div className="prose-town max-h-[420px] overflow-auto rounded-md bg-slate-950/60 p-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown>
            </div>
          )}

          <div>
            <button className="text-[11px] text-slate-400 hover:text-slate-200" onClick={() => setShowSteps((s) => !s)}>
              {showSteps ? "▾" : "▸"} Step log ({task.steps?.length ?? 0})
            </button>
            {showSteps && <StepLog steps={task.steps ?? []} />}
          </div>

          {mode === "revise" && (
            <textarea
              className="w-full rounded bg-slate-950 p-2 text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-400"
              rows={3}
              placeholder="What should change?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {task.status === "done" && !task.approved_at && (
              <button
                className="rounded bg-emerald-500 px-3 py-1 font-semibold text-black disabled:opacity-50"
                disabled={busy}
                onClick={() => act({ action: "approve" })}
              >
                Approve
              </button>
            )}
            {(task.status === "done" || task.status === "error") &&
              (mode === "revise" ? (
                <button
                  className="rounded bg-sky-500 px-3 py-1 font-semibold text-black disabled:opacity-50"
                  disabled={busy || !text.trim()}
                  onClick={() => act({ action: "revise", feedback: text })}
                >
                  Send revision
                </button>
              ) : (
                <button className="rounded bg-slate-700 px-3 py-1 text-slate-100" onClick={() => setMode("revise")}>
                  Revise
                </button>
              ))}
            {task.status !== "queued" && (
              <button
                className="rounded bg-slate-700 px-3 py-1 text-slate-100 disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  if (task.status === "working" && !confirm("This task is still running. Restart it from scratch?")) return;
                  act({ action: "retry" });
                }}
              >
                Retry
              </button>
            )}
            {task.status === "queued" && (
              <button
                className="rounded bg-slate-700 px-3 py-1 text-slate-100 disabled:opacity-50"
                disabled={busy}
                onClick={() => run(() => api("/api/run-task", { taskId: task.id }))}
              >
                Run now
              </button>
            )}
          </div>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
        </div>
      )}
    </div>
  );
}

const STEP_ICON: Record<Step["type"], string> = {
  status: "•",
  thinking: "💭",
  text: "✎",
  tool_call: "🔧",
  tool_result: "↩",
  search: "🔎",
  user: "👤",
  error: "⚠",
};

function StepLog({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-1 max-h-72 space-y-1 overflow-auto rounded bg-slate-950/60 p-2 text-[12px]">
      {steps.map((s, i) => (
        <li key={i} className={s.type === "error" ? "text-red-400" : s.type === "thinking" ? "text-slate-500" : "text-slate-300"}>
          <span className="mr-1">{STEP_ICON[s.type]}</span>
          <span className="whitespace-pre-wrap">
            {s.content.length > 600 ? `${s.content.slice(0, 600)}…` : s.content}
          </span>
          {s.type === "tool_call" && s.data !== undefined && (
            <pre className="mt-0.5 overflow-auto text-[11px] text-slate-500">{JSON.stringify(s.data, null, 2)}</pre>
          )}
          {s.type === "search" && Array.isArray(s.data) && (
            <ul className="ml-5 list-disc text-[11px] text-slate-500">
              {(s.data as { title: string; url: string }[]).slice(0, 6).map((h) => (
                <li key={h.url}>
                  <a className="hover:text-sky-400" href={h.url} target="_blank" rel="noreferrer">
                    {h.title || h.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
