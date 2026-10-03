# kakeibo 作業ルール

- このリポジトリのコード（HTML / JS / CSS / SQL / migration）を変更するときは、依頼文に明示がなくても必ず `app-verification` スキルを読み込み、その手順に従う。
  - 実装前に受け入れ基準を示して合意する。
  - 実装後は基準ごとに実際に動かして確認し、証拠付きの検証結果で報告する。
  - 合意した基準はリポジトリ直下の `acceptance.md` に追記し、次回以降の回帰確認に使う。
- 画面の確認は `test/index.html`（テストモード）を使う。`index.html` を変更したら `test/index.html` にも同じ変更を反映する。
- `index.html` の `app.js` / `styles.css` を変更したら、読み込みURLの `?v=` を更新してキャッシュを切り替える。
- 運用ルールとDBの扱いは `README.md` を正とする。
