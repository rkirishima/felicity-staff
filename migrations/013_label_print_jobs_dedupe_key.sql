-- レジ(POS)売上ポーリング (/api/cron/pos-label-poll) からの自動投入で、同じ明細を
-- 二重印刷しないためのキー。本番適用済み。
-- 形式: pos:{order_id}:{line_item_uid}。スタッフ/EC の投入は NULL のまま
-- (UNIQUE は NULL 同士を重複扱いしない)。
alter table label_print_jobs add column if not exists dedupe_key text;
alter table label_print_jobs add constraint label_print_jobs_dedupe_key_key unique (dedupe_key);
