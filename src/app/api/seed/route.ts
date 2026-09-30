import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { DEMO_TASKS } from "@/lib/seed";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Insert one queued demo task per agent. They run when you press "Run queue". */
export async function POST() {
  try {
    const { data, error } = await getServerSupabase().from("tasks").insert([...DEMO_TASKS]).select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ inserted: data.length }, { status: 201 });
  } catch (e) {
    return fail(e, 500);
  }
}
