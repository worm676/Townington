import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AGENTS, AGENT_BY_ID, type AgentConfig } from "./agents";
import { getServerSupabase } from "./supabase-server";
import type { PendingAction, Step, Task, TaskStatus } from "./types";

type Msg = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_TURNS = 24;
/** Hand the task to a fresh worker before the serverless function times out. */
const TIME_BUDGET_MS = 240_000;

/** Pending action plus bookkeeping for multiple pausing tool calls in one turn. */
type StoredPending = PendingAction & { queue?: PendingAction[]; results?: ToolResult[] };

export type Kick = (taskId: string) => Promise<void>;

// ---------------------------------------------------------------- tools

const AskUserInput = z.object({ question: z.string().min(1) });
const WebhookInput = z.object({
  name: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  summary: z.string().optional(),
});
const SubtaskInput = z.object({
  agent_id: z.string(),
  title: z.string().min(1),
  instructions: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

function toolsFor(agent: AgentConfig): Anthropic.Beta.BetaToolUnion[] {
  const tools: Anthropic.Beta.BetaToolUnion[] = [];
  for (const t of agent.tools) {
    if (t === "web_search") {
      tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 8 });
    } else if (t === "ask_user") {
      tools.push({
        name: "ask_user",
        description:
          "Ask the operator (Jeremy) one specific question and pause until they reply. Use only when a missing fact would materially change the result.",
        eager_input_streaming: true,
        input_schema: {
          type: "object",
          properties: { question: { type: "string", description: "One clear question." } },
          required: ["question"],
        },
      });
    } else if (t === "call_webhook") {
      tools.push({
        name: "call_webhook",
        description:
          "POST a JSON payload to a configured n8n/GoHighLevel webhook. Every call is held for the operator's approval before it is sent; the result tells you whether it was approved and what the webhook returned.",
        eager_input_streaming: true,
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", enum: agent.webhooks ?? [], description: "Webhook name." },
            payload: { type: "object", description: "JSON body to send." },
            summary: {
              type: "string",
              description: "One sentence the operator reads when approving, e.g. 'Create contact Dana Ortiz in GHL'.",
            },
          },
          required: ["name", "payload", "summary"],
        },
      });
    } else if (t === "create_subtask") {
      const team = AGENTS.filter((a) => a.id !== agent.id);
      tools.push({
        name: "create_subtask",
        description: `Create a task for a team member. It starts running immediately. Team: ${team
          .map((a) => `${a.id} (${a.role})`)
          .join(", ")}.`,
        eager_input_streaming: true,
        input_schema: {
          type: "object",
          properties: {
            agent_id: { type: "string", enum: team.map((a) => a.id) },
            title: { type: "string" },
            instructions: {
              type: "string",
              description: "Complete, self-contained instructions including all needed context.",
            },
            priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          },
          required: ["agent_id", "title", "instructions", "priority"],
        },
      });
    }
  }
  return tools;
}

// ---------------------------------------------------------------- persistence helpers

function step(type: Step["type"], content: string, data?: unknown): Step {
  return { ts: new Date().toISOString(), type, content, ...(data === undefined ? {} : { data }) };
}

async function save(id: string, patch: Partial<Task>) {
  const { error } = await getServerSupabase().from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await getServerSupabase().from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Task | null;
}

