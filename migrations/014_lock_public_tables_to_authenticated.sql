-- 適用済み (Supabase MCP apply_migration: lock_public_tables_to_authenticated, 2026-11-25)
--
-- 公開キー(anon)はブラウザに配られているため、RLS のないテーブルは誰でも
-- 読み書きできていた（staff / timeclock / keiri_* など 62 テーブル）。
-- ブラウザは DB 通行証（authenticated, lib/auth/db-pass.ts）経由、
-- cron / Pi / Doug は service role なので、authenticated のみ許可にしても影響なし。
-- 新しいテーブルを作ったら同じく RLS + authenticated ポリシーを付けること。

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('CREATE POLICY staff_app_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.relname);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'inv\_%' AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER VIEW public.inv_latest_status SET (security_invoker = true);
ALTER VIEW public.inv_order_list SET (security_invoker = true);
ALTER VIEW public.inv_due_checks SET (security_invoker = true);
ALTER VIEW public.inv_menu_forecast_next7 SET (security_invoker = true);
