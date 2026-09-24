(function () {
  var state = { data: null, filter: "all", currentClassifyId: null, started: false };

  function yen(value) {
    return "¥" + Number(value || 0).toLocaleString("ja-JP");
  }

  function shortDate(value) {
    if (!value) return "";
    var p = value.split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }

  function scopeLabel(scope) {
    return scope === "shared" ? "共同" : scope === "mine" ? "あなた個人" : scope === "partner" ? "彼氏個人" : "未設定";
  }

  function iconFor(tx) {
    var map = { "食費":"🛒", "日用品":"🧴", "光熱費":"💡", "外食":"☕", "家具・家電":"🪑" };
    return map[tx.category_name] || (tx.status === "unclassified" ? "?" : "•");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m];
    });
  }

  function txRow(tx) {
    var sub = shortDate(tx.date) + " ・ " + (tx.category_name || "未分類") + " ・ " + scopeLabel(tx.scope);
    return '<div class="transaction-row">' +
      '<div class="tx-icon">' + iconFor(tx) + '</div>' +
      '<div class="tx-main"><strong>' + escapeHtml(tx.merchant_name) + '</strong><small>' + sub + '</small></div>' +
      '<div class="tx-amount">' + yen(tx.amount) + '</div></div>';
  }

  function calculateSummary() {
    var txs = state.data.transactions;
    var shared = txs.filter(function (t) { return t.scope === "shared" && t.status === "confirmed"; });
    var total = shared.reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var myShare = Math.round(total / 2);
    var partnerShare = total - myShare;

    var paidByMe = shared.filter(function (t) { return t.payer === "me"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var paidByPartner = shared.filter(function (t) { return t.payer === "partner"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);

    // Positive = partner owes me. Negative = I owe partner.
    var livingSettlement = paidByMe - myShare;

    var loanNet = state.data.loans.filter(function (x) { return x.status === "open"; })
      .reduce(function (sum, x) {
        return sum + (x.lender === "me" ? Number(x.amount) : -Number(x.amount));
      }, 0);

    var plan = state.data.repayment_plan || {
      id:null, original_amount:0, remaining_amount:0, monthly_amount:0, lender:"me", borrower:"partner"
    };
    var repaymentNet = plan.lender === "me" ? Number(plan.monthly_amount) : -Number(plan.monthly_amount);
    var finalSettlement = livingSettlement + loanNet + repaymentNet;

    return {
      total:total,
      myShare:myShare,
      partnerShare:partnerShare,
      paidByMe:paidByMe,
      paidByPartner:paidByPartner,
      livingSettlement:livingSettlement,
      loanNet:loanNet,
      repaymentNet:repaymentNet,
      finalSettlement:finalSettlement,
      plan:plan
    };
  }

  function directionText(amount) {
    return amount >= 0 ? "彼氏 → あなたへ支払い" : "あなた → 彼氏へ支払い";
  }

  function render() {
    var summary = calculateSummary();

    document.getElementById("monthlyTotal").textContent = yen(summary.total);
    document.getElementById("myShare").textContent = yen(summary.myShare);
    document.getElementById("partnerShare").textContent = yen(summary.partnerShare);
    document.getElementById("monthlyRepayment").textContent = yen(summary.plan.monthly_amount);
    document.getElementById("remainingDebt").textContent = "残り " + yen(summary.plan.remaining_amount);
    document.getElementById("debtRemaining").textContent = yen(summary.plan.remaining_amount);
    document.getElementById("repaymentBadge").textContent = "今月 " + yen(summary.plan.monthly_amount);
    document.getElementById("debtMeta").textContent =
      "総額 " + yen(summary.plan.original_amount) + " ・ 返済済 " +
      yen(summary.plan.original_amount - summary.plan.remaining_amount);

    var progress = summary.plan.original_amount
      ? ((summary.plan.original_amount - summary.plan.remaining_amount) / summary.plan.original_amount * 100)
      : 0;
    document.getElementById("debtProgress").style.width =
      Math.max(0, Math.min(100, progress)) + "%";

    var unknown = state.data.transactions.filter(function (t) {
      return t.status === "unclassified" || !t.category_name;
    });
    document.getElementById("unknownCountText").textContent =
      "未分類が" + unknown.length + "件あります";

    var recent = state.data.transactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); }).slice(0,5);
    document.getElementById("recentTransactions").innerHTML = recent.map(txRow).join("");

    var filtered = state.data.transactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); });
    if (state.filter !== "all") {
      filtered = filtered.filter(function (t) { return t.scope === state.filter; });
    }
    document.getElementById("allTransactions").innerHTML = filtered.map(txRow).join("");

    document.getElementById("unknownTransactions").innerHTML = unknown.map(function (tx) {
      return '<article class="unknown-card"><div class="unknown-top"><div><strong>' +
        escapeHtml(tx.merchant_name) + '</strong><small>' + shortDate(tx.date) + " ・ " +
        yen(tx.amount) + '</small></div><span class="tag">未分類</span></div>' +
        '<div class="unknown-actions"><button class="classify" data-classify="' + tx.id +
        '">分類する</button><button class="personal" data-personal="' + tx.id +
        '">個人支出</button></div></article>';
    }).join("");

    document.getElementById("loanBalance").textContent =
      (summary.loanNet >= 0 ? "彼氏 → あなた " : "あなた → 彼氏 ") +
      yen(Math.abs(summary.loanNet));

    document.getElementById("loansList").innerHTML =
      state.data.loans.filter(function (x) { return x.status === "open"; }).map(function (x) {
        var detail = shortDate(x.date) + " ・ " +
          (x.lender === "me" ? "あなたが立替" : "彼氏が立替");
        return '<div class="transaction-row"><div class="tx-icon">↔</div>' +
          '<div class="tx-main"><strong>' + escapeHtml(x.description) + '</strong><small>' +
          detail + '</small></div><div class="tx-amount">' + yen(x.amount) + '</div></div>';
      }).join("");

    document.getElementById("merchantRules").innerHTML =
      state.data.merchant_rules.map(function (r) {
        return '<div class="merchant-row"><div><strong>' + escapeHtml(r.merchant_name) +
          '</strong><small>' + (r.mode === "confirm" ? "毎回確認" :
          escapeHtml(r.category_name || "未設定") + " ・ " + scopeLabel(r.scope)) +
          '</small></div><b>›</b></div>';
      }).join("");

    document.getElementById("classifyCategory").innerHTML =
      state.data.categories.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">' +
          escapeHtml(c.name) + '</option>';
      }).join("");

    document.getElementById("settlementAmount").textContent =
      yen(Math.abs(summary.finalSettlement));
    document.getElementById("settlementDirection").textContent =
      directionText(summary.finalSettlement);

    document.getElementById("breakdownList").innerHTML =
      '<div class="breakdown-row"><span>生活費の差額<small>' +
      directionText(summary.livingSettlement).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.livingSettlement)) + '</strong></div>' +
      '<div class="breakdown-row"><span>初期費用返済<small>' +
      directionText(summary.repaymentNet).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.repaymentNet)) + '</strong></div>' +
      '<div class="breakdown-row"><span>立替差額<small>' +
      directionText(summary.loanNet).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.loanNet)) + '</strong></div>';

    bindDynamicButtons();
  }

  function bindDynamicButtons() {
    document.querySelectorAll("[data-classify]").forEach(function (button) {
      button.onclick = function () {
        var id = Number(button.getAttribute("data-classify"));
        state.currentClassifyId = id;
        var tx = state.data.transactions.find(function (x) {
          return Number(x.id) === id;
        });
        document.getElementById("classifyId").value = id;
        document.getElementById("classifyTitle").textContent =
          (tx ? tx.merchant_name : "明細") + " を分類";
        document.getElementById("classifyDialog").showModal();
      };
    });

    document.querySelectorAll("[data-personal]").forEach(function (button) {
      button.onclick = function () {
        var id = Number(button.getAttribute("data-personal"));
        var tx = state.data.transactions.find(function (x) {
          return Number(x.id) === id;
        });
        if (tx) {
          tx.scope = "mine";
          tx.category_name = tx.category_name || "その他";
          tx.status = "confirmed";
          render();
        }
      };
    });
  }

  function go(screen) {
    document.querySelectorAll(".screen").forEach(function (x) {
      x.classList.toggle("active", x.getAttribute("data-screen") === screen);
    });
    document.querySelectorAll(".nav-item").forEach(function (x) {
      x.classList.toggle("active", x.getAttribute("data-go") === screen);
    });
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  document.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () {
      go(button.getAttribute("data-go"));
    });
  });

  document.querySelectorAll("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      var dialog = document.getElementById(button.getAttribute("data-open"));
      if (dialog) dialog.showModal();
    });
  });

  document.querySelectorAll(".chip").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll(".chip").forEach(function (x) {
        x.classList.remove("active");
      });
      button.classList.add("active");
      state.filter = button.getAttribute("data-filter");
      render();
    });
  });

  document.getElementById("classifyForm").addEventListener("submit", async function () {
    var id = Number(document.getElementById("classifyId").value);
    var category = document.getElementById("classifyCategory").value;
    var scope = document.getElementById("classifyScope").value;
    var remember = document.getElementById("ruleMode").value === "merchant";

    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === id;
    });
    if (tx) {
      tx.category_name = category;
      tx.scope = scope;
      tx.status = "confirmed";
      if (remember) {
        state.data.merchant_rules.push({
          id:"local-" + Date.now(),
          merchant_name:tx.merchant_name,
          category_name:category,
          scope:scope,
          mode:"auto"
        });
      }
    }

    try {
      await window.kakeiboDb.classifyTransaction(id, category, scope, remember);
    } catch (e) {
      console.error(e);
    }
    setTimeout(render, 0);
  });

  document.getElementById("repaymentForm").addEventListener("submit", async function () {
    var amount = Number(document.getElementById("repaymentInput").value || 0);
    if (state.data.repayment_plan) {
      state.data.repayment_plan.monthly_amount = amount;
    }
    try {
      if (state.data.repayment_plan) {
        await window.kakeiboDb.updateRepaymentAmount(
          state.data.repayment_plan.id,
          amount
        );
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(render, 0);
  });

  async function start() {
    if (state.started) return;
    state.started = true;

    try {
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (error) {
      state.started = false;
      console.error(error);
      throw error;
    }
  }

  function reset() {
    state.data = null;
    state.started = false;
    state.filter = "all";
    state.currentClassifyId = null;
  }

  window.KakeiboApp = {
    start: start,
    reset: reset
  };
})();
