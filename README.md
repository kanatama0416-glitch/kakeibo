# kakeibo

同棲用の「ふたり家計」Webアプリです。

## 現在の構成

- GitHub Pages で配信する静的フロントエンド
- Supabase Auth + RLS で許可されたユーザーだけが家計データへアクセス
- 支出の手入力・全項目編集・削除
- エポス / 楽天カードの PDF・CSV 明細取込
- カード取込ごとの履歴（取込者・日時・対象月・カード・件数・金額）と明細の出自追跡
- 未分類明細の確認、自動分類ルール、「毎回確認」ルール
- 月次精算、翌月繰越、立替金と返済
- 個人間の立替（その月の精算で全額清算）
- 返金・取消をマイナス金額で記録
- 操作した人と日時を含む変更履歴
- 月別 / 費目別の分析

## 運用ルール

- 家計運用開始月は **2026年10月**。
- 返済も **2026年10月分から**開始する。
- 運用開始前（2026年9月以前）の利用分もカード明細から取り込める。ただし精算は2026年10月分から。
- 自動分類ルールがないカード明細は「未分類」で保存し、分類確定後に精算額へ反映する。
- 共用カードはなく、個人カードで共同費も払う。明細画面では取り込んだ明細を「共同」か「対象外（個人の買い物）」に仕分ける。対象外は精算・集計に含めず、個人支出の管理はしない（DB上は支払者に合わせて mine / partner で保存）。
- 個人間の立替（例：にゃちが うーの分を払った）は、支出区分「立替」で登録する（DB上は `scope = 'advance'`、支払った人 = 立て替えた人）。その月の精算に全額を反映し、共同費の合計・負担額・使い道/分析には含めない。店舗ルールには保存しない。長期で返していく立替金（立替・返済画面）とは別物。
- 店舗ルールが「毎回確認」の明細も自動確定せず、未分類で保存する。
- 精算済み月の金額・日付・支払者・支出区分・繰越・返済額はロックする。修正するときは、先に翌月画面から「支払済みを取り消す」。
- 精算済み履歴がある状態では共同費の基本負担率を変更しない。
- 楽天Gmail自動取込は廃止済み。カード明細は PDF / CSV から取り込む。
- 前月分のカード明細がまだ取り込まれていないカードは、ホームにリマインドを表示する（取込履歴の「何月分」で判定。前月分を精算済みにすると消える）。
- 同じファイル内に同じ日・金額・利用先の明細が複数あるときは、別々の利用として両方登録する（登録済みの明細と一致するものだけ重複として外す）。
- 精算額は画面とDB（`private.kakeibo_settlement_breakdown`）の両方で計算し、一致しないときは精算済みにしない。

## DB

本番DBは Supabase の migration を正とします。

現在は、RLS、監査ログ、月次精算RPC、精算済み月の更新ロック、立替金と返済計画の整合性維持をDB側でも行います。カード取込履歴は `cards` / `import_batches` と `transactions.card_id` / `transactions.import_batch_id` で管理します。

`supabase/schema.sql` は初期構築用の古いベースラインで、**schema.sql + migrations だけでは本番を再現できません**。次のオブジェクトは本番DBにだけ存在し、リポジトリに定義がありません。

- テーブル：`monthly_settlements` / `monthly_repayment_amounts` / `audit_logs`
- `repayments.repayment_month` 列と `(repayment_plan_id, repayment_month)` の一意制約
- 関数：`public.kakeibo_undo_settlement_paid`、監査ログ用トリガー関数

本番から現行スキーマを書き出して、ベースラインを置き換えてください（要 Supabase CLI・DBパスワード）。

```sh
supabase login
supabase link --project-ref vcokmkljwxuyiytiqtlc
supabase db dump --schema public,private -f supabase/schema.sql
```

書き出した後に `private.allowed_users` の実メールが含まれていないか確認してからコミットすること。

## コード構成

- `boot.js`：本番 / テスト環境の読み込みを切り替える
- `lib/core.js`・`lib/settlement.js`・`lib/card-import.js`：画面に依存しない計算と判定（精算額、繰越、返済、取込の重複判定、取込状況）
- `app.js`：画面の表示と操作
- `supabase-client.js`：DBへのアクセス（テスト環境では `test/test-db.js` が同じ関数を持つ）
- `test/unit/`：`lib/` の単体テスト（`node --test test/unit/*.test.js`）。GitHub Pages への公開前にも実行される

## メンバー（表示名）

「にゃち / うー」とメールアドレスの対応は `private.allowed_users` の `member_key`（me / partner）と `display_name` に持たせ、`public.kakeibo_members()` で読む。コードにメールアドレスを書かない。

## テスト画面

テスト環境は `index.html?mode=test`（`/test/` からも転送）。本番と同じ `index.html` を使い、`boot.js` が Supabase の代わりに `test/test-db.js` のダミーデータを読み込む。

## セキュリティ

ブラウザには Supabase publishable key だけを置き、secret / service_role key は置きません。

家計データは authenticated ユーザーに対する RLS と許可ユーザー一覧で保護します。
