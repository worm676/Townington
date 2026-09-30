-- Resilience Town schema
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  agent_id        text not null,
  title           text not null,
  instructions    text not null default '',
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date        date,
  status          text not null default 'queued'
                  check (status in ('queued','working','needs_input','done','error')),
  result          text,
  steps           jsonb not null default '[]'::jsonb,
  -- Claude conversation state, stored verbatim so a paused run can resume.
  messages        jsonb not null default '[]'::jsonb,
  -- What the agent is waiting on while status = needs_input:
  -- {"kind":"question","tool_use_id","question"} or
  -- {"kind":"approval","tool_use_id","tool","webhook","payload","summary"}
  pending_action  jsonb,
  approved_at     timestamptz,
  parent_task_id  uuid references public.tasks(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_agent_idx   on public.tasks (agent_id, created_at desc);
create index if not exists tasks_status_idx  on public.tasks (status, created_at);
create index if not exists tasks_parent_idx  on public.tasks (parent_task_id);

create or replace function public.tasks_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.tasks_touch_updated_at();

-- RLS: the browser (anon key) may only read. All writes go through the
-- Next.js API routes, which use the service role key.
alter table public.tasks enable row level security;
drop policy if exists "tasks readable" on public.tasks;
create policy "tasks readable" on public.tasks for select to anon, authenticated using (true);

-- Realtime
alter table public.tasks replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
