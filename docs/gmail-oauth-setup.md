# Gmail OAuth セットアップ手順

仕入先メール自動取込（Phase 2）の有効化には Google Cloud Console での
OAuth クライアント作成が必要。コードは全部出来てるので、以下の手順で
クレデンシャルを取得 → Vercel env に投入すれば動きます。

## 1. Google Cloud Console でプロジェクトを作成

1. https://console.cloud.google.com/ にアクセス
2. ヘッダー左の「プロジェクト選択」 → 「新しいプロジェクト」
3. 名前：`felicity-staff` （任意）
4. 作成 → 作成したプロジェクトを選択

## 2. Gmail API を有効化

1. 左メニュー「APIとサービス」 → 「ライブラリ」
2. 検索ボックスに `Gmail API`
3. クリック → 「有効にする」

## 3. OAuth 同意画面を構成

1. 「APIとサービス」 → 「OAuth 同意画面」
2. ユーザータイプ：
   - rkirishima@gmail.com（個人 Gmail）が含まれる場合は **External**（外部）
   - Google Workspace のみで運用なら **Internal**（内部）
3. 続行
4. アプリ情報：
   - アプリ名：`Felicity Staff`
   - ユーザーサポートメール：rkirishima@gmail.com
   - デベロッパーの連絡先：rkirishima@gmail.com
5. 続行
6. スコープ：
   - 「スコープを追加または削除」
   - `https://www.googleapis.com/auth/gmail.readonly` を選択
   - 「更新」
7. 続行
8. テストユーザー（External で testing 状態の場合）：
   - rkirishima@gmail.com を追加
   - info@felicity.cafe を追加
9. 続行 → ダッシュボードに戻る

## 4. OAuth クライアント ID を作成

1. 「APIとサービス」 → 「認証情報」
2. 「+ 認証情報を作成」 → 「OAuth クライアント ID」
3. アプリケーションの種類：**ウェブアプリケーション**
4. 名前：`felicity-staff-web`
5. 承認済みのリダイレクト URI：
   ```
   https://staff.felicity.cafe/api/keiri/gmail/oauth/callback
   ```
   ⚠️ 末尾スラッシュなし・正確にコピー
6. 作成
7. 表示された **クライアント ID** と **クライアント シークレット** をコピー

## 5. Vercel env に追加

felicity-staff Vercel プロジェクト → Settings → Environment Variables：

| Name | Value | Scope |
|---|---|---|
| `GOOGLE_CLIENT_ID` | (取得した Client ID) | Production / Preview / Development |
| `GOOGLE_CLIENT_SECRET` | (取得した Secret) | Production / Preview / Development |
| `ANTHROPIC_API_KEY` | sk-ant-... | Production / Preview / Development |
| `CRON_SECRET` | （ランダム文字列・任意） | Production |

`ANTHROPIC_API_KEY` は Claude API でメール本文を解析するのに使います。
未設定なら抽出は無効化（メールは取得するが payable は作られない）。

## 6. デプロイ

Vercel → Deployments → 最新の deployment → ⋯ → Redeploy

## 7. 接続

1. https://staff.felicity.cafe/admin/keiri/gmail-setup
2. 「📧 rkirishima@gmail.com を接続」 → Google ログイン → 権限承認
3. 戻ってきたら同様に「📧 info@felicity.cafe を接続」
4. 接続済アカウントに両方表示されたら OK

## 8. 仕入先ルールを設定

`gmail-setup` ページの「仕入先メールルール」セクション：
- Moonmade / 泉久食品 / ノコノス は seed 済み（取引先名のみ）
- 各ルールの ✎ で編集 → 送信元メールアドレス or ドメインを設定
  - 例：Moonmade なら `moonmade.jp` または `@moonmade.co.jp` 等
  - 不明なら件名キーワードを使用（取引先名がそのまま件名に出る場合）
- 期日デフォルト（例：30日）も調整可能

## 9. 動作確認

- `/admin/keiri/gmail-setup` の「🔄 今すぐ取り込む」 → 即時実行
- もしくは Vercel cron（30分ごと）を待つ
- 取込結果は `/admin/keiri/payables` に反映 + Telegram 通知

## トラブルシュート

### Q. 「アプリは Google で確認されていません」と出る
External + testing 状態の場合は出ます。「詳細」→「Felicity Staff（安全でないページ）に移動」で進めます。
本番運用するなら「OAuth 同意画面」→「アプリを公開」で verified にする手続きを取れますが、staff app の用途なら testing のままで問題ありません。

### Q. リダイレクトで「redirect_uri_mismatch」エラー
Google Cloud Console の「承認済みのリダイレクト URI」と
`NEXT_PUBLIC_APP_URL` env の組合せが一致してない可能性。
- env `NEXT_PUBLIC_APP_URL` が未設定なら `https://staff.felicity.cafe` が使われる
- Google Cloud の URI が違っていたら直して再保存

### Q. メールが取り込まれない
1. `/admin/keiri/gmail-setup` でアカウントが「🟢 有効」になっているか
2. 仕入先ルールに **email_pattern または subject_pattern** が設定されているか（両方未設定だと取引先名で件名マッチを試みるが、メールが取引先名を件名に含まないと取れない）
3. `🔄 今すぐ取り込む` を押してログ確認（Vercel function logs）
