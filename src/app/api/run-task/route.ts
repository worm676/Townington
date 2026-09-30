import { after, NextResponse } from "next/server";
import { makeKick } from "@/lib/kick";
import { runTask } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST { taskId? } — run that queued task, or the oldest queued task.
 * POST { all: true } — start every queued task.
 * Responds 202 right away; the agent loop runs after the response.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { taskId?: string; all?: boolean };
  const kick = makeKick(req);

  if (body.all) {
    const { getServerSupabase } = await import("@/lib/supabase-server");
    const { data, error } = await getServerSupabase().from("tasks").select("id").eq("status", "queued");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    after(async () => {
      await Promise.all((data ?? []).map((t) => kick(t.id as string)));
    });
    return NextResponse.json({ started: (data ?? []).length }, { status: 202 });
  }

  after(async () => {
    try {
      await runTask(body.taskId, kick);
    } catch (e) {
      console.error("runTask failed", e);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
