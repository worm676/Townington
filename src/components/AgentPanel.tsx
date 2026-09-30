"use client";
import { useState } from "react";
import type { AgentConfig } from "@/lib/agents";
import type { AgentStatus } from "@/lib/agentStatus";
import type { Priority, Task } from "@/lib/types";
import { api } from "@/lib/useTasks";
import TaskCard, { StatusPill } from "./TaskCard";

const TOOL_LABEL: Record<string, string> = {
  web_search: "Web search",
  call_webhook: "Webhooks (approval)",
  ask_user: "Ask you",
  create_subtask: "Assign subtasks",
};

export default function AgentPanel({
  agent,
  status,
  tasks,
  byId,
  onClose,
}: {
  agent: AgentConfig;
  status: AgentStatus;
  tasks: Task[];
  byId: Record<string, Task>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/tasks", {
        agent_id: agent.id,
        title,
        instructions,
        priority,
        due_date: due || null,
      });
      setTitle("");
      setInstructions("");
      setDue("");
      setPriority("normal");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-l border-slate-800 bg-slate-950/95 backdrop-blur sm:w-[420px]">
      <header className="flex items-start gap-3 border-b border-slate-800 p-4">
        <div className="h-10 w-10 shrink-0 rounded-lg" style={{ background: agent.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{agent.name}</h2>
            <StatusPill status={status} />
          </div>
          <p className="text-[13px] text-slate-400">
            {agent.role} · {agent.building.name}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.tools.map((t) => (
              <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                {TOOL_LABEL[t] ?? t}
              </span>
            ))}
          </div>
        </div>
        <button className="text-xl leading-none text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <form onSubmit={assign} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">New task</div>
          <input
            className="w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
            placeholder="Instructions — context, audience, format, constraints"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100 ring-1 ring-slate-700"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="date"
              className="flex-1 rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100 ring-1 ring-slate-700 [color-scheme:dark]"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="w-full rounded py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: agent.color }}
          >
            {busy ? "Assigning…" : `Assign to ${agent.name}`}
          </button>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
        </form>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {agent.name}&apos;s tasks ({tasks.length})
          </div>
          {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
          {tasks.map((t, i) => (
            <TaskCard
              key={t.id}
              task={t}
              parent={t.parent_task_id ? byId[t.parent_task_id] : undefined}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
