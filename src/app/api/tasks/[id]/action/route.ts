import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/http";
import { makeKick } from "@/lib/kick";
import { approveTask, retryTask, reviseTask } from "@/lib/runner";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("revise"), feedback: z.string().trim().min(1) }),
  z.object({ action: z.literal("retry") }),
]);

/** Approve / Revise / Retry a task from the feed. */
export async function POST(req: Request, ctx: RouteContext<"/api/tasks/[id]/action">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid action");
  try {
    const body = parsed.data;
    if (body.action === "approve") {
      await approveTask(id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "revise") await reviseTask(id, body.feedback);
    else await retryTask(id);
    const kick = makeKick(req);
    after(() => kick(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
