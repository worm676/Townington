import type { Task, TaskStatus } from "./types";

export type AgentStatus = TaskStatus | "idle";

const RANK: Record<AgentStatus, number> = {
  needs_input: 6,
  working: 5,
  queued: 4,
  error: 3,
  done: 2,
  idle: 0,
};

/**
 * One status per agent for the ring: anything needing you wins, then active
 * work, then the most recent outcome. "Done" and "error" fade to idle after a
 * while so the town doesn't stay green/red forever.
 */
export function agentStatus(tasks: Task[], agentId: string, now = Date.now()): AgentStatus {
  let best: AgentStatus = "idle";
  for (const t of tasks) {
    if (t.agent_id !== agentId) continue;
    let s: AgentStatus = t.status;
    if ((s === "done" || s === "error") && now - Date.parse(t.updated_at) > 30 * 60_000) s = "idle";
    if (RANK[s] > RANK[best]) best = s;
  }
  return best;
}

export function isAway(s: AgentStatus) {
  return s === "working" || s === "queued" || s === "needs_input";
}
