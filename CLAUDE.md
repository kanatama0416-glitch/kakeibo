# kakeibo 作業ルール

- このリポジトリのコード（HTML / JS / CSS / SQL / migration）を変更するときは、依頼文に明示がなくても必ず `app-verification` スキルを読み込み、その手順に従う。
  - 実装前に受け入れ基準を示して合意する。
  - 実装後は基準ごとに実際に動かして確認し、証拠付きの検証結果で報告する。
  - 合意した基準はリポジトリ直下の `acceptance.md` に追記し、次回以降の回帰確認に使う。
- 画面の確認はテスト環境（`index.html?mode=test`、`/test/` からも転送）を使う。本番とテストは同じ `index.html` を使い、環境ごとの違い（読み込むスクリプト、テスト用の表示）は `boot.js` で切り替える。
- `app.js` / `supabase-client.js` / `test/test-db.js` を変更したら `boot.js` の `VERSION` と `index.html` の `boot.js?v=` を、`styles.css` を変更したら `index.html` の `styles.css?v=` を更新してキャッシュを切り替える。
- コードを変更したら、完了報告の前に `code-quality-gate` スキルで変更差分のエラーを探す。`.claude/settings.json` のフック（`.claude/hooks/quality-gate.js`）が、構文・単体テスト・秘密鍵・キャッシュ切り替えの更新漏れを機械チェックし、終了前にこのレビューを求める。
- 運用ルールとDBの扱いは `README.md` を正とする。
- 精算の計算・取込の判定など画面に依存しない処理は `lib/` に置き、`test/unit/` に単体テストを書く（`node --test test/unit/*.test.js`、公開時にも実行）。精算の計算を変えるときは DB の `private.kakeibo_settlement_breakdown()` も同じ計算に直す。
