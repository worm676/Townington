# Resilience Town

A 3D command center for Resilience Enterprise. You assign work to AI agents, and each agent walks to its building, does the work with Claude, and walks back to the plaza when it's finished.

- **Stack:** Next.js 16 (App Router, TypeScript), React Three Fiber and drei, Tailwind v4, Supabase (Postgres), and the Anthropic Claude API.
- **Private by design:** the whole app sits behind one login (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`). The browser never talks to Supabase directly, and the database is locked to the server's secret key.
- **No external assets:** every building and character is built from primitive shapes, so it runs out of the box.

## The team

| Agent | Role | Building | Tools |
|---|---|---|---|
| Chief | Orchestrator: splits a goal into subtasks | HQ | create_subtask, ask_user |
| Scout | Research: market, competitor and lead research | Research Library | web_search, ask_user |
| Closer | Sales: outreach, follow-ups, proposals | Sales Office | web_search, ask_user, call_webhook(EMAIL) |
| Spark | Marketing: content, ad copy, campaigns | Marketing Studio | web_search, ask_user |
| Builder | Delivery: onboarding checklists, SOPs, plans | Delivery Workshop | ask_user |
| Keeper | CRM: contacts, notes and pipeline updates to GHL/n8n | CRM Vault | call_webhook(CRM), ask_user |

All agents are defined in `src/lib/agents.ts`. To add one, append an entry with a name, role, color, building style, tools and system prompt. The town places its building automatically.

**Status ring colors:**
- grey: idle
- blue: working or queued
- green: done
- amber: needs you
- red: error

**Safety rule:** every `call_webhook` (sending email, writing to the CRM) pauses the task until you click **Approve & send**. Nothing leaves the app without your click.

## Setup (about 10 minutes)

1. **Install:**
   ```bash
   npm install
   cp .env.example .env.local
   ```
2. **Supabase.** Create a project at supabase.com, then open **SQL Editor** and run these two files in order:
   - `supabase/migrations/0001_resilience_town.sql`: creates the `tasks` table.
   - `supabase/migrations/0002_private_tasks.sql`: locks the table so only the server can read or write it.
   - `supabase/seed.sql`: optional. Adds one demo task per agent. You can also use the **Seed demo tasks** button in the app when the table is empty.
3. **Fill in `.env.local`:**
   - `ANTHROPIC_API_KEY`: from console.anthropic.com
   - `SUPABASE_URL`: from the **Connect** button in Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: the **secret** key from **Project Settings → API Keys**
   - `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`: the login you'll use for the app
   - `N8N_WEBHOOK_CRM`, `N8N_WEBHOOK_EMAIL`: your n8n webhook URLs. They're optional, and a call to a webhook that isn't set returns an error to the agent.
4. **Run:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Using it

- **Click an agent** (or a name chip at the bottom). The camera focuses on it and the side panel opens. Fill in a title, instructions, priority and an optional due date, then click **Assign**. The task starts immediately.
- **Command bar:** type a goal in plain English. Chief breaks it into subtasks for the other agents, and those run in parallel.
- **Task feed:** the left drawer shows every task. Tasks that need you float to the top. Expand a task to see its step log (thinking, searches, tool calls) and its result.
- **Needs you (amber):**
  - If an agent asked a question, answer it in the card.
  - If an agent wants to call a webhook, check the payload, then click **Approve & send** or **Decline** (optionally with a reason).
- **Approve / Revise / Retry:**
  - **Approve** marks a finished result as accepted.
  - **Revise** sends feedback, and the agent continues the same conversation.
  - **Retry** starts the task over from scratch.
- **Run queue** starts every queued task, for example the seeded demo tasks.

## How it works

```
Browser (R3F town + panels) ── polls GET /api/tasks every 2.5s (behind the login)
   │ POST /api/tasks, /api/command, /api/tasks/:id/respond|action
   ▼
Next.js API (service role) ── inserts/updates tasks
   │ POST /api/run-task {taskId}  → 202, work continues in after()
   ▼
Agent loop (src/lib/runner.ts)
   Claude (claude-opus-5-5, adaptive thinking, streaming)
   ├─ web_search      Anthropic server tool
   ├─ ask_user        → status=needs_input, pauses
   ├─ call_webhook    → status=needs_input until you approve, then POSTs to N8N_WEBHOOK_<NAME>
   └─ create_subtask  Chief only; inserts child task and starts it
   Every turn is written to tasks.steps; final Markdown to tasks.result.
```

- **Pause and resume:** the full Claude conversation is stored in `tasks.messages`. When a task pauses for you, the serverless function exits. Your reply appends the tool result, and a fresh run picks up where the task left off.
- **Long tasks:** after about 4 minutes, a task hands itself off to a new function call, so it stays under Vercel's time limit.
- **Refusal fallback:** requests use Anthropic's server-side fallback (`fallbacks: "default"`). If the model declines a request, a suitable fallback model retries it within the same call.
- **Changing the model:** set `ANTHROPIC_MODEL` to change the model for every agent. The default is `claude-opus-5-5`.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel. The framework is detected automatically.
2. Add every variable from `.env.example` under **Settings → Environment Variables**.
3. **Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`.** On production the site stays locked until both are set.
4. **Deployment Protection:** if you turn on Vercel Authentication for production, the app can't call its own `/api/run-task`. Use the Basic Auth above instead, or add a protection bypass.
5. `/api/run-task` sets `maxDuration = 300`. On the Hobby plan that's the cap, and the runner's hand-off keeps longer tasks going.

## Project map

```
src/lib/agents.ts          agent roster (edit this to add agents)
src/lib/runner.ts          Claude agent loop, tools, pause/resume, approvals
src/app/api/*              task create, command, run-task, respond, action, seed
src/components/Town.tsx    3D town, buildings, walking agents, camera
src/components/*           top bar, agent panel, task feed, task cards
supabase/migrations/       schema (0001) + privacy lock (0002)
supabase/seed.sql          one demo task per agent
```
