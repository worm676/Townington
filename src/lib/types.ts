export type TaskStatus = "queued" | "working" | "needs_input" | "done" | "error";
export type Priority = "low" | "normal" | "high" | "urgent";

export type StepType =
  | "status"
  | "thinking"
  | "text"
  | "tool_call"
  | "tool_result"
  | "search"
  | "user"
  | "error";

export interface Step {
  ts: string;
  type: StepType;
  content: string;
  data?: unknown;
}

export type PendingAction =
  | { kind: "question"; tool_use_id: string; question: string }
  | {
      kind: "approval";
      tool_use_id: string;
      webhook: string;
      payload: unknown;
      summary?: string;
    };

export interface Task {
  id: string;
  agent_id: string;
  title: string;
  instructions: string;
  priority: Priority;
  due_date: string | null;
  status: TaskStatus;
  result: string | null;
  steps: Step[];
  messages: unknown[];
  pending_action: PendingAction | null;
  approved_at: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_COLOR: Record<TaskStatus | "idle", string> = {
  idle: "#8a93a6",
  queued: "#3b82f6",
  working: "#3b82f6",
  needs_input: "#f59e0b",
  done: "#22c55e",
  error: "#ef4444",
};

export const STATUS_LABEL: Record<TaskStatus | "idle", string> = {
  idle: "Idle",
  queued: "Queued",
  working: "Working",
  needs_input: "Needs you",
  done: "Done",
  error: "Error",
};
