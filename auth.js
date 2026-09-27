(function () {
  var authGate = document.getElementById("authGate");
  var appShell = document.getElementById("appShell");

  var loginPanel = document.getElementById("loginPanel");
  var setupPanel = document.getElementById("setupPanel");
  var recoveryPanel = document.getElementById("recoveryPanel");

  var loginForm = document.getElementById("emailLoginForm");
  var emailInput = document.getElementById("loginEmail");
  var passwordInput = document.getElementById("loginPassword");
  var loginButton = document.getElementById("emailLoginButton");

  var setupButton = document.getElementById("setupPasswordButton");
  var forgotButton = document.getElementById("forgotPasswordButton");
  var setupForm = document.getElementById("passwordSetupForm");
  var setupEmail = document.getElementById("setupEmail");
  var setupPassword = document.getElementById("setupPassword");
  var setupPasswordConfirm = document.getElementById("setupPasswordConfirm");
  var setupSubmitButton = document.getElementById("setupSubmitButton");
  var backToLoginButton = document.getElementById("backToLoginButton");

  var recoveryForm = document.getElementById("passwordRecoveryForm");
  var recoveryPassword = document.getElementById("recoveryPassword");
  var recoveryPasswordConfirm = document.getElementById("recoveryPasswordConfirm");
  var recoverySubmitButton = document.getElementById("recoverySubmitButton");

  var logoutButton = document.getElementById("logoutButton");
  var message = document.getElementById("authMessage");

  var appStarted = false;
  var recoveryMode = /(?:[?#&])type=recovery(?:[&#]|$)/.test(window.location.hash + window.location.search);

  function setMessage(text, type) {
    message.textContent = text || "";
    message.classList.toggle("success", type === "success");
  }

  function setPanel(panel) {
    loginPanel.classList.toggle("hidden", panel !== "login");
    setupPanel.classList.toggle("hidden", panel !== "setup");
    recoveryPanel.classList.toggle("hidden", panel !== "recovery");
  }

  function showLogin(text, type) {
    appShell.classList.add("hidden");
    authGate.classList.remove("hidden");
    setPanel("login");
    loginButton.disabled = false;
    setupSubmitButton.disabled = false;
    recoverySubmitButton.disabled = false;
    if (text !== undefined) setMessage(text, type);
  }

  function showSetup() {
    appShell.classList.add("hidden");
    authGate.classList.remove("hidden");
    setPanel("setup");
    setupSubmitButton.disabled = false;
    setupEmail.value = emailInput.value.trim();
    setMessage("");
    setTimeout(function () {
      if (setupEmail.value) setupPassword.focus();
      else setupEmail.focus();
    }, 0);
  }

  function showRecovery() {
    appShell.classList.add("hidden");
    authGate.classList.remove("hidden");
    setPanel("recovery");
    recoverySubmitButton.disabled = false;
    setMessage("新しいパスワードを設定してください。");
    setTimeout(function () { recoveryPassword.focus(); }, 0);
  }

  async function showApp() {
    if (recoveryMode) {
      showRecovery();
      return;
    }

    setMessage("");

    var allowed = await window.kakeiboDb.checkAccess();
    if (!allowed) {
      await window.kakeiboDb.signOut();
      showLogin("このメールアドレスには、この家計簿へのアクセス権がありません。");
      return;
    }

    authGate.classList.add("hidden");
    appShell.classList.remove("hidden");

    if (!appStarted) {
      appStarted = true;
      await window.KakeiboApp.start();
    }
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var email = emailInput.value.trim();
    var password = passwordInput.value;

    if (!email || !password) return;

    try {
      loginButton.disabled = true;
      setMessage("ログインしています…");

      await window.kakeiboDb.signInWithPassword(email, password);
      await showApp();
    } catch (error) {
      console.error(error);
      loginButton.disabled = false;
      setMessage("メールアドレスまたはパスワードが違います。");
    }
  });

  setupButton.addEventListener("click", showSetup);

  backToLoginButton.addEventListener("click", function () {
    emailInput.value = setupEmail.value.trim() || emailInput.value;
    showLogin("");
  });

  setupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var email = setupEmail.value.trim();
    var password = setupPassword.value;
    var confirm = setupPasswordConfirm.value;

    if (!email || !password || !confirm) return;

    if (password.length < 8) {
      setMessage("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setMessage("確認用パスワードが一致していません。");
      return;
    }

    try {
      setupSubmitButton.disabled = true;
      setMessage("確認しています…");

      await window.kakeiboDb.signUpWithPassword(email, password);
      setupSubmitButton.disabled = false;
      setMessage(
        "確認メールを送りました。メール内のリンクを1回だけ開いて登録を完了してください。その後はホーム画面の家計簿から、メールアドレスとパスワードでログインできます。",
        "success"
      );
    } catch (error) {
      console.error(error);
      setupSubmitButton.disabled = false;
      setMessage("初回設定を開始できませんでした。少し時間をおいて、もう一度お試しください。");
    }
  });

  forgotButton.addEventListener("click", async function () {
    var email = emailInput.value.trim();
    if (!email) {
      setMessage("先にメールアドレスを入力してください。");
      emailInput.focus();
      return;
    }

    try {
      forgotButton.disabled = true;
      setMessage("確認しています…");

      await window.kakeiboDb.sendPasswordReset(email);
      setMessage("パスワード再設定メールを送りました。メールのリンクから新しいパスワードを設定してください。", "success");
    } catch (error) {
      console.error(error);
      setMessage("再設定メールを送れませんでした。少し時間をおいて、もう一度お試しください。");
    } finally {
      forgotButton.disabled = false;
    }
  });

  recoveryForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var password = recoveryPassword.value;
    var confirm = recoveryPasswordConfirm.value;

    if (password.length < 8) {
      setMessage("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setMessage("確認用パスワードが一致していません。");
      return;
    }

    try {
      recoverySubmitButton.disabled = true;
      setMessage("パスワードを設定しています…");

      await window.kakeiboDb.updatePassword(password);
      recoveryMode = false;
      await window.kakeiboDb.signOut();

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.origin + window.location.pathname);
      }

      recoveryPassword.value = "";
      recoveryPasswordConfirm.value = "";
      showLogin(
        "パスワードを設定しました。ホーム画面の「家計簿」に戻り、新しいパスワードでログインしてください。",
        "success"
      );
    } catch (error) {
      console.error(error);
      recoverySubmitButton.disabled = false;
      setMessage("パスワードを設定できませんでした。再設定メールをもう一度送り直してください。");
    }
  });

  logoutButton.addEventListener("click", async function () {
    try {
      await window.kakeiboDb.signOut();
      window.KakeiboApp.reset();
      appStarted = false;
      showLogin("");
    } catch (error) {
      console.error(error);
    }
  });

  async function init() {
    try {
      if (recoveryMode) {
        showRecovery();
        return;
      }

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
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      showRecovery();
      return;
    }

    if (event === "SIGNED_OUT") {
      window.KakeiboApp.reset();
      appStarted = false;
      if (!recoveryMode) showLogin("");
      return;
    }

    if (session && !recoveryMode && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
      showApp().catch(function (error) {
        console.error(error);
        showLogin("家計データを読み込めませんでした。");
      });
    }
  });

  init();
})();
