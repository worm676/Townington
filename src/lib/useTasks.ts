"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "./types";

const POLL_MS = 2500;
const listeners = new Set<() => void>();

/** Ask every useTasks instance to refresh now (called after any action). */
export function refreshTasks() {
  listeners.forEach((l) => l());
}

/**
 * All tasks, kept fresh by polling the password-protected /api/tasks route.
 * (The database is not readable from the browser, so nothing is exposed
 * without the app password.)
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await fetch("/api/tasks", { cache: "no-store" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
      setTasks(data as Task[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    listeners.add(load);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(load);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

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
  refreshTasks();
  return data as T;
}
