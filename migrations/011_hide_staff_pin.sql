-- staff.pin を公開キー(anon)とログインユーザー(authenticated)から見えなくする
--
-- anon キーはブラウザに配られている。これまで staff テーブルは anon に全列
-- 開いていたため、だれでも全スタッフの PIN を読めて、管理画面にも入れた。
--
-- PIN の照合・変更は app/admin/actions.ts から service role で行うように
-- 変更済み（service role は列の権限に関係なく読める）。ブラウザ側のコードは
-- pin 列を一切使っていないので、pin 以外の列はこれまでどおり読み書きできる
-- ようにして、画面の挙動は変えない。
--
-- 注意: 列単位で権限を付けているので、staff に列を追加したときは下の GRANT
-- にも足すこと（足さないと anon から見えない）。select('*') は pin が含まれる
-- ため失敗する — 必要な列を列挙すること。

REVOKE SELECT, INSERT, UPDATE ON public.staff FROM anon, authenticated;

GRANT SELECT (
  id, name, line_user_id, role, avatar_url, hourly_rate, employment_type,
  active, created_at, skill, max_days_per_month, fixed_days,
  salary_start_date, payment_method
) ON public.staff TO anon, authenticated;

GRANT INSERT (
  id, name, line_user_id, role, avatar_url, hourly_rate, employment_type,
  active, created_at, skill, max_days_per_month, fixed_days,
  salary_start_date, payment_method
) ON public.staff TO anon, authenticated;

GRANT UPDATE (
  name, line_user_id, role, avatar_url, hourly_rate, employment_type,
  active, skill, max_days_per_month, fixed_days,
  salary_start_date, payment_method
) ON public.staff TO anon, authenticated;
