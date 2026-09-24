# 楽天カード Gmail 自動取込

楽天カードの確定版「カード利用のお知らせ(本人ご利用分)」をGmailから読み取り、Supabaseの家計簿へ自動登録します。

## 構成

Gmail  
→ Google Apps Script  
→ 楽天カード確定メールを解析  
→ Supabase Edge Function \`import-rakuten-gmail\`  
→ \`transactions\`

速報版は店舗名がないため取り込みません。確定版が届いた時点で登録します。

1通に複数明細がある場合も1明細ずつ分割します。

## 初回設定

1. https://script.google.com/create で新しいApps Scriptを作る
2. \`Code.gs\` の内容を貼り付ける
3. **Project Settings → Script Properties** を開く
4. 次のプロパティを追加
   - Property: \`RAKUTEN_IMPORT_TOKEN\`
   - Value: ChatGPTから受け取った取込トークン
5. \`testLatestRakutenMail\` を実行
6. \`syncRakutenCardEmails\` を実行
7. \`setupHourlyTrigger\` を1回実行

以後は1時間ごとに自動確認します。

## 重複防止

Supabaseで次の組み合わせを一意にしています。

- Gmail message ID
- メール内の明細番号

同じ30日分を毎回検索しても同じ明細は重複しません。

## セキュリティ

- GitHub/Apps ScriptにSupabaseのsecret keyは置きません。
- Apps Scriptには公開可能なpublishable keyだけを置きます。
- 実データを書き込めるのは、非公開の \`RAKUTEN_IMPORT_TOKEN\` が一致したリクエストだけです。
- トークンはGitHubに書かずApps ScriptのScript Propertiesに保存してください。
- Edge Function内部だけがSupabaseのサーバー用secret keyを利用します。
- 実明細は \`is_demo=false\` で保存し、現在の公開デモ画面からは読めません。