/** Atomically move a queued task to working. Returns null if someone else got it. */
async function claim(id?: string): Promise<Task | null> {
  const db = getServerSupabase();
  let targetId = id;
  if (!targetId) {
    const { data } = await db
      .from("tasks")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    targetId = data.id as string;
  }
  const { data, error } = await db
    .from("tasks")
    .update({ status: "working" })
    .eq("id", targetId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Task | null;
}

async function initialPrompt(task: Task): Promise<string> {
  let parent = "";
  if (task.parent_task_id) {
    const p = await getTask(task.parent_task_id);
    if (p) parent = `\nThis is a subtask assigned by Chief toward the goal: "${p.title}".\n`;
  }
  return [
    `# Task: ${task.title}`,
    `Priority: ${task.priority}${task.due_date ? ` · Due: ${task.due_date}` : ""}`,
    parent,
    task.instructions || "(no further instructions)",
  ].join("\n");
}

// ---------------------------------------------------------------- the agent loop

/**
 * Claim a queued task (or the oldest queued task when id is omitted) and run
 * the agent loop until it finishes, errors, or pauses for the operator.
 * Returns the id of the task it ran, if any.
 */
export async function runTask(id: string | undefined, kick: Kick): Promise<string | null> {
  const task = await claim(id);
  if (!task) return null;
  const agent = AGENT_BY_ID[task.agent_id];
  const steps: Step[] = Array.isArray(task.steps) ? [...task.steps] : [];
  const messages = (Array.isArray(task.messages) ? [...task.messages] : []) as Msg[];

  const finish = async (status: TaskStatus, patch: Partial<Task> = {}) => {
    await save(task.id, { status, steps, messages, ...patch });
  };

  if (!agent) {
    steps.push(step("error", `Unknown agent "${task.agent_id}"`));
    await finish("error");
    return task.id;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    steps.push(step("error", "ANTHROPIC_API_KEY is not set on the server."));
    await finish("error");
    return task.id;
  }

  const client = new Anthropic();
  const tools = toolsFor(agent);
  const started = Date.now();

  if (messages.length === 0) {
    messages.push({ role: "user", content: await initialPrompt(task) });
    steps.push(step("status", `${agent.name} picked up the task`));
  } else {
    steps.push(step("status", `${agent.name} resumed`));
  }
  await save(task.id, { steps, messages });

  const childTasks: string[] = [];
  let jsonRetries = 0;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        steps.push(step("status", "Continuing in a fresh worker"));
        await finish("queued");
        await kick(task.id);
        return task.id;
      }

      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: [{ type: "text", text: agent.systemPrompt, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "high" },
        // Server-side refusal fallback: a declined request is retried on a
        // suitable fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only unparseable streamed tool input is retried; API errors propagate.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        steps.push(step("status", "Tool input was malformed; retrying the turn"));
        continue;
      }

      logContent(steps, message.content);
      messages.push({ role: "assistant", content: message.content });
      await save(task.id, { steps, messages });

      if (message.stop_reason === "refusal") {
        const why = message.stop_details?.explanation ?? "The model declined this request.";
        steps.push(step("error", `Refused: ${why}`));
        await finish("error");
        return task.id;
      }
      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "max_tokens") {
        steps.push(step("error", "Response hit the max_tokens limit."));
        await finish("error");
        return task.id;
      }

      const toolUses = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      if (toolUses.length === 0) {
        const result = message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n")
          .trim();
        steps.push(step("status", "Done"));
        await finish("done", { result: result || "_(no written output)_", pending_action: null });
        return task.id;
      }

      // Execute immediate tools; queue the ones that need the operator.
      const results: ToolResult[] = [];
      const waiting: PendingAction[] = [];
      for (const tu of toolUses) {
        const r = await executeTool(agent, task, tu, childTasks);
        if ("pending" in r) waiting.push(r.pending);
        else {
          results.push(r.result);
          steps.push(step("tool_result", summarize(r.result), { tool: tu.name }));
        }
      }

      if (waiting.length > 0) {
        const [current, ...queue] = waiting;
        const pending: StoredPending = { ...current, queue, results };
        steps.push(
          step(
            "status",
            current.kind === "question" ? `Waiting for your answer` : `Waiting for your approval`,
          ),
        );
        await finish("needs_input", { pending_action: pending });
        return task.id;
      }

      messages.push({ role: "user", content: results });
      await save(task.id, { steps, messages });
    }

    steps.push(step("error", `Stopped after ${MAX_TURNS} turns without finishing.`));
    await finish("error");
  } catch (err) {
    steps.push(step("error", errorText(err)));
    await finish("error");
  } finally {
    await Promise.all(childTasks.map((c) => kick(c).catch(() => {})));
    childTasks.length = 0;
  }
  return task.id;
}

