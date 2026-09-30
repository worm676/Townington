-- One demo task per agent. Run after the migration (SQL editor or `supabase db seed`).
-- They start as 'queued'; press "Run queue" in the top bar to process them.
insert into public.tasks (agent_id, title, instructions, priority) values
  ('scout',   'Competitor snapshot: B2B growth-infrastructure agencies',
   'Find 5 companies that sell done-for-you sales + delivery infrastructure to small businesses. For each: offer, pricing signals, positioning, and one gap we can exploit. Finish with a 5-bullet summary.', 'high'),
  ('closer',  'Cold outreach sequence for HVAC owners',
   'Draft a 3-email cold sequence (day 0, 3, 7) for owner-operated HVAC companies doing $1–5M/yr, offering Resilience Enterprise''s sales + delivery infrastructure. Short, specific, one CTA each. Draft only — do not send.', 'normal'),
  ('spark',   '30-day LinkedIn content plan',
   'Create a 30-day LinkedIn plan for Jhonathon (business owner) positioning Resilience Enterprise as the infrastructure partner for scaling service businesses. Include themes, 12 post hooks, and 3 full example posts.', 'normal'),
  ('builder', 'Client onboarding SOP',
   'Write a client onboarding SOP for a new infrastructure client: kickoff checklist, access/credentials collection, first 14-day milestones, owners per step, and a simple RACI.', 'normal'),
  ('keeper',  'Log demo lead to CRM',
   'Prepare a CRM contact for: Dana Ortiz, Ortiz Plumbing, dana@example.com, stage "New Lead", note "Met at chamber mixer, wants follow-up next week". Push it via the CRM webhook (this will wait for approval).', 'low'),
  ('chief',   'Launch plan: land 5 new clients this month',
   'Goal: land 5 new infrastructure clients this month. Break this into concrete subtasks for the team (research, outreach, content, delivery readiness) and assign them.', 'high');
