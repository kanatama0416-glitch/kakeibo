(function () {
  var authGate = document.getElementById("authGate");
  var appShell = document.getElementById("appShell");
  var loginButton = document.getElementById("googleLoginButton");
  var logoutButton = document.getElementById("logoutButton");
  var message = document.getElementById("authMessage");

  function setMessage(text) {
    message.textContent = text || "";
  }

  function showLogin(text) {
    appShell.classList.add("hidden");
    authGate.classList.remove("hidden");
    if (text) setMessage(text);
  }

  async function showApp() {
    setMessage("");

    var allowed = await window.kakeiboDb.checkAccess();
    if (!allowed) {
      await window.kakeiboDb.signOut();
      showLogin("このGoogleアカウントには、この家計簿へのアクセス権がありません。");
      return;
    }

    authGate.classList.add("hidden");
    appShell.classList.remove("hidden");
    await window.KakeiboApp.start();
  }

  loginButton.addEventListener("click", async function () {
    try {
      loginButton.disabled = true;
      setMessage("");
      await window.kakeiboDb.signInWithGoogle();
    } catch (error) {
      console.error(error);
      loginButton.disabled = false;
      setMessage("Googleログインを開始できませんでした。Google連携設定を確認してください。");
    }
  });

  logoutButton.addEventListener("click", async function () {
    try {
      await window.kakeiboDb.signOut();
      window.KakeiboApp.reset();
      showLogin("");
    } catch (error) {
      console.error(error);
    }
  });

  async function init() {
    try {
      var session = await window.kakeiboDb.getSession();
      if (session) {
        await showApp();
      } else {
        showLogin("");
      }
    } catch (error) {
      console.error(error);
      showLogin("ログイン状態を確認できませんでした。");
    }
  }

  window.kakeiboDb.onAuthStateChange(function (event, session) {
    if (event === "SIGNED_OUT") {
      window.KakeiboApp.reset();
      showLogin("");
      return;
    }

    if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
      showApp().catch(function (error) {
        console.error(error);
        showLogin("家計データを読み込めませんでした。");
      });
    }
  });

  init();
})();
