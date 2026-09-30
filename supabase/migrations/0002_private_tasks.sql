-- Make tasks private: only the server (service role key, behind the app
-- password) can read or write. The browser no longer reads Supabase directly.
drop policy if exists "tasks readable" on public.tasks;
revoke all on public.tasks from anon, authenticated;
