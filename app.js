(function () {
  var OPERATION_START_MONTH = "2026-10";

  function monthKeyFromDate(value) {
    return value ? String(value).slice(0, 7) : "";
  }

  function addMonths(monthKey, offset) {
    var parts = monthKey.split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + offset, 1));
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
  }

  function monthLabel(monthKey) {
    var parts = monthKey.split("-");
    return Number(parts[1]) + "月";
  }

  function defaultMonthKey() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    var key = local.toISOString().slice(0, 7);
    return key < OPERATION_START_MONTH ? OPERATION_START_MONTH : key;
  }

  var state = {
    data: null,
    filter: "all",
    currentClassifyId: null,
    started: false,
    currentMonth: defaultMonthKey()
  };

  function yen(value) {
    return "¥" + Number(value || 0).toLocaleString("ja-JP");
  }

  function shortDate(value) {
    if (!value) return "";
    var p = value.split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }

  function scopeLabel(scope) {
    return scope === "shared" ? "共同" : scope === "mine" ? "にゃち個人" : scope === "partner" ? "うー個人" : "未設定";
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
    var sub = shortDate(tx.date) + " ・ " + (tx.category_name || "その他") + " ・ " + scopeLabel(tx.scope);
    return '<button type="button" class="transaction-row transaction-edit-row" data-edit-tx="' + tx.id + '">' +
      '<div class="tx-icon">' + iconFor(tx) + '</div>' +
      '<div class="tx-main"><strong>' + escapeHtml(tx.merchant_name) + '</strong><small>' + sub + '</small></div>' +
      '<div class="tx-side"><div class="tx-amount">' + yen(tx.amount) + '</div>' +
      '<span class="tx-edit-label">編集 ›</span></div></button>';
  }

  var CATEGORY_COLORS = [
    "#1f7a5a",
    "#4f8fa8",
    "#d09a45",
    "#9b78b4",
    "#d27575",
    "#6f9b70",
    "#7b838d"
  ];

  function normalizedCategory(tx) {
    return tx.category_name || "その他";
  }

  function confirmedSpending(transactions) {
    return transactions.filter(function (t) {
      return t.status === "confirmed";
    });
  }

  function categoryTotals(transactions) {
    var totals = {};
    confirmedSpending(transactions).forEach(function (tx) {
      var category = normalizedCategory(tx);
      totals[category] = (totals[category] || 0) + Number(tx.amount || 0);
    });
    return totals;
  }

  function sortedCategoryEntries(totals) {
    return Object.keys(totals).map(function (name) {
      return { name:name, amount:totals[name] };
    }).sort(function (a,b) {
      return b.amount - a.amount;
    });
  }

  function categoryColorMap(categories) {
    var map = {};
    categories.forEach(function (name, index) {
      map[name] = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    });
    return map;
  }

  function analysisMonths() {
    var months = [];
    var cursor = state.currentMonth;
    for (var i = 0; i < 6; i += 1) {
      if (cursor < OPERATION_START_MONTH) break;
      months.unshift(cursor);
      cursor = addMonths(cursor, -1);
    }
    return months;
  }

  function renderHomeCategoryChart(summary) {
    var entries = sortedCategoryEntries(categoryTotals(summary.monthTransactions));
    var container = document.getElementById("homeCategoryBars");
    var empty = document.getElementById("homeCategoryEmpty");
    var title = document.getElementById("usageTitle");

    title.textContent = monthLabel(state.currentMonth) + "の使い道";

    if (!entries.length) {
      container.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");
    var maxAmount = entries[0].amount || 1;
    var colors = categoryColorMap(entries.map(function (x) { return x.name; }));
    container.innerHTML = entries.slice(0, 6).map(function (entry) {
      var width = Math.max(4, Math.round(entry.amount / maxAmount * 100));
      return '<div class="category-bar-row">' +
        '<div class="category-bar-head"><span>' + escapeHtml(entry.name) + '</span><strong>' +
        yen(entry.amount) + '</strong></div>' +
        '<div class="category-bar-track"><span style="width:' + width + '%;background:' +
        colors[entry.name] + '"></span></div></div>';
    }).join("");
  }

  function renderAnalysisChart() {
    var months = analysisMonths();
    var rows = months.map(function (month) {
      var txs = state.data.transactions.filter(function (t) {
        return monthKeyFromDate(t.date) === month;
      });
      return { month:month, totals:categoryTotals(txs) };
    });

    var categorySet = {};
    rows.forEach(function (row) {
      Object.keys(row.totals).forEach(function (name) {
        categorySet[name] = true;
      });
    });

    var categories = Object.keys(categorySet).sort(function (a,b) {
      var totalA = rows.reduce(function (sum,row) { return sum + Number(row.totals[a] || 0); }, 0);
      var totalB = rows.reduce(function (sum,row) { return sum + Number(row.totals[b] || 0); }, 0);
      return totalB - totalA;
    });

    var colorMap = categoryColorMap(categories);
    var totalsByMonth = rows.map(function (row) {
      return Object.keys(row.totals).reduce(function (sum,key) {
        return sum + Number(row.totals[key] || 0);
      }, 0);
    });
    var maxTotal = Math.max.apply(null, totalsByMonth.concat([1]));
    var rangeTotal = totalsByMonth.reduce(function (sum,x) { return sum + x; }, 0);

    document.getElementById("analysisRangeLabel").textContent =
      months.length > 1
        ? months[0].replace("-", "年") + "月〜" + monthLabel(months[months.length - 1])
        : (months[0] ? months[0].replace("-", "年") + "月" : "");
    document.getElementById("analysisRangeTotal").textContent = yen(rangeTotal);

    var chart = document.getElementById("monthlyStackedChart");
    var empty = document.getElementById("monthlyStackedEmpty");
    var legend = document.getElementById("analysisLegend");

    if (!categories.length) {
      chart.innerHTML = "";
      legend.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");

    chart.innerHTML = rows.map(function (row, index) {
      var monthTotal = totalsByMonth[index];
      var height = monthTotal ? Math.max(8, Math.round(monthTotal / maxTotal * 100)) : 0;
      var segments = categories.map(function (category) {
        var amount = Number(row.totals[category] || 0);
        if (!amount || !monthTotal) return "";
        var segmentHeight = amount / monthTotal * 100;
        return '<span class="stack-segment" title="' + escapeHtml(category) + ' ' + yen(amount) +
          '" style="height:' + segmentHeight + '%;background:' + colorMap[category] + '"></span>';
      }).join("");

      return '<div class="stack-month">' +
        '<div class="stack-total">' + (monthTotal ? yen(monthTotal) : "¥0") + '</div>' +
        '<div class="stack-column-wrap"><div class="stack-column" style="height:' + height + '%">' +
        segments + '</div></div>' +
        '<div class="stack-month-label">' + monthLabel(row.month) + '</div></div>';
    }).join("");

    legend.innerHTML = categories.map(function (category) {
      return '<span><i style="background:' + colorMap[category] + '"></i>' +
        escapeHtml(category) + '</span>';
    }).join("");
  }

  function carryInAmount(category) {
    return (state.data.carryovers || []).filter(function (x) {
      return x.category === category && monthKeyFromDate(x.to_month) === state.currentMonth;
    }).reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);
  }

  function carryOutRecord(category) {
    return (state.data.carryovers || []).find(function (x) {
      return x.category === category && monthKeyFromDate(x.from_month) === state.currentMonth;
    }) || null;
  }

  function calculateSummary() {
    var monthTransactions = state.data.transactions.filter(function (t) {
      return monthKeyFromDate(t.date) === state.currentMonth;
    });
    var shared = monthTransactions.filter(function (t) {
      return t.scope === "shared" && t.status === "confirmed";
    });
    var total = shared.reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var myShare = Math.round(total / 2);
    var partnerShare = total - myShare;

    var paidByMe = shared.filter(function (t) { return t.payer === "me"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);
    var paidByPartner = shared.filter(function (t) { return t.payer === "partner"; })
      .reduce(function (s,t) { return s + Number(t.amount); }, 0);

    // Positive = うー owes にゃち. Negative = にゃち owes うー.
    var livingCurrent = paidByMe - myShare;
    var carryInLiving = carryInAmount("living");
    var livingSettlement = livingCurrent + carryInLiving;

    var monthLoans = state.data.loans.filter(function (x) {
      return monthKeyFromDate(x.date) === state.currentMonth && x.status === "open";
    });
    var loanCurrent = monthLoans.reduce(function (sum, x) {
      return sum + (x.lender === "me" ? Number(x.amount) : -Number(x.amount));
    }, 0);
    var carryInLoan = carryInAmount("loan");
    var loanNet = loanCurrent + carryInLoan;

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
      livingCurrent:livingCurrent,
      carryInLiving:carryInLiving,
      livingSettlement:livingSettlement,
      loanCurrent:loanCurrent,
      carryInLoan:carryInLoan,
      loanNet:loanNet,
      repaymentNet:repaymentNet,
      finalSettlement:finalSettlement,
      plan:plan,
      monthTransactions:monthTransactions,
      monthLoans:monthLoans
    };
  }

  function directionText(amount) {
    return amount >= 0 ? "うー → にゃちへ支払い" : "にゃち → うーへ支払い";
  }

  function render() {
    var summary = calculateSummary();

    var selectedMonthLabel = monthLabel(state.currentMonth);
    document.getElementById("settlementTitle").textContent = selectedMonthLabel + "の最終精算";
    document.getElementById("monthlyTotalTitle").textContent = selectedMonthLabel + "の生活費";
    document.getElementById("monthlyRepaymentTitle").textContent = selectedMonthLabel + "の返済";
    document.getElementById("monthlyShareTitle").textContent = selectedMonthLabel + "の負担";
    document.getElementById("monthlySpendingTitle").textContent = selectedMonthLabel + "の支出";

    document.getElementById("monthlyTotal").textContent = yen(summary.total);
    document.getElementById("myShare").textContent = yen(summary.myShare);
    document.getElementById("partnerShare").textContent = yen(summary.partnerShare);
    document.getElementById("monthlyRepayment").textContent = yen(summary.plan.monthly_amount);
    document.getElementById("remainingDebt").textContent = "残り " + yen(summary.plan.remaining_amount);
    document.getElementById("debtRemaining").textContent = yen(summary.plan.remaining_amount);
    document.getElementById("repaymentBadge").textContent = selectedMonthLabel + " " + yen(summary.plan.monthly_amount);
    document.getElementById("debtMeta").textContent =
      "総額 " + yen(summary.plan.original_amount) + " ・ 返済済 " +
      yen(summary.plan.original_amount - summary.plan.remaining_amount);

    var progress = summary.plan.original_amount
      ? ((summary.plan.original_amount - summary.plan.remaining_amount) / summary.plan.original_amount * 100)
      : 0;
    document.getElementById("debtProgress").style.width =
      Math.max(0, Math.min(100, progress)) + "%";

    var recent = summary.monthTransactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); }).slice(0,5);
    document.getElementById("recentTransactions").innerHTML = recent.map(txRow).join("");

    var filtered = summary.monthTransactions.slice()
      .sort(function (a,b) { return b.date.localeCompare(a.date); });
    if (state.filter !== "all") {
      filtered = filtered.filter(function (t) { return t.scope === state.filter; });
    }
    document.getElementById("allTransactions").innerHTML = filtered.map(txRow).join("");

    document.getElementById("loanBalance").textContent =
      (summary.loanNet >= 0 ? "うー → にゃち " : "にゃち → うー ") +
      yen(Math.abs(summary.loanNet));

    var loanRows = [];
    if (summary.carryInLoan !== 0) {
      loanRows.push(
        '<div class="transaction-row"><div class="tx-icon">↪</div>' +
        '<div class="tx-main"><strong>前月からの繰越</strong><small>' +
        directionText(summary.carryInLoan).replace("へ支払い","") +
        '</small></div><div class="tx-amount">' + yen(Math.abs(summary.carryInLoan)) + '</div></div>'
      );
    }
    loanRows = loanRows.concat(summary.monthLoans.map(function (x) {
      var detail = shortDate(x.date) + " ・ " +
        (x.lender === "me" ? "にゃちが立替" : "うーが立替");
      return '<div class="transaction-row"><div class="tx-icon">↔</div>' +
        '<div class="tx-main"><strong>' + escapeHtml(x.description) + '</strong><small>' +
        detail + '</small></div><div class="tx-amount">' + yen(x.amount) + '</div></div>';
    }));
    document.getElementById("loansList").innerHTML = loanRows.join("");

    var nextMonth = addMonths(state.currentMonth, 1);
    var livingOut = carryOutRecord("living");
    var loanOut = carryOutRecord("loan");

    document.getElementById("livingCarryoverAmount").textContent =
      yen(Math.abs(summary.livingSettlement));
    document.getElementById("livingCarryoverMeta").textContent =
      summary.livingSettlement === 0
        ? "繰越する差額はありません"
        : directionText(summary.livingSettlement).replace("へ支払い","") +
          (summary.carryInLiving !== 0 ? " ・ 前月繰越含む" : "");
    document.getElementById("loanCarryoverAmount").textContent =
      yen(Math.abs(summary.loanNet));
    document.getElementById("loanCarryoverMeta").textContent =
      summary.loanNet === 0
        ? "繰越する立替金はありません"
        : directionText(summary.loanNet).replace("へ支払い","") +
          (summary.carryInLoan !== 0 ? " ・ 前月繰越含む" : "");

    var livingButton = document.querySelector('[data-carryover="living"]');
    var loanButton = document.querySelector('[data-carryover="loan"]');
    livingButton.disabled = summary.livingSettlement === 0;
    loanButton.disabled = summary.loanNet === 0;
    livingButton.textContent = livingOut ? monthLabel(nextMonth) + "へ繰越額を更新" : monthLabel(nextMonth) + "へ繰越";
    loanButton.textContent = loanOut ? monthLabel(nextMonth) + "へ繰越額を更新" : monthLabel(nextMonth) + "へ繰越";

    var initialExpenses = state.data.initial_expenses || [];
    var initialTotal = initialExpenses.reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);
    var initialMe = initialExpenses.filter(function (x) { return x.payer === "me"; })
      .reduce(function (sum, x) { return sum + Number(x.amount || 0); }, 0);
    var initialPartner = initialExpenses.filter(function (x) { return x.payer === "partner"; })
      .reduce(function (sum, x) { return sum + Number(x.amount || 0); }, 0);

    document.getElementById("initialExpenseTotal").textContent = yen(initialTotal);
    document.getElementById("initialExpenseSplit").textContent =
      "にゃち " + yen(initialMe) + " / うー " + yen(initialPartner);
    document.getElementById("initialExpensesList").innerHTML =
      initialExpenses.map(function (x) {
        var detail = shortDate(x.date) + " ・ " +
          (x.payer === "me" ? "にゃちが支払い" : "うーが支払い");
        return '<button type="button" class="transaction-row transaction-edit-row" data-edit-initial-expense="' + x.id + '">' +
          '<div class="tx-icon">↔</div>' +
          '<div class="tx-main"><strong>' + escapeHtml(x.item_name) + '</strong><small>' +
          detail + (x.memo ? " ・ " + escapeHtml(x.memo) : "") +
          '</small></div><div class="tx-side"><div class="tx-amount">' + yen(x.amount) + '</div>' +
          '<span class="tx-edit-label">編集 ›</span></div></button>';
      }).join("");

    document.getElementById("merchantRules").innerHTML =
      state.data.merchant_rules.map(function (r) {
        return '<div class="merchant-row"><div><strong>' + escapeHtml(r.merchant_name) +
          '</strong><small>' + (r.mode === "confirm" ? "毎回確認" :
          escapeHtml(r.category_name || "未設定") + " ・ " + scopeLabel(r.scope)) +
          '</small></div><b>›</b></div>';
      }).join("");

    var categoryOptions = state.data.categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '">' +
        escapeHtml(c.name) + '</option>';
    }).join("");
    document.getElementById("classifyCategory").innerHTML = categoryOptions;
    document.getElementById("manualExpenseCategory").innerHTML = categoryOptions;

    document.getElementById("settlementAmount").textContent =
      yen(Math.abs(summary.finalSettlement));
    document.getElementById("settlementDirection").textContent =
      directionText(summary.finalSettlement);

    renderHomeCategoryChart(summary);
    renderAnalysisChart();

    document.getElementById("breakdownList").innerHTML =
      '<div class="breakdown-row"><span>生活費の差額<small>' +
      directionText(summary.livingSettlement).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.livingSettlement)) + '</strong></div>' +
      '<div class="breakdown-row"><span>立替金返済<small>' +
      directionText(summary.repaymentNet).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.repaymentNet)) + '</strong></div>' +
      '<div class="breakdown-row"><span>立替差額<small>' +
      directionText(summary.loanNet).replace("へ支払い","") +
      '</small></span><strong>' + yen(Math.abs(summary.loanNet)) + '</strong></div>';

    bindDynamicButtons();
  }

  function openTransactionEditor(id, mode) {
    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === Number(id);
    });
    if (!tx) return;

    state.currentClassifyId = Number(id);
    document.getElementById("classifyId").value = Number(id);
    document.getElementById("classifyTitle").textContent =
      tx.merchant_name + (mode === "classify" ? " を分類" : " を編集");

    var categorySelect = document.getElementById("classifyCategory");
    var scopeSelect = document.getElementById("classifyScope");
    var ruleSelect = document.getElementById("ruleMode");

    if (tx.category_name) categorySelect.value = tx.category_name;
    scopeSelect.value = tx.scope || "shared";
    ruleSelect.value = "once";

    document.getElementById("classifyDialog").showModal();
  }

  function openInitialExpenseEditor(id) {
    var expense = (state.data.initial_expenses || []).find(function (x) {
      return Number(x.id) === Number(id);
    });
    if (!expense) return;

    document.getElementById("initialExpenseId").value = expense.id;
    document.getElementById("initialExpenseDialogTitle").textContent = expense.item_name + " を編集";
    document.getElementById("initialExpenseItem").value = expense.item_name || "";
    document.getElementById("initialExpenseAmount").value = expense.amount || "";
    document.getElementById("initialExpensePayer").value = expense.payer || "me";
    document.getElementById("initialExpenseDate").value = expense.date || "";
    document.getElementById("initialExpenseMemo").value = expense.memo || "";
    document.getElementById("initialExpenseSaveButton").textContent = "変更を保存";
    document.getElementById("deleteInitialExpenseButton").classList.remove("hidden");
    document.getElementById("initialExpenseDialog").showModal();
  }

  function openInitialExpenseAdd() {
    document.getElementById("initialExpenseForm").reset();
    document.getElementById("initialExpenseId").value = "";
    document.getElementById("initialExpenseDialogTitle").textContent = "立替金を追加";
    document.getElementById("initialExpenseSaveButton").textContent = "保存する";
    document.getElementById("deleteInitialExpenseButton").classList.add("hidden");
    setDefaultEntryDates(true);
    document.getElementById("initialExpenseDialog").showModal();
  }

  function bindDynamicButtons() {
    document.querySelectorAll("[data-classify]").forEach(function (button) {
      button.onclick = function () {
        openTransactionEditor(Number(button.getAttribute("data-classify")), "classify");
      };
    });

    document.querySelectorAll("[data-edit-tx]").forEach(function (button) {
      button.onclick = function () {
        openTransactionEditor(Number(button.getAttribute("data-edit-tx")), "edit");
      };
    });

    document.querySelectorAll("[data-edit-initial-expense]").forEach(function (button) {
      button.onclick = function () {
        openInitialExpenseEditor(Number(button.getAttribute("data-edit-initial-expense")));
      };
    });

  }

  function initMonthSelect() {
    var select = document.getElementById("monthSelect");
    if (!select) return;

    var options = [];
    for (var i = 0; i < 60; i += 1) {
      var key = addMonths(OPERATION_START_MONTH, i);
      options.push('<option value="' + key + '">' +
        key.split("-")[0] + "年" + Number(key.split("-")[1]) + "月</option>");
    }
    select.innerHTML = options.join("");
    select.value = state.currentMonth;
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

  document.querySelectorAll("[data-open-initial-expense]").forEach(function (button) {
    button.addEventListener("click", function () {
      openInitialExpenseAdd();
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
    button.addEventListener("click", function () {
      var dialog = button.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  document.querySelectorAll("[data-switch-dialog]").forEach(function (button) {
    button.addEventListener("click", function () {
      var currentDialog = button.closest("dialog");
      if (currentDialog) currentDialog.close();
      var target = document.getElementById(button.getAttribute("data-switch-dialog"));
      if (target) target.showModal();
    });
  });

  document.getElementById("monthSelect").addEventListener("change", function (event) {
    state.currentMonth = event.target.value;
    setDefaultEntryDates(true);
    render();
  });

  document.querySelectorAll("[data-carryover]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var category = button.getAttribute("data-carryover");
      var summary = calculateSummary();
      var amount = category === "living" ? summary.livingSettlement : summary.loanNet;
      if (!amount) return;

      var label = category === "living" ? "生活費の精算差額" : "立替金";
      var nextMonth = addMonths(state.currentMonth, 1);
      var ok = window.confirm(
        monthLabel(state.currentMonth) + "の" + label + " " +
        yen(Math.abs(amount)) + "（" +
        directionText(amount).replace("へ支払い","") + "）を" +
        monthLabel(nextMonth) + "へ繰り越しますか？"
      );
      if (!ok) return;

      try {
        await window.kakeiboDb.saveCarryover(category, state.currentMonth, amount);
        state.data = await window.kakeiboDb.getInitialData();
        render();
      } catch (e) {
        console.error(e);
        alert("繰越を保存できませんでした。");
      }
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

  document.getElementById("deleteTransactionButton").addEventListener("click", async function () {
    var id = Number(document.getElementById("classifyId").value);
    var tx = state.data.transactions.find(function (x) {
      return Number(x.id) === id;
    });
    if (!tx) return;

    var ok = window.confirm("「" + tx.merchant_name + "」" + yen(tx.amount) + " を削除しますか？\nこの操作は元に戻せません。");
    if (!ok) return;

    try {
      await window.kakeiboDb.deleteTransaction(id);
      document.getElementById("classifyDialog").close();
      state.currentClassifyId = null;
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("明細を削除できませんでした。");
    }
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
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("明細の変更を保存できませんでした。");
    }
  });

  document.getElementById("loanForm").addEventListener("submit", async function () {
    var loan = {
      date: document.getElementById("loanDate").value,
      description: document.getElementById("loanDescription").value.trim(),
      amount: Number(document.getElementById("loanAmount").value || 0),
      lender: document.getElementById("loanLender").value,
      memo: document.getElementById("loanMemo").value.trim()
    };

    if (!loan.date || !loan.description || loan.amount <= 0) return;

    try {
      await window.kakeiboDb.addLoan(loan);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("loanForm").reset();
      setDefaultEntryDates();
      render();
    } catch (e) {
      console.error(e);
      alert("立替を保存できませんでした。");
    }
  });

  document.getElementById("manualExpenseForm").addEventListener("submit", async function () {
    var tx = {
      date: document.getElementById("manualExpenseDate").value,
      merchant_name: document.getElementById("manualExpenseName").value.trim(),
      amount: Number(document.getElementById("manualExpenseAmount").value || 0),
      category_name: document.getElementById("manualExpenseCategory").value,
      scope: document.getElementById("manualExpenseScope").value,
      payer: document.getElementById("manualExpensePayer").value,
      memo: document.getElementById("manualExpenseMemo").value.trim()
    };

    if (!tx.date || !tx.merchant_name || tx.amount < 0 || !tx.category_name) return;

    try {
      await window.kakeiboDb.addManualTransaction(tx);
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("manualExpenseForm").reset();
      setDefaultEntryDates();
      render();
    } catch (e) {
      console.error(e);
      alert("支出を保存できませんでした。");
    }
  });

  document.getElementById("initialExpenseForm").addEventListener("submit", async function () {
    var id = Number(document.getElementById("initialExpenseId").value || 0);
    var expense = {
      item_name: document.getElementById("initialExpenseItem").value.trim(),
      amount: Number(document.getElementById("initialExpenseAmount").value || 0),
      payer: document.getElementById("initialExpensePayer").value,
      date: document.getElementById("initialExpenseDate").value,
      memo: document.getElementById("initialExpenseMemo").value.trim()
    };

    if (!expense.item_name || !expense.date || expense.amount <= 0) return;

    try {
      if (id) {
        await window.kakeiboDb.updateInitialExpense(id, expense);
      } else {
        await window.kakeiboDb.addInitialExpense(expense);
      }
      state.data = await window.kakeiboDb.getInitialData();
      document.getElementById("initialExpenseForm").reset();
      document.getElementById("initialExpenseId").value = "";
      document.getElementById("deleteInitialExpenseButton").classList.add("hidden");
      setDefaultEntryDates();
      render();
    } catch (e) {
      console.error(e);
      alert("立替金を保存できませんでした。");
    }
  });

  document.getElementById("deleteInitialExpenseButton").addEventListener("click", async function () {
    var id = Number(document.getElementById("initialExpenseId").value || 0);
    var expense = (state.data.initial_expenses || []).find(function (x) {
      return Number(x.id) === id;
    });
    if (!id || !expense) return;

    var ok = window.confirm("「" + expense.item_name + "」" + yen(expense.amount) + " を削除しますか？\n返済残高も再計算されます。");
    if (!ok) return;

    try {
      await window.kakeiboDb.deleteInitialExpense(id);
      document.getElementById("initialExpenseDialog").close();
      document.getElementById("initialExpenseForm").reset();
      document.getElementById("initialExpenseId").value = "";
      state.data = await window.kakeiboDb.getInitialData();
      render();
    } catch (e) {
      console.error(e);
      alert("立替金を削除できませんでした。");
    }
  });

  function setDefaultEntryDates(force) {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    var today = local.toISOString().slice(0, 10);
    var actualMonth = today.slice(0, 7);
    var defaultDate = actualMonth === state.currentMonth
      ? today
      : state.currentMonth + "-01";

    ["manualExpenseDate", "loanDate", "initialExpenseDate"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input && (force || !input.value)) input.value = defaultDate;
    });
  }

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
      initMonthSelect();
      state.data = await window.kakeiboDb.getInitialData();
      setDefaultEntryDates();
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
    state.currentMonth = defaultMonthKey();
  }

  window.KakeiboApp = {
    start: start,
    reset: reset
  };
})();
