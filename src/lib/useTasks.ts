"use client";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "./supabase-browser";
import type { Task } from "./types";

/** All tasks, kept live via Supabase Realtime. */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getBrowserSupabase();
    if (!db) {
      setLoading(false);
      return;
    }
    let alive = true;

    const load = async () => {
      const { data, error } = await db
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!alive) return;
      if (error) setError(error.message);
      else setTasks((data ?? []) as Task[]);
      setLoading(false);
    };

    const channel = db
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        setTasks((prev) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            return prev.filter((t) => t.id !== id);
          }
          const row = payload.new as Task;
          const i = prev.findIndex((t) => t.id === row.id);
          if (i === -1) return [row, ...prev];
          const next = prev.slice();
          next[i] = row;
          return next;
        });
      })
      .subscribe((status) => {
        // Reload on (re)connect so nothing is missed while offline.
        if (status === "SUBSCRIBED") load();
      });

    load();
    return () => {
      alive = false;
      db.removeChannel(channel);
    };
  }, []);

  return { tasks, error, loading };
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`);
  return data as T;
}
