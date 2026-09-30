// Keep in sync with supabase/seed.sql.
export const DEMO_TASKS = [
  {
    agent_id: "scout",
    title: "Competitor snapshot: B2B growth-infrastructure agencies",
    instructions:
      "Find 5 companies that sell done-for-you sales + delivery infrastructure to small businesses. For each: offer, pricing signals, positioning, and one gap we can exploit. Finish with a 5-bullet summary.",
    priority: "high",
  },
  {
    agent_id: "closer",
    title: "Cold outreach sequence for HVAC owners",
    instructions:
      "Draft a 3-email cold sequence (day 0, 3, 7) for owner-operated HVAC companies doing $1–5M/yr, offering Resilience Enterprise's sales + delivery infrastructure. Short, specific, one CTA each. Draft only — do not send.",
    priority: "normal",
  },
  {
    agent_id: "spark",
    title: "30-day LinkedIn content plan",
    instructions:
      "Create a 30-day LinkedIn plan for Jhonathon (business owner) positioning Resilience Enterprise as the infrastructure partner for scaling service businesses. Include themes, 12 post hooks, and 3 full example posts.",
    priority: "normal",
  },
  {
    agent_id: "builder",
    title: "Client onboarding SOP",
    instructions:
      "Write a client onboarding SOP for a new infrastructure client: kickoff checklist, access/credentials collection, first 14-day milestones, owners per step, and a simple RACI.",
    priority: "normal",
  },
  {
    agent_id: "keeper",
    title: "Log demo lead to CRM",
    instructions:
      'Prepare a CRM contact for: Dana Ortiz, Ortiz Plumbing, dana@example.com, stage "New Lead", note "Met at chamber mixer, wants follow-up next week". Push it via the CRM webhook (this will wait for approval).',
    priority: "low",
  },
  {
    agent_id: "chief",
    title: "Launch plan: land 5 new clients this month",
    instructions:
      "Goal: land 5 new infrastructure clients this month. Break this into concrete subtasks for the team (research, outreach, content, delivery readiness) and assign them.",
    priority: "high",
  },
] as const;
