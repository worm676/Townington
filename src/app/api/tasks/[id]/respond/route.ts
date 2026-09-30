import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/http";
import { makeKick } from "@/lib/kick";
import { resolvePending } from "@/lib/runner";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), answer: z.string().trim().min(1) }),
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("reject"), feedback: z.string().optional() }),
]);

/** Reply to an agent's ask_user question, or approve/decline a webhook call. */
export async function POST(req: Request, ctx: RouteContext<"/api/tasks/[id]/respond">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid response");
  try {
    const { requeued } = await resolvePending(id, parsed.data);
    if (requeued) {
      const kick = makeKick(req);
      after(() => kick(id));
    }
    return NextResponse.json({ ok: true, requeued });
  } catch (e) {
    return fail(e);
  }
}
