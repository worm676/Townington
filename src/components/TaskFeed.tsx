"use client";
import { useMemo, useState } from "react";
import { AGENTS } from "@/lib/agents";
import type { Task, TaskStatus } from "@/lib/types";
import TaskCard from "./TaskCard";

const FILTERS: (TaskStatus | "all")[] = ["all", "needs_input", "working", "queued", "done", "error"];
const FILTER_LABEL: Record<string, string> = {
  all: "All",
  needs_input: "Needs me",
  working: "Working",
  queued: "Queued",
  done: "Done",
  error: "Error",
};

export default function TaskFeed({
  tasks,
  byId,
  onClose,
}: {
  tasks: Task[];
  byId: Record<string, Task>;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [agent, setAgent] = useState<string>("all");

  const shown = useMemo(() => {
    const list = tasks.filter(
      (t) => (filter === "all" || t.status === filter) && (agent === "all" || t.agent_id === agent),
    );
    // Things that need you float to the top.
    return list.sort((a, b) => {
      const na = a.status === "needs_input" ? 1 : 0;
      const nb = b.status === "needs_input" ? 1 : 0;
      return nb - na || Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  }, [tasks, filter, agent]);

  return (
    <aside className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-r border-slate-800 bg-slate-950/95 backdrop-blur sm:w-[420px]">
      <header className="flex items-center gap-2 border-b border-slate-800 p-3">
        <h2 className="flex-1 font-semibold text-white">Task feed</h2>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="all">All agents</option>
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className="text-xl leading-none text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              filter === f ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
        {shown.map((t) => (
          <TaskCard key={t.id} task={t} parent={t.parent_task_id ? byId[t.parent_task_id] : undefined} />
        ))}
      </div>
    </aside>
  );
}
