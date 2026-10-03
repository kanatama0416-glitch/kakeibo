# kakeibo

同棲用の「ふたり家計」Webアプリです。

## 現在の構成

- GitHub Pages で配信する静的フロントエンド
- Supabase Auth + RLS で許可されたユーザーだけが家計データへアクセス
- 支出の手入力・全項目編集・削除
- エポス / 楽天カードの PDF・CSV 明細取込
- 未分類明細の確認、自動分類ルール、「毎回確認」ルール
- 月次精算、翌月繰越、立替金と返済
- 返金・取消をマイナス金額で記録
- 操作した人と日時を含む変更履歴
- 月別 / 費目別の分析

## 運用ルール

- 家計運用開始月は **2026年10月**。
- 返済も **2026年10月分から**開始する。
- 運用開始前のカード明細は取込対象外。
- 自動分類ルールがないカード明細は「未分類」で保存し、分類確定後に精算額へ反映する。
- 共用カードはなく、個人カードで共同費も払う。明細画面では取り込んだ明細を「共同」か「対象外（個人の買い物）」に仕分ける。対象外は精算・集計に含めず、個人支出の管理はしない（DB上は支払者に合わせて mine / partner で保存）。
- 店舗ルールが「毎回確認」の明細も自動確定せず、未分類で保存する。
- 精算済み月の金額・日付・支払者・支出区分・繰越・返済額はロックする。修正するときは、先に翌月画面から「支払済みを取り消す」。
- 精算済み履歴がある状態では共同費の基本負担率を変更しない。
- 楽天Gmail自動取込は廃止済み。カード明細は PDF / CSV から取り込む。

## DB

本番DBは Supabase の migration を正とします。

現在は、RLS、監査ログ、月次精算RPC、精算済み月の更新ロック、立替金と返済計画の整合性維持をDB側でも行います。

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

## セキュリティ

ブラウザには Supabase publishable key だけを置き、secret / service_role key は置きません。

家計データは authenticated ユーザーに対する RLS と許可ユーザー一覧で保護します。
