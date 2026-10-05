#!/usr/bin/env node
// index.html から test/index.html（ダミーデータで動くテスト画面）を生成する。
// 本番とテストの画面がずれないよう、test/index.html は手で編集せずこのスクリプトで作る。
//   node scripts/build-test-html.js          … test/index.html を書き出す
//   node scripts/build-test-html.js --check  … 書き出し内容と現在のファイルが違えば失敗する
"use strict";

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var source = fs.readFileSync(path.join(root, "index.html"), "utf8");
var target = path.join(root, "test", "index.html");

function replaceOnce(html, from, to) {
  var count = html.split(from).length - 1;
  if (count !== 1) {
    throw new Error("index.html の想定箇所が見つかりません（" + count + "件）: " + from);
  }
  return html.replace(from, function () { return to; });
}

function versionOf(html, file) {
  var match = html.match(new RegExp("\\./" + file.replace(".", "\\.") + "\\?v=([^\"]+)\""));
  if (!match) throw new Error(file + " のバージョンが見つかりません");
  return match[1];
}

var html = source;

html = replaceOnce(html, "<title>うーにゃち家計</title>", "<title>うーにゃち家計｜テスト環境</title>");

// 画像・CSS・マニフェストは1つ上の階層を参照する。
html = html.replace(/(href|src)="\.\/(apple-touch-icon\.png|manifest\.webmanifest|styles\.css|assets\/)/g, '$1="../$2');

// ログイン画面は使わず、最初からアプリを表示する。
html = replaceOnce(html, '<section id="authGate" class="auth-gate">', '<section id="authGate" class="auth-gate hidden">');
html = replaceOnce(html, '<div id="appShell" class="app-shell hidden">', '<div id="appShell" class="app-shell">');
html = replaceOnce(
  html,
  "\n      <h1>うーにゃち家計</h1>\n",
  '\n      <h1>うーにゃち家計 <small style="font-size:10px;color:#1f7a5a">TEST</small></h1>\n'
);
html = replaceOnce(
  html,
  "    </header>\n\n    <main>",
  "    </header>\n\n" +
  '    <div style="margin:0 16px 8px;padding:9px 12px;border-radius:14px;background:#fff4e3;color:#8a5b16;font-size:11px;font-weight:900;border:1px solid #efdbb8">テスト環境｜10月・11月・12月のダミーデータです。本番DBには保存されません。</div>\n' +
  "    <main>"
);

// 設定：テスト環境へのリンクを「本番へ戻る」にし、ログアウトは出さない。
html = replaceOnce(
  html,
  '<a class="settings-link-row" href="./test/"><span><strong>テスト環境</strong></span><b>›</b></a>',
  '<a class="settings-link-row" href="../"><span><strong>本番へ戻る</strong></span><b>›</b></a>'
);
html = html.replace(/\n\s*<button id="logoutButton"[^\n]*<\/button>/, "");

// スクリプト：Supabase と認証の代わりにダミーDBを読み込む。
var clientVersion = versionOf(source, "supabase-client.js");
var appVersion = versionOf(source, "app.js");
html = replaceOnce(html, '  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n', "");
html = replaceOnce(html, '  <script src="./config.js"></script>\n', "");
html = html.replace(/  <script src="\.\/auth\.js\?v=[^"]+"><\/script>\n/, "");
html = replaceOnce(
  html,
  '  <script src="./supabase-client.js?v=' + clientVersion + '"></script>\n' +
  '  <script src="./app.js?v=' + appVersion + '"></script>\n',
  "  <script>window.KAKEIBO_TEST_MODE = true;</script>\n" +
  '  <script src="./test-db.js?v=' + clientVersion + '"></script>\n' +
  '  <script src="../app.js?v=' + appVersion + '"></script>\n' +
  "  <script>\n" +
  "    window.KakeiboApp.start().catch(function (error) {\n" +
  "      console.error(error);\n" +
  '      alert("テスト環境を起動できませんでした。");\n' +
  "    });\n" +
  "  </script>\n"
);

var header = "<!-- このファイルは scripts/build-test-html.js が index.html から生成します。直接編集しないでください。 -->\n";
html = html.replace(/^<!doctype html>\n/i, function (doctype) { return doctype + header; });

if (process.argv.indexOf("--check") !== -1) {
  var current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== html) {
    console.error("test/index.html が index.html と一致していません。node scripts/build-test-html.js を実行してください。");
    process.exit(1);
  }
  console.log("test/index.html is up to date");
} else {
  fs.writeFileSync(target, html);
  console.log("wrote test/index.html");
}
