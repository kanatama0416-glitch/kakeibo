# kakeibo

同棲用の「ふたり家計」Webアプリです。

## 現在の状態
- GitHub Pages向けフロントエンド
- Supabaseプロジェクト `kakeibo` と接続済み
- 仮の明細・店舗ルール・貸し借り・返済データをSupabaseに登録済み
- ホームの精算額は「共同生活費の実支払差額 + 貸し借り + 初期費用返済」で計算
- 未分類明細を分類するとSupabaseの仮データにも反映
- 月額返済額の変更もSupabaseの仮データへ反映

## セキュリティ
現段階ではUI検証のため、`is_demo = true` の仮データだけを匿名ユーザーからアクセス可能にしています。
本物の家計・カード利用情報を入れる前に、Supabase Authと「2人だけがアクセスできるRLS」へ切り替えます。

公開クライアントにはSupabaseのpublishable keyだけを置いています。
secret key / service_role keyは置かないでください。

## DB
- `categories`: 費目
- `merchant_rules`: 店舗ごとの分類ルール
- `transactions`: 支出明細
- `loans`: 貸し借り
- `repayment_plans`: 初期費用などの返済計画
- `repayments`: 返済履歴

## 次に実装するもの
1. Supabase Auth（あなた・彼氏の2人だけ）
2. household / household_membersによる共有家計の権限制御
3. エポス利用通知メール取込
4. 店舗名正規化
5. 返金・キャンセル
