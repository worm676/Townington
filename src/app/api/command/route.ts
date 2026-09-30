import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/http";
import { makeKick } from "@/lib/kick";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

const Body = z.object({ goal: z.string().trim().min(3).max(5000) });

/** Give Chief a goal in plain English. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Describe the goal in a few words.");
  const { goal } = parsed.data;
  try {
    const title = goal.length > 80 ? `${goal.slice(0, 77)}…` : goal;
    const { data, error } = await getServerSupabase()
      .from("tasks")
      .insert({ agent_id: "chief", title, instructions: goal, priority: "high" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const kick = makeKick(req);
    after(() => kick(data.id));
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return fail(e, 500);
  }
}
