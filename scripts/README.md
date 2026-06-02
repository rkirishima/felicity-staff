# scripts

## keiri-reminder.mjs

毎月3日 09:00 JST に前月分の経理CSVダウンロードを促す Telegram リマインダー。
Mac mini の crontab から起動。

### セットアップ

1. `.env` に以下を設定（既存ファイルがあれば追記）

   ```env
   # Telegram bot (Doug の既存 bot を再利用)。@BotFather で取得。
   TELEGRAM_BOT_TOKEN=
   # 自分のchat_id。@userinfobot で取得（Telegram で /start を送ると返ってくる ID）。
   TELEGRAM_CHAT_ID=
   ```

2. 手動実行で動作確認

   ```bash
   cd ~/Projects/felicity-web/doug  # スクリプトを配置したディレクトリへ
   node --env-file=.env scripts/keiri-reminder.mjs
   ```

   Telegram に届けば OK。`sent: message_id=...` がログに出る。

   ⚠️ `--env-file` は Node 20.6+ 必須。`node -v` で確認、古ければ `nvm install 20`。

### crontab 登録

確認コマンド：

```bash
which node              # node の絶対パス（cron は PATH を引き継がない）
date                    # タイムゾーン確認。"JST" が出るか
```

`crontab -e` でこの1行を追加（パスを差し替える）：

```cron
0 9 3 * * cd /Users/<MACユーザー名>/Projects/felicity-web/doug && /usr/local/bin/node --env-file=.env scripts/keiri-reminder.mjs >> /tmp/keiri-reminder.log 2>&1
```

- `<MACユーザー名>` は `echo $HOME` で確認した値
- `/usr/local/bin/node` は `which node` の結果に差し替え

### Mac の cron が JST じゃないとき

```bash
sudo systemsetup -settimezone Asia/Tokyo
```

または crontab エントリ先頭に `TZ=Asia/Tokyo` を追加：

```cron
TZ=Asia/Tokyo
0 9 3 * * cd ... && ...
```
