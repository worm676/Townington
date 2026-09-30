import { after, NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_BY_ID } from "@/lib/agents";
import { fail } from "@/lib/http";
import { makeKick } from "@/lib/kick";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

const Body = z.object({
  agent_id: z.string().refine((id) => id in AGENT_BY_ID, "Unknown agent"),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(20000).default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  autorun: z.boolean().default(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const { autorun, ...row } = parsed.data;
  try {
    const { data, error } = await getServerSupabase()
      .from("tasks")
      .insert({ ...row, due_date: row.due_date || null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (autorun) {
      const kick = makeKick(req);
      after(() => kick(data.id));
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return fail(e, 500);
  }
}
