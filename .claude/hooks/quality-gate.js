#!/usr/bin/env node
// Claude Code フック：コード品質ゲート
//
// 使い方（.claude/settings.json から呼ばれる）
//   node quality-gate.js session-start  … セッション開始時の HEAD を記録する
//   node quality-gate.js post-edit      … 編集した JS ファイルの構文を即チェックする
//   node quality-gate.js stop           … 終了前に、変更差分へ機械チェックをかける
//
// stop の流れ
//   1. セッション開始以降の変更（コミット済みを含む）に、コード（js/html/css/sql）がなければ何もしない
//   2. 機械チェックが失敗 → 終了を止め、失敗内容を Claude に返して直させる（3回まで）
//   3. 機械チェックが通過 → 1回だけ終了を止め、code-quality-gate スキルでのレビューと報告を求める
//   4. 同じ変更内容に対しては二度止めない
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var childProcess = require("child_process");

var CODE_EXTENSIONS = [".js", ".html", ".css", ".sql"];
// 機械チェックの失敗で終了を止める上限。これを超えたら止めずに利用者へ警告だけ出す（無限ループ防止）。
var MAX_FAIL_BLOCKS = 3;
var STATE_FILE_NAME = "claude-quality-gate.json";

// 秘密情報の検出パターン。鍵の実物だけを狙い、「service_role」という単語（コメントや SQL のロール名）では反応させない。
// 旧形式の service_role キーは JWT で、本文に "service_role" を base64 化した c2VydmljZV9yb2xl を含む。
var SECRET_PATTERNS = [
  { label: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { label: "Supabase service_role キー（JWT）", re: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl/ },
  { label: "API 秘密鍵（sk-）", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: "秘密鍵ブロック", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];
var SECRET_SCAN_EXTENSIONS = [".js", ".html", ".css"];

// CLAUDE.md のキャッシュ切り替えルール：これらを変えたら boot.js の VERSION と index.html の boot.js?v= を更新する。
var BOOT_VERSION_TRIGGERS = ["app.js", "supabase-client.js", "test/test-db.js"];

// ---------- 純粋関数（単体テスト対象） ----------

// diff の追加行から秘密情報らしき文字列を探す。戻り値：[{ file, label }]
function findSecrets(addedLinesByFile) {
  var found = [];
  Object.keys(addedLinesByFile).forEach(function (file) {
    if (SECRET_SCAN_EXTENSIONS.indexOf(path.extname(file)) === -1) return;
    var text = addedLinesByFile[file].join("\n");
    SECRET_PATTERNS.forEach(function (p) {
      if (p.re.test(text)) found.push({ file: file, label: p.label });
    });
  });
  return found;
}

// キャッシュ切り替えの更新漏れを探す。changedFiles：変更ファイル一覧、addedLinesByFile：ファイルごとの追加行
function findCacheBustProblems(changedFiles, addedLinesByFile) {
  var problems = [];
  var added = function (file) { return (addedLinesByFile[file] || []).join("\n"); };
  var bootTriggered = BOOT_VERSION_TRIGGERS.filter(function (f) { return changedFiles.indexOf(f) !== -1; });
  if (bootTriggered.length > 0) {
    if (!/VERSION/.test(added("boot.js"))) {
      problems.push(bootTriggered.join(", ") + " を変更したが boot.js の VERSION が更新されていない");
    }
    if (!/boot\.js\?v=/.test(added("index.html"))) {
      problems.push(bootTriggered.join(", ") + " を変更したが index.html の boot.js?v= が更新されていない");
    }
  }
  if (changedFiles.indexOf("styles.css") !== -1 && !/styles\.css\?v=/.test(added("index.html"))) {
    problems.push("styles.css を変更したが index.html の styles.css?v= が更新されていない");
  }
  return problems;
}

// unified diff（git diff -U0）をファイルごとの追加行に分解する
function parseAddedLines(diffText) {
  var result = {};
  var current = null;
  diffText.split("\n").forEach(function (line) {
    var header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) { current = header[1]; result[current] = result[current] || []; return; }
    if (/^\+\+\+ /.test(line)) { current = null; return; }
    if (current && line.charAt(0) === "+") result[current].push(line.slice(1));
  });
  return result;
}

function isCodeFile(file) {
  return CODE_EXTENSIONS.indexOf(path.extname(file)) !== -1;
}

// 次に何をするかを決める。checkFailures：機械チェックの失敗一覧、state：保存済みの状態、hash：今の変更内容のハッシュ
// 戻り値：{ action: "allow" | "block" | "warn", message, state }
function decideStop(checkFailures, state, hash) {
  var next = Object.assign({}, state);
  if (state.reviewedHash === hash) return { action: "allow", state: next };

  if (checkFailures.length > 0) {
    next.failStreak = (state.failStreak || 0) + 1;
    if (next.failStreak > MAX_FAIL_BLOCKS) {
      next.failStreak = 0;
      next.reviewedHash = hash;
      return { action: "warn", state: next,
        message: "品質ゲート：" + MAX_FAIL_BLOCKS + "回直しても機械チェックが通っていません。\n- " + checkFailures.join("\n- ") };
    }
    return { action: "block", state: next,
      message: "品質ゲート：機械チェックで以下のエラーが見つかった。原因を直して終えること（テストの削除・skip・期待値の書き換えで通すのは禁止）。\n- " +
        checkFailures.join("\n- ") };
  }

  next.failStreak = 0;
  if (state.reviewRequested) {
    next.reviewRequested = false;
    next.reviewedHash = hash;
    return { action: "allow", state: next };
  }
  next.reviewRequested = true;
  return { action: "block", state: next,
    message: "品質ゲート：機械チェックは通過した。終える前に code-quality-gate スキルを読み込み、今回の変更差分からエラーを探すレビュー（手順4〜5）を行い、手順6の形式で品質ゲートの結果を報告すること。" };
}

// ---------- git・ファイル操作 ----------

function run(cmd, args, cwd) {
  var r = childProcess.spawnSync(cmd, args, { cwd: cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "", status: r.status };
}

function gitRoot(cwd) {
  var r = run("git", ["rev-parse", "--show-toplevel"], cwd);
  return r.ok ? r.stdout.trim() : null;
}

function statePath(root) {
  var r = run("git", ["rev-parse", "--git-dir"], root);
  return path.resolve(root, r.stdout.trim(), STATE_FILE_NAME);
}

function loadState(root) {
  try { return JSON.parse(fs.readFileSync(statePath(root), "utf8")); } catch (e) { return {}; }
}

function saveState(root, state) {
  try { fs.writeFileSync(statePath(root), JSON.stringify(state)); } catch (e) { /* 状態が保存できなくてもフック自体は止めない */ }
}

function headCommit(root) {
  var r = run("git", ["rev-parse", "HEAD"], root);
  return r.ok ? r.stdout.trim() : null;
}

// セッション開始時の HEAD（記録がなければ現在の HEAD）からの変更を集める
function collectChanges(root, state) {
  var base = state.base && run("git", ["cat-file", "-e", state.base], root).ok ? state.base : headCommit(root);
  var tracked = base ? run("git", ["diff", "--name-only", base], root).stdout : "";
  var untracked = run("git", ["ls-files", "--others", "--exclude-standard"], root).stdout;
  var files = (tracked + "\n" + untracked).split("\n").map(function (s) { return s.trim(); })
    .filter(function (f, i, all) { return f && all.indexOf(f) === i && isCodeFile(f) && fs.existsSync(path.join(root, f)); });

  var diffText = base ? run("git", ["diff", "-U0", base, "--"].concat(files), root).stdout : "";
  var added = parseAddedLines(diffText);
  var hasher = crypto.createHash("sha256").update(diffText);
  untracked.split("\n").map(function (s) { return s.trim(); }).filter(function (f) { return files.indexOf(f) !== -1; })
    .forEach(function (f) {
      var content = fs.readFileSync(path.join(root, f), "utf8");
      added[f] = content.split("\n");
      hasher.update(f + "\0" + content);
    });
  return { files: files, added: added, hash: hasher.digest("hex") };
}

function syntaxErrors(root, files) {
  return files.filter(function (f) { return path.extname(f) === ".js"; }).map(function (f) {
    var r = run(process.execPath, ["--check", f], root);
    return r.ok ? null : "構文エラー " + f + "：" + firstLines(r.stderr, 6);
  }).filter(Boolean);
}

function unitTestFailures(root, files) {
  var hasJs = files.some(function (f) { return path.extname(f) === ".js"; });
  var testDir = path.join(root, "test", "unit");
  if (!hasJs || !fs.existsSync(testDir)) return [];
  var testFiles = fs.readdirSync(testDir).filter(function (f) { return /\.test\.js$/.test(f); })
    .map(function (f) { return path.join("test", "unit", f); });
  if (testFiles.length === 0) return [];
  var r = run(process.execPath, ["--test"].concat(testFiles), root);
  if (r.ok) return [];
  var output = r.stdout + r.stderr;
  var failedNames = output.split("\n").filter(function (l) { return /^\s*not ok /.test(l); });
  var summary = failedNames.length > 0 ? failedNames.join("\n") : lastLines(output, 25);
  return ["単体テスト失敗（node --test test/unit/*.test.js で詳細を確認）：\n" + summary];
}

function firstLines(text, n) { return text.trim().split("\n").slice(0, n).join("\n"); }
function lastLines(text, n) { return text.trim().split("\n").slice(-n).join("\n"); }

function runChecks(root, changes) {
  var failures = [];
  failures = failures.concat(syntaxErrors(root, changes.files));
  failures = failures.concat(unitTestFailures(root, changes.files));
  findSecrets(changes.added).forEach(function (s) {
    failures.push("秘密情報の疑い " + s.file + "：" + s.label + "（公開されるコードに置いてよいか確認）");
  });
  failures = failures.concat(findCacheBustProblems(changes.files, changes.added));
  return failures;
}

// ---------- フックの入口 ----------

function readInput() {
  try { return JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch (e) { return {}; }
}

function onSessionStart(root, input) {
  var state = loadState(root);
  if (input.source === "startup" || !state.base) {
    saveState(root, { base: headCommit(root) });
  }
}

function onPostEdit(root, input) {
  var file = input.tool_input && input.tool_input.file_path;
  if (!file || path.extname(file) !== ".js" || !fs.existsSync(file)) return;
  var r = run(process.execPath, ["--check", file], root);
  if (!r.ok) {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: "品質ゲート：今編集した " + path.relative(root, file) + " に構文エラーがある。直してから次に進むこと。\n" + firstLines(r.stderr, 8)
    }));
  }
}

