import "server-only";
import type { Kick } from "./runner";

/**
 * Start a task in its own serverless invocation by calling /api/run-task.
 * That route answers 202 immediately and runs the agent in `after()`, so each
 * task gets its own function time budget.
 */
export function makeKick(req: Request): Kick {
  const origin = new URL(req.url).origin;
  const auth = req.headers.get("authorization");
  return async (taskId: string) => {
    try {
      await fetch(`${origin}/api/run-task`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify({ taskId }),
      });
    } catch (e) {
      console.error("kick failed", taskId, e);
    }
  };
}
