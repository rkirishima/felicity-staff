-- ラベルプリンタ「本体」(Brother QL-820NWB) の不達を追跡する列。本番適用済み。
--
-- 既存の last_seen / alerted は Pi (Raspberry Pi) の生死だけを見ていたため、
-- Pi は正常稼働しているのにプリンタ本体に届かず1枚も印刷されない状態が
-- 監視から完全に漏れていた (2026-09-30 に実際に発生。半日気づかなかった)。
--
-- printer_unreachable_since: printer_reachable=false が続き始めた時刻。
--   印刷中はポート9100が埋まって health が一時的に false を返すことがあるため、
--   一定時間継続したかどうかを監視cronがこの列で判定する。
-- printer_alerted: 本体不達のTelegram通知を送信済みか (重複通知防止)。
alter table label_printer_status
  add column if not exists printer_unreachable_since timestamptz,
  add column if not exists printer_alerted boolean not null default false;