function onStop(root) {
  var state = loadState(root);
  var changes = collectChanges(root, state);
  if (changes.files.length === 0) return;
  var failures = runChecks(root, changes);
  var decision = decideStop(failures, state, changes.hash);
  saveState(root, decision.state);
  if (decision.action === "block") {
    process.stdout.write(JSON.stringify({ decision: "block", reason: decision.message }));
  } else if (decision.action === "warn") {
    process.stdout.write(JSON.stringify({ systemMessage: decision.message }));
  }
}

function main() {
  var mode = process.argv[2];
  var input = readInput();
  var root = gitRoot(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) return;
  if (mode === "session-start") onSessionStart(root, input);
  else if (mode === "post-edit") onPostEdit(root, input);
  else if (mode === "stop") onStop(root);
}

if (require.main === module) {
  try { main(); } catch (e) {
    // フックの不具合で作業全体を止めないよう、エラーは利用者に見える形で出して終了コード0で抜ける
    process.stdout.write(JSON.stringify({ systemMessage: "品質ゲートのフックでエラー：" + e.message }));
  }
}

module.exports = {
  findSecrets: findSecrets,
  findCacheBustProblems: findCacheBustProblems,
  parseAddedLines: parseAddedLines,
  decideStop: decideStop,
  MAX_FAIL_BLOCKS: MAX_FAIL_BLOCKS
};