async function executeTool(
  agent: AgentConfig,
  task: Task,
  tu: Anthropic.Beta.BetaToolUseBlock,
  childTasks: string[],
): Promise<{ result: ToolResult } | { pending: PendingAction }> {
  const err = (text: string): { result: ToolResult } => ({
    result: { type: "tool_result", tool_use_id: tu.id, is_error: true, content: text },
  });
  const ok = (text: string): { result: ToolResult } => ({
    result: { type: "tool_result", tool_use_id: tu.id, content: text },
  });

  if (!(agent.tools as string[]).includes(tu.name)) return err(`Tool ${tu.name} is not available to you.`);

  if (tu.name === "ask_user") {
    const p = AskUserInput.safeParse(tu.input);
    if (!p.success) return err(`Invalid input: ${p.error.message}`);
    return { pending: { kind: "question", tool_use_id: tu.id, question: p.data.question } };
  }

  if (tu.name === "call_webhook") {
    const p = WebhookInput.safeParse(tu.input);
    if (!p.success) return err(`Invalid input: ${p.error.message}`);
    const name = p.data.name.toUpperCase();
    if (!(agent.webhooks ?? []).includes(name)) return err(`Webhook ${name} is not allowed for ${agent.name}.`);
    return {
      pending: {
        kind: "approval",
        tool_use_id: tu.id,
        webhook: name,
        payload: p.data.payload,
        summary: p.data.summary,
      },
    };
  }

  if (tu.name === "create_subtask") {
    const p = SubtaskInput.safeParse(tu.input);
    if (!p.success) return err(`Invalid input: ${p.error.message}`);
    if (!AGENT_BY_ID[p.data.agent_id] || p.data.agent_id === agent.id)
      return err(`Unknown agent "${p.data.agent_id}".`);
    const { data, error } = await getServerSupabase()
      .from("tasks")
      .insert({
        agent_id: p.data.agent_id,
        title: p.data.title,
        instructions: p.data.instructions,
        priority: p.data.priority ?? "normal",
        parent_task_id: task.id,
      })
      .select("id")
      .single();
    if (error) return err(`Could not create task: ${error.message}`);
    childTasks.push(data.id as string);
    return ok(`Created task ${data.id} for ${AGENT_BY_ID[p.data.agent_id].name}: "${p.data.title}".`);
  }

  return err(`Unknown tool ${tu.name}`);
}

// ---------------------------------------------------------------- resuming after operator input

export type Resolution =
  | { kind: "answer"; answer: string }
  | { kind: "approve" }
  | { kind: "reject"; feedback?: string };

/**
 * Apply the operator's reply to the task's current pending action. When no
 * pending actions remain, the tool results are appended and the task is
 * re-queued (the caller should then kick it).
 */
export async function resolvePending(id: string, res: Resolution): Promise<{ requeued: boolean }> {
  const task = await getTask(id);
  if (!task || task.status !== "needs_input" || !task.pending_action) {
    throw new Error("Task is not waiting for input.");
  }
  const pending = task.pending_action as StoredPending;
  const steps = [...task.steps];
  const results = [...(pending.results ?? [])];

  if (pending.kind === "question") {
    if (res.kind !== "answer") throw new Error("This task is waiting for an answer.");
    steps.push(step("user", res.answer));
    results.push({ type: "tool_result", tool_use_id: pending.tool_use_id, content: res.answer });
  } else if (res.kind === "approve") {
    const out = await postWebhook(pending.webhook, pending.payload);
    steps.push(step("user", `Approved ${pending.webhook} webhook`));
    steps.push(step("tool_result", out.text, { tool: "call_webhook", ok: out.ok }));
    results.push({
      type: "tool_result",
      tool_use_id: pending.tool_use_id,
      is_error: !out.ok,
      content: out.text,
    });
  } else if (res.kind === "reject") {
    const text = `The operator declined this webhook call${res.feedback ? `: ${res.feedback}` : "."} Do not retry it unless asked.`;
    steps.push(step("user", `Declined ${pending.webhook} webhook${res.feedback ? `: ${res.feedback}` : ""}`));
    results.push({ type: "tool_result", tool_use_id: pending.tool_use_id, is_error: true, content: text });
  } else {
    throw new Error("This task is waiting for an approval decision.");
  }

  const [next, ...queue] = pending.queue ?? [];
  if (next) {
    const stored: StoredPending = { ...next, queue, results };
    await save(id, { steps, pending_action: stored });
    return { requeued: false };
  }

  const messages = [...(task.messages as Msg[]), { role: "user", content: results } as Msg];
  await save(id, { steps, messages, pending_action: null, status: "queued" });
  return { requeued: true };
}

