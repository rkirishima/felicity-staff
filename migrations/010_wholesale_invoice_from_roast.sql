-- 焙煎ログから業販請求書を起こすための紐付け
--
-- 旭興産のように毎月継続で、量だけが変わる取引先向け。焙煎した実績から
-- 請求書ドラフトを作り、既存の請求書画面で確認・発行する。
--
-- 焙煎画面（app/admin/roast）側は触らない。どの焙煎が誰向けだったかは、
-- 請求書を作った時点で roast_logs.wholesale_invoice_id に記録される。

-- 1) 業販アカウント → 経理の取引先。請求書の宛先を引くため。
ALTER TABLE wholesale_accounts
  ADD COLUMN IF NOT EXISTS keiri_client_id uuid REFERENCES keiri_clients(id);

COMMENT ON COLUMN wholesale_accounts.keiri_client_id IS
  '請求書の宛先になる keiri_clients。請求書払いの取引先のみ設定する。';

UPDATE wholesale_accounts
SET keiri_client_id = 'cd11aa4e-57f1-4ef8-b6e3-1ff266a541d7'
WHERE code = 'ASAHIKOSAN';

-- 2) 焙煎の豆 → 業販カタログの銘柄。単価を引くため。
ALTER TABLE roast_beans
  ADD COLUMN IF NOT EXISTS wholesale_slug text;

COMMENT ON COLUMN roast_beans.wholesale_slug IS
  '業販カタログ(app/lib/wholesale.ts の WHOLESALE_BEANS)の slug。業販で売らない豆は NULL。';

UPDATE roast_beans SET wholesale_slug = 'png-baroida'             WHERE id = 'PNG_BAROIDA_WASHED';
UPDATE roast_beans SET wholesale_slug = 'ethiopia-yirgacheffe-g1' WHERE id = 'ETH_YIRGACHEFFE_G1';
UPDATE roast_beans SET wholesale_slug = 'tanzania-mwika'          WHERE id = 'TZA_MWIKA';
UPDATE roast_beans SET wholesale_slug = 'guatemala-la-cupula'     WHERE id = 'GTM_LA_CUPULA';
UPDATE roast_beans SET wholesale_slug = 'india-attikan'           WHERE id = 'IND_ATTIKAN';
UPDATE roast_beans SET wholesale_slug = 'el-salvador-la-fany'     WHERE id = 'SLV_FANY_PACAMARA';
UPDATE roast_beans SET wholesale_slug = 'colombia-decaf'          WHERE id = 'COL_DECAFE';
UPDATE roast_beans SET wholesale_slug = 'guatemala-gualvador'     WHERE id = 'GTM_GUALVADOR';
UPDATE roast_beans SET wholesale_slug = 'brazil-santa-alina'      WHERE id = 'BRA_SANTA_ALINA';
UPDATE roast_beans SET wholesale_slug = 'yemen-white-camel-matari' WHERE id = 'YEM_WHITE_CAMEL';
UPDATE roast_beans SET wholesale_slug = 'panama-geisha'           WHERE id = 'PAN_GEISHA';
UPDATE roast_beans SET wholesale_slug = 'brazil-santos'           WHERE id = 'BRA_SANTOS';

-- 3) 請求済みの焙煎に印をつける。同じ焙煎を二重に請求しないため。
ALTER TABLE roast_logs
  ADD COLUMN IF NOT EXISTS wholesale_invoice_id uuid REFERENCES keiri_invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN roast_logs.wholesale_invoice_id IS
  'この焙煎を業販として請求した請求書。NULL なら未請求（自店ぶんを含む）。';

CREATE INDEX IF NOT EXISTS roast_logs_wholesale_invoice_idx
  ON roast_logs (wholesale_invoice_id);
