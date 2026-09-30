"use client";
import { useState } from "react";
import type { TaskStatus } from "@/lib/types";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/types";
import { api } from "@/lib/useTasks";

const ORDER: TaskStatus[] = ["needs_input", "working", "queued", "done", "error"];

export default function TopBar({
  counts,
  feedOpen,
  onToggleFeed,
  canSeed,
}: {
  counts: Record<TaskStatus, number>;
  feedOpen: boolean;
  onToggleFeed: () => void;
  canSeed: boolean;
}) {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const command = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    call(async () => {
      await api("/api/command", { goal });
      setGoal("");
      return "Chief is on it.";
    });
  };

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/85 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-gradient-to-br from-amber-300 to-rose-500" />
        <span className="font-semibold tracking-tight text-white">Resilience Town</span>
      </div>

      <button
        onClick={onToggleFeed}
        className={`rounded px-2.5 py-1 text-xs font-medium ${feedOpen ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
      >
        Task feed
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        {ORDER.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-800"
            title={STATUS_LABEL[s]}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]} <b className="text-white">{counts[s]}</b>
          </span>
        ))}
      </div>

      <form onSubmit={command} className="flex min-w-[260px] flex-1 items-center gap-2">
        <input
          className="flex-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none ring-1 ring-slate-700 placeholder:text-slate-500 focus:ring-amber-400"
          placeholder="Command Chief: e.g. “Get us 10 qualified roofing leads in Dallas and draft outreach”"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !goal.trim()}
          className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          Command
        </button>
      </form>

      <div className="flex items-center gap-2">
        {counts.queued > 0 && (
          <button
            disabled={busy}
            onClick={() =>
              call(async () => {
                const r = await api<{ started: number }>("/api/run-task", { all: true });
                return `Started ${r.started} task(s).`;
              })
            }
            className="rounded bg-sky-500 px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-50"
          >
            Run queue
          </button>
        )}
        {canSeed && (
          <button
            disabled={busy}
            onClick={() =>
              call(async () => {
                const r = await api<{ inserted: number }>("/api/seed");
                return `Seeded ${r.inserted} demo tasks.`;
              })
            }
            className="rounded bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Seed demo tasks
          </button>
        )}
      </div>

      {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
    </div>
  );
}
