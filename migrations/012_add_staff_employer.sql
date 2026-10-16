-- スタッフの「雇用主体（所属）」を追加する。
--
-- 背景: KATSUO は今後 FELICITY COFFEE ROASTERS (FCR) で雇用する。シフトアプリ
-- 側の表示・勤怠はこれまで通り（＝所属に関係なく全員同じシフト表に出る）だが、
-- 会計上は所属別に人件費を分けて集計したい。そのための区分列。
--
-- 値は 'cafe'（Felicity Cafe、既定）か 'fcr'（FELICITY COFFEE ROASTERS）。
-- 既存スタッフは全員 'cafe' になる（KATSUO のみ別途 'fcr' に更新する）。
alter table public.staff
  add column if not exists employer text not null default 'cafe'
    check (employer in ('cafe', 'fcr'));

comment on column public.staff.employer is
  '会計上の雇用主体（所属）: cafe = Felicity Cafe（既定） / fcr = FELICITY COFFEE ROASTERS。シフト表示や勤怠には影響せず、給与集計を所属別に分けるためだけに使う。';

-- 011 で staff は列単位 GRANT に切り替えたので、追加列は明示的に許可しないと
-- anon / authenticated（ブラウザ）から読めない・更新できない。
GRANT SELECT (employer) ON public.staff TO anon, authenticated;
GRANT INSERT (employer) ON public.staff TO anon, authenticated;
GRANT UPDATE (employer) ON public.staff TO anon, authenticated;
