(function () {
  var authGate = document.getElementById("authGate");
  var appShell = document.getElementById("appShell");
  var loginForm = document.getElementById("emailLoginForm");
  var emailInput = document.getElementById("loginEmail");
  var loginButton = document.getElementById("emailLoginButton");
  var logoutButton = document.getElementById("logoutButton");
  var message = document.getElementById("authMessage");

  function setMessage(text, type) {
    message.textContent = text || "";
    message.classList.toggle("success", type === "success");
  }

  function showLogin(text, type) {
    appShell.classList.add("hidden");
    authGate.classList.remove("hidden");
    loginButton.disabled = false;
    if (text) setMessage(text, type);
  }

  async function showApp() {
    setMessage("");

    var allowed = await window.kakeiboDb.checkAccess();
    if (!allowed) {
      await window.kakeiboDb.signOut();
      showLogin("このメールアドレスには、この家計簿へのアクセス権がありません。");
      return;
    }

    authGate.classList.add("hidden");
    appShell.classList.remove("hidden");
    await window.KakeiboApp.start();
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var email = emailInput.value.trim();
    if (!email) return;

    try {
      loginButton.disabled = true;
      setMessage("ログインメールを送っています…");

      await window.kakeiboDb.signInWithEmail(email);

      setMessage(
        "メールを送りました。届いた「ログイン」リンクを押してください。",
        "success"
      );
    } catch (error) {
      console.error(error);
      loginButton.disabled = false;

      var text = String(error && error.message ? error.message : error);
      if (/redirect|not allowed/i.test(text)) {
        setMessage("ログイン先URLの設定がまだ必要です。");
      } else {
        setMessage("ログインメールを送れませんでした。もう一度試してください。");
      }
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

    if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
      showApp().catch(function (error) {
        console.error(error);
        showLogin("家計データを読み込めませんでした。");
      });
    }
  });

  init();
})();
