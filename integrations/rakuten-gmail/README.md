# 楽天カード Gmail 自動取込

楽天カードの「カード利用のお知らせ(本人ご利用分)」確定メールをGmailから読み取り、Supabaseの \`transactions\` へ自動登録します。

## 仕組み

Gmail  
→ Google Apps Script  
→ 楽天カード確定メールを解析  
→ Supabase RPC  
→ \`transactions\`

速報版は店舗名がないため取り込みません。確定版が届いた時点で登録します。

1通に複数明細がある場合も、1明細ずつ分割して保存します。

## 初回設定

1. https://script.google.com/create で新しいApps Scriptを作る
2. \`Code.gs\` の内容を貼り付ける
3. Apps Scriptの **Project Settings → Script Properties** を開く
4. 次のプロパティを追加する
   - Property: \`RAKUTEN_IMPORT_TOKEN\`
   - Value: ChatGPTから受け取った取込トークン
5. 関数 \`testLatestRakutenMail\` を実行して解析結果を確認
6. 関数 \`syncRakutenCardEmails\` を1回実行してSupabaseへの接続を確認
7. 関数 \`setupHourlyTrigger\` を1回実行

以後は1時間ごとに自動確認します。

## 重複防止

Supabase側で次の組み合わせを一意にしています。

- Gmail message ID
- メール内の明細番号

同じメールを何度読んでも同じ明細は重複登録されません。

## セキュリティ

- Supabaseのsecret/service-roleキーはApps ScriptにもGitHubにも置いていません。
- 公開可能なpublishable key + 非公開の取込トークンを使います。
- 取込トークンはGitHubに書かず、Apps ScriptのScript Propertiesだけに保存してください。
- 現在の実明細は \`is_demo=false\` で保存され、公開中のデモサイトからは読めません。
