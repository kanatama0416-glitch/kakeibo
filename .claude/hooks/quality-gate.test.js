// 品質ゲートフックの判定ロジックの単体テスト。実行：node --test .claude/hooks/quality-gate.test.js
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var gate = require("./quality-gate.js");

test("diff から追加行をファイルごとに取り出す", function () {
  var diff = [
    "diff --git a/app.js b/app.js",
    "--- a/app.js",
    "+++ b/app.js",
    "@@ -1 +1 @@",
    "-old",
    "+new line",
    "diff --git a/gone.js b/gone.js",
    "--- a/gone.js",
    "+++ /dev/null",
    "-removed"
  ].join("\n");
  assert.deepEqual(gate.parseAddedLines(diff), { "app.js": ["new line"] });
});

test("秘密鍵の実物は検出し、単語やSQLには反応しない", function () {
  var found = gate.findSecrets({
    "config.js": ["var k = 'sb_secret_abcdefghijklmnop';"],
    "app.js": ["// Never put a service_role key here."],
    "supabase/migrations/x.sql": ["grant select on t to service_role;"],
    "lib/x.js": ["var jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig';"]
  });
  assert.deepEqual(found.map(function (f) { return f.file; }).sort(), ["config.js", "lib/x.js"]);
});

test("app.js を変えて VERSION を上げ忘れたら指摘する", function () {
  var problems = gate.findCacheBustProblems(["app.js"], { "app.js": ["x"] });
  assert.equal(problems.length, 2);
});

test("VERSION と boot.js?v= を両方更新していれば指摘しない", function () {
  var problems = gate.findCacheBustProblems(["app.js", "boot.js", "index.html"], {
    "boot.js": ['  var VERSION = "20261007-A";'],
    "index.html": ['  <script src="./boot.js?v=20261007-A"></script>']
  });
  assert.deepEqual(problems, []);
});

test("styles.css を変えて styles.css?v= を上げ忘れたら指摘する", function () {
  assert.equal(gate.findCacheBustProblems(["styles.css"], {}).length, 1);
});

test("機械チェック失敗 → 止める、上限を超えたら警告して通す", function () {
  var state = {};
  for (var i = 1; i <= gate.MAX_FAIL_BLOCKS; i++) {
    var d = gate.decideStop(["err"], state, "h1");
    assert.equal(d.action, "block");
    state = d.state;
  }
  var last = gate.decideStop(["err"], state, "h1");
  assert.equal(last.action, "warn");
  assert.equal(gate.decideStop([], last.state, "h1").action, "allow");
});

test("機械チェック通過 → 1回だけレビューを求め、次は通す。同じ変更では二度止めない", function () {
  var first = gate.decideStop([], {}, "h1");
  assert.equal(first.action, "block");
  var second = gate.decideStop([], first.state, "h2");
  assert.equal(second.action, "allow");
  assert.equal(gate.decideStop([], second.state, "h2").action, "allow");
  assert.equal(gate.decideStop([], second.state, "h3").action, "block");
});
