// 起動スクリプト：本番とテスト環境（?mode=test）で読み込むスクリプトと画面の違いをここで切り替える。
// HTML は本番・テストで1つだけにし、環境ごとの違いはこのファイルの設定で表す。
(function () {
  "use strict";

  var VERSION = "20261007-SPLIT1";

  // 画面に依存しない計算・判定（単体テストあり）。app.js より先に読み込む。
  var LOGIC_SCRIPTS = ["./lib/core.js", "./lib/settlement.js", "./lib/split.js", "./lib/card-import.js"].map(function (src) {
    return src + "?v=" + VERSION;
  });

  var ENVIRONMENTS = {
    production: {
      scripts: [
        "./supabase-client.js?v=" + VERSION
      ].concat(LOGIC_SCRIPTS, [
        "./split-editor.js?v=" + VERSION,
        "./app.js?v=" + VERSION,
        "./auth.js?v=20260927-INTEGRITY1"
      ]),
      startApp: false
    },
    test: {
      scripts: [
        "./test/test-db.js?v=" + VERSION
      ].concat(LOGIC_SCRIPTS, [
        "./split-editor.js?v=" + VERSION,
        "./app.js?v=" + VERSION
      ]),
      startApp: true,
      title: "うーにゃち家計｜テスト環境",
      environmentLink: { href: "./", label: "本番へ戻る" }
    }
  };

  function currentMode() {
    var params = new URLSearchParams(window.location.search);
    return params.get("mode") === "test" ? "test" : "production";
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("読み込みに失敗しました: " + src)); };
      document.body.appendChild(script);
    });
  }

  function loadInOrder(sources) {
    return sources.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src); });
    }, Promise.resolve());
  }

  function show(id, visible) {
    var element = document.getElementById(id);
    if (element) element.classList.toggle("hidden", !visible);
  }

  function applyTestModeScreen(env) {
    document.title = env.title;
    show("authGate", false);
    show("appShell", true);
    show("testModeBadge", true);
    show("testModeBanner", true);
    show("logoutButton", false);
    var link = document.getElementById("environmentLink");
    if (link) {
      link.href = env.environmentLink.href;
      link.querySelector("strong").textContent = env.environmentLink.label;
    }
  }

  var mode = currentMode();
  var env = ENVIRONMENTS[mode];
  window.KAKEIBO_TEST_MODE = mode === "test";
  if (mode === "test") applyTestModeScreen(env);

  loadInOrder(env.scripts)
    .then(function () {
      if (env.startApp) return window.KakeiboApp.start();
    })
    .catch(function (error) {
      console.error(error);
      alert(mode === "test"
        ? "テスト環境を起動できませんでした。"
        : "アプリを読み込めませんでした。通信状況を確認して再読み込みしてください。");
    });
})();
