import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Forgive common paste mistakes: whole "NAME=value" lines, quotes, spaces, trailing slashes. */
function clean(v: string | undefined) {
  if (!v) return "";
  let s = v.trim();
  const eq = s.match(/^[A-Z0-9_]+=(.*)$/);
  if (eq) s = eq[1].trim();
  return s.replace(/^['"]|['"]$/g, "").trim();
}

function supabaseUrl() {
  let url = clean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
  // A bare project ID ("abcd1234") becomes its supabase.co URL.
  if (/^https:\/\/[a-z0-9]{15,30}$/.test(url)) url = `${url}.supabase.co`;
  return url;
}

export function getServerSupabase(): SupabaseClient {
  const url = supabaseUrl();
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url) throw new Error("SUPABASE_URL is not set in Vercel");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in Vercel");
  try {
    new URL(url);
  } catch {
    throw new Error(`SUPABASE_URL should look like https://abcd1234.supabase.co (it starts with "${url.slice(0, 12)}…")`);
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
