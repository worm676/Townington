"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
import { agentStatus, type AgentStatus } from "@/lib/agentStatus";
import { supabaseConfigured } from "@/lib/supabase-browser";
import type { Task, TaskStatus } from "@/lib/types";
import { useTasks } from "@/lib/useTasks";
import AgentPanel from "./AgentPanel";
import TaskFeed from "./TaskFeed";
import TopBar from "./TopBar";

const Town = dynamic(() => import("./Town"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-slate-500">Building the town…</div>,
});

export default function CommandCenter() {
  const { tasks, error, loading } = useTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate time-based status fading once a minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const statuses = useMemo(() => {
    const out: Record<string, AgentStatus> = {};
    for (const a of AGENTS) out[a.id] = agentStatus(tasks, a.id, now);
    return out;
  }, [tasks, now]);

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { queued: 0, working: 0, needs_input: 0, done: 0, error: 0 };
    for (const t of tasks) c[t.status]++;
    return c;
  }, [tasks]);

  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])) as Record<string, Task>, [tasks]);
  const agent = selected ? AGENT_BY_ID[selected] : null;
  const configured = supabaseConfigured();

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <Town statuses={statuses} selected={selected} onSelect={setSelected} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <TopBar
          counts={counts}
          feedOpen={feedOpen}
          onToggleFeed={() => setFeedOpen((o) => !o)}
          canSeed={configured && !loading && tasks.length === 0}
        />

        {(!configured || error) && (
          <div className="pointer-events-auto mx-auto mt-3 max-w-xl rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {!configured
              ? "Supabase isn't configured — the town is in view-only mode. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see README)."
              : `Couldn't load tasks: ${error}. Did you run the migration in supabase/migrations?`}
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          {feedOpen && (
            <div className="absolute inset-y-0 left-0 z-10 w-full sm:w-auto">
              <TaskFeed tasks={tasks} byId={byId} onClose={() => setFeedOpen(false)} />
            </div>
          )}
          {agent && (
            <div className="absolute inset-y-0 right-0 z-20 w-full sm:w-auto">
              <AgentPanel
                agent={agent}
                status={statuses[agent.id]}
                tasks={tasks.filter((t) => t.agent_id === agent.id)}
                byId={byId}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>

        {!agent && (
          <div className="pointer-events-auto mx-auto mb-3 flex flex-wrap justify-center gap-1.5 px-3">
            {AGENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className="flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-200 ring-1 ring-slate-800 hover:ring-slate-600"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                {a.name}
                {statuses[a.id] === "needs_input" && <span className="font-bold text-amber-400">!</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