async function postWebhook(name: string, payload: unknown): Promise<{ ok: boolean; text: string }> {
  const url = process.env[`N8N_WEBHOOK_${name}`];
  if (!url) return { ok: false, text: `Webhook N8N_WEBHOOK_${name} is not configured on the server.` };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await r.text()).slice(0, 2000);
    return { ok: r.ok, text: `HTTP ${r.status}${body ? `: ${body}` : ""}` };
  } catch (e) {
    return { ok: false, text: `Webhook request failed: ${errorText(e)}` };
  }
}

// ---------------------------------------------------------------- task-level operator actions

export async function approveTask(id: string) {
  await save(id, { approved_at: new Date().toISOString() });
}

/** Send feedback on a finished task; the agent continues the same conversation. */
export async function reviseTask(id: string, feedback: string) {
  const task = await getTask(id);
  if (!task) throw new Error("Task not found");
  const messages = [...(task.messages as Msg[])];
  const last = messages[messages.length - 1];
  const canContinue =
    task.status === "done" &&
    last?.role === "assistant" &&
    !(Array.isArray(last.content) && last.content.some((b) => b.type === "tool_use"));

  const steps = [...task.steps, step("user", `Revision requested: ${feedback}`)];
  if (canContinue) {
    messages.push({ role: "user", content: `Revise your result based on this feedback:\n\n${feedback}` });
    await save(id, { steps, messages, status: "queued", approved_at: null, pending_action: null });
  } else {
    // Conversation can't be continued cleanly: start over with the feedback folded in.
    await save(id, {
      steps,
      messages: [],
      result: null,
      status: "queued",
      approved_at: null,
      pending_action: null,
      instructions: `${task.instructions}\n\nOperator feedback on a previous attempt:\n${feedback}`,
    });
  }
}

export async function retryTask(id: string) {
  const task = await getTask(id);
  if (!task) throw new Error("Task not found");
  await save(id, {
    steps: [...task.steps, step("status", "Retry requested — starting fresh")],
    messages: [],
    result: null,
    status: "queued",
    approved_at: null,
    pending_action: null,
  });
}

// ---------------------------------------------------------------- logging

function logContent(steps: Step[], content: Anthropic.Beta.BetaContentBlock[]) {
  for (const b of content) {
    if (b.type === "thinking" && b.thinking.trim()) steps.push(step("thinking", b.thinking));
    else if (b.type === "text" && b.text.trim()) steps.push(step("text", b.text));
    else if (b.type === "server_tool_use" && b.name === "web_search") {
      const q = (b.input as { query?: string })?.query ?? "";
      steps.push(step("search", `Searching: ${q}`));
    } else if (b.type === "web_search_tool_result") {
      if (Array.isArray(b.content)) {
        const hits = b.content.map((r) => ({ title: r.title, url: r.url }));
        steps.push(step("search", `${hits.length} results`, hits));
      } else {
        steps.push(step("error", `Search error: ${b.content.error_code}`));
      }
    } else if (b.type === "tool_use") {
      steps.push(step("tool_call", `${b.name}`, b.input));
    }
  }
}

function summarize(r: ToolResult) {
  const text = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
  return (r.is_error ? "⚠ " : "") + text.slice(0, 500);
}

function errorText(e: unknown) {
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
