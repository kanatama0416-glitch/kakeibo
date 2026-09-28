(function () {
  var config = window.KAKEIBO_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    throw new Error("Supabase configuration is missing.");
  }

  var client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  function categoryName(row) {
    return row && row.categories ? row.categories.name : null;
  }

  async function getSession() {
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session;
  }

  async function signInWithPassword(email, password) {
    var result = await client.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpWithPassword(email, password) {
    var redirectTo = window.location.origin + window.location.pathname;
    var result = await client.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: redirectTo
      }
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function sendPasswordReset(email) {
    var redirectTo = window.location.origin + window.location.pathname;
    var result = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function updatePassword(password) {
    var result = await client.auth.updateUser({ password: password });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signOut() {
    var result = await client.auth.signOut();
    if (result.error) throw result.error;
  }

  function onAuthStateChange(callback) {
    return client.auth.onAuthStateChange(function (event, session) {
      callback(event, session);
    });
  }

  async function checkAccess() {
    var result = await client.from("app_settings").select("id").eq("id", 1).limit(1);
    if (result.error) throw result.error;
    return (result.data || []).length > 0;
  }

  async function fetchAllTransactions() {
    var pageSize = 1000;
    var from = 0;
    var all = [];

    while (true) {
      var result = await client.from("transactions")
        .select("id,transaction_date,merchant_name,merchant_raw,amount,scope,payer,status,source,memo,is_demo,card_provider,card_label,categories(name)")
        .eq("is_demo", false)
        .order("transaction_date", { ascending:false })
        .order("id", { ascending:false })
        .range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      var rows = result.data || [];
      all = all.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function getInitialData() {
    var session = await getSession();
    if (!session) throw new Error("Not authenticated");

    var results = await Promise.all([
      client.from("categories").select("id,name,icon").order("id"),
      client.from("merchant_rules").select("id,merchant_name,scope,mode,is_demo,categories(name)").order("id"),
      fetchAllTransactions(),
      client.from("repayment_plans")
        .select("id,title,original_amount,remaining_amount,monthly_amount,lender,borrower,is_demo")
        .eq("is_demo", false)
        .order("id")
        .limit(1),
      client.from("initial_expenses")
        .select("id,expense_date,item_name,amount,payer,memo,created_at")
        .order("expense_date", { ascending:false })
        .order("id", { ascending:false }),
      client.from("monthly_carryovers")
        .select("id,from_month,to_month,category,amount,updated_at")
        .order("from_month", { ascending:true }),
      client.from("app_settings")
        .select("id,me_share_percent,updated_at")
        .eq("id", 1)
        .limit(1),
      client.from("monthly_settlements")
        .select("id,settlement_month,amount,paid_at,created_at,updated_at")
        .order("settlement_month", { ascending:true }),
      client.from("monthly_repayment_amounts")
        .select("id,repayment_plan_id,repayment_month,amount,updated_at")
        .order("repayment_month", { ascending:true }),
      client.from("repayments")
        .select("id,repayment_plan_id,repayment_date,repayment_month,amount,is_demo,created_at")
        .eq("is_demo", false)
        .order("repayment_month", { ascending:true })
    ]);

    results.forEach(function (r, index) {
      if (index !== 2 && r.error) throw r.error;
    });

    return {
      categories: results[0].data || [],
      merchant_rules: (results[1].data || []).map(function (r) {
        return {
          id:r.id,
          merchant_name:r.merchant_name,
          category_name:categoryName(r),
          scope:r.scope,
          mode:r.mode
        };
      }),
      transactions: (results[2] || []).map(function (t) {
        return {
          id:t.id,
          date:t.transaction_date,
          merchant_name:t.merchant_name,
          merchant_raw:t.merchant_raw,
          amount:t.amount,
          category_name:categoryName(t),
          scope:t.scope,
          payer:t.payer,
          status:t.status,
          source:t.source,
          memo:t.memo,
          card_provider:t.card_provider,
          card_label:t.card_label
        };
      }),
      repayment_plan: (results[3].data || [])[0] || null,
      initial_expenses: (results[4].data || []).map(function (x) {
        return {
          id:x.id,
          date:x.expense_date,
          item_name:x.item_name,
          amount:x.amount,
          payer:x.payer,
          memo:x.memo
        };
      }),
      carryovers: (results[5].data || []).map(function (x) {
        return {
          id:x.id,
          from_month:x.from_month,
          to_month:x.to_month,
          category:x.category,
          amount:x.amount,
          updated_at:x.updated_at
        };
      }),
      settings: (results[6].data || [])[0] || { id:1, me_share_percent:50, updated_at:null },
      settlements: (results[7].data || []).map(function (x) {
        return {
          id:x.id,
          settlement_month:x.settlement_month,
          amount:Number(x.amount || 0),
          paid_at:x.paid_at,
          created_at:x.created_at,
          updated_at:x.updated_at
        };
      }),
      repayment_amounts: (results[8].data || []).map(function (x) {
        return {
          id:x.id,
          repayment_plan_id:Number(x.repayment_plan_id),
          repayment_month:x.repayment_month,
          amount:Number(x.amount || 0),
          updated_at:x.updated_at
        };
      }),
      repayments: (results[9].data || []).map(function (x) {
        return {
          id:x.id,
          repayment_plan_id:Number(x.repayment_plan_id),
          repayment_date:x.repayment_date,
          repayment_month:x.repayment_month,
          amount:Number(x.amount || 0),
          created_at:x.created_at
        };
      })
    };
  }

  function normalizeMerchantKey(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[\s　]/g, "")
      .replace(/[・･._\-—–ー\/\\（）()［\]\[\]「」『』]/g, "");
  }

  async function upsertMerchantRuleForTransaction(merchantName, categoryId, scope) {
    var rulesResult = await client.from("merchant_rules")
      .select("id,merchant_name")
      .eq("is_demo", false);
    if (rulesResult.error) throw rulesResult.error;

    var key = normalizeMerchantKey(merchantName);
    var existing = (rulesResult.data || []).find(function (row) {
      return normalizeMerchantKey(row.merchant_name) === key;
    });

    var payload = {
      merchant_name:merchantName,
      category_id:categoryId,
      scope:scope,
      mode:"auto",
      is_demo:false
    };

    var result = existing
      ? await client.from("merchant_rules").update(payload).eq("id", existing.id)
      : await client.from("merchant_rules").insert(payload);
    if (result.error) throw result.error;
  }

  async function updateTransaction(id, tx, rememberMerchant) {
    var categoryResult = await client.from("categories")
      .select("id")
      .eq("name", tx.category_name)
      .limit(1);
    if (categoryResult.error) throw categoryResult.error;

    var categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;
    if (!categoryId) throw new Error("費目を選んでください。");

    var amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error("金額は0円以外で指定してください。");
    }

    var updateResult = await client.from("transactions")
      .update({
        transaction_date:tx.date,
        merchant_name:String(tx.merchant_name || "").trim(),
        amount:Math.round(amount),
        category_id:categoryId,
        scope:tx.scope,
        payer:tx.payer,
        status:amount < 0 ? "refunded" : "confirmed",
        memo:tx.memo || null
      })
      .eq("id", id)
      .eq("is_demo", false);
    if (updateResult.error) throw updateResult.error;

    if (rememberMerchant) {
      await upsertMerchantRuleForTransaction(
        String(tx.merchant_name || "").trim(),
        categoryId,
        tx.scope
      );
    }
  }

  async function deleteTransaction(id) {
    var result = await client.from("transactions")
      .delete()
      .eq("id", id)
      .eq("is_demo", false);
    if (result.error) throw result.error;
  }

  async function addManualTransaction(tx, rememberMerchant) {
    var categoryResult = await client.from("categories")
      .select("id").eq("name", tx.category_name).limit(1);
    if (categoryResult.error) throw categoryResult.error;
    var categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;

    var amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error("金額は0円以外で指定してください。");
    }

    var result = await client.from("transactions").insert({
      transaction_date:tx.date,
      merchant_name:tx.merchant_name,
      amount:Math.round(amount),
      category_id:categoryId,
      scope:tx.scope,
      payer:tx.payer,
      status:amount < 0 ? "refunded" : "confirmed",
      source:"manual",
      memo:tx.memo || null,
      is_demo:false
    }).select("id,transaction_date,merchant_name,amount,scope,payer,status,source,memo").single();

    if (result.error) throw result.error;

    if (rememberMerchant) {
      await upsertMerchantRuleForTransaction(
        String(tx.merchant_name || "").trim(),
        categoryId,
        tx.scope
      );
    }

    return result.data;
  }

  async function importCsvTransactions(rows) {
    if (!rows || !rows.length) return [];

    var categoryResult = await client.from("categories").select("id,name");
    if (categoryResult.error) throw categoryResult.error;
    var categoryIds = {};
    (categoryResult.data || []).forEach(function (category) {
      categoryIds[category.name] = category.id;
    });

    var payload = rows.map(function (tx) {
      var amount = Number(tx.amount || 0);
      var categoryId = tx.category_name ? (categoryIds[tx.category_name] || null) : null;
      return {
        transaction_date:tx.date,
        merchant_name:tx.merchant_name,
        merchant_raw:tx.merchant_raw || tx.merchant_name,
        amount:Math.round(amount),
        category_id:categoryId,
        scope:categoryId ? (tx.scope || "shared") : null,
        payer:tx.payer || "me",
        status:categoryId ? (amount < 0 ? "refunded" : "confirmed") : "unclassified",
        source:tx.source === "pdf" ? "pdf" : "csv",
        memo:tx.memo || null,
        card_provider:tx.card_provider || null,
        card_label:tx.card_label || null,
        is_demo:false
      };
    }).filter(function (row) {
      return row.amount !== 0;
    });

    if (!payload.length) return [];
    var result = await client.from("transactions")
      .insert(payload)
      .select("id,transaction_date,merchant_name,amount,scope,payer,status,source,memo,card_provider,card_label");
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function addInitialExpense(expense) {
    var result = await client.from("initial_expenses")
      .insert({
        expense_date: expense.date,
        item_name: expense.item_name,
        amount: expense.amount,
        payer: expense.payer,
        memo: expense.memo || null
      })
      .select("id,expense_date,item_name,amount,payer,memo")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function updateInitialExpense(id, expense) {
    var result = await client.from("initial_expenses")
      .update({
        expense_date: expense.date,
        item_name: expense.item_name,
        amount: expense.amount,
        payer: expense.payer,
        memo: expense.memo || null
      })
      .eq("id", id)
      .select("id,expense_date,item_name,amount,payer,memo")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function deleteInitialExpense(id) {
    var result = await client.from("initial_expenses")
      .delete()
      .eq("id", id);
    if (result.error) throw result.error;
  }

  function nextMonthFirst(monthKey) {
    var parts = monthKey.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]) + 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    return year + "-" + String(month).padStart(2, "0") + "-01";
  }

  async function saveCarryover(category, fromMonth, amount) {
    var row = {
      from_month: fromMonth + "-01",
      to_month: nextMonthFirst(fromMonth),
      category: category,
      amount: Number(amount),
      updated_at: new Date().toISOString()
    };

    var result = await client.from("monthly_carryovers")
      .upsert(row, { onConflict: "from_month,category" })
      .select("id,from_month,to_month,category,amount,updated_at")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function deleteCarryover(category, fromMonth) {
    var result = await client.from("monthly_carryovers")
      .delete()
      .eq("from_month", fromMonth + "-01")
      .eq("category", category);
    if (result.error) throw result.error;
  }

  async function saveAppSettings(meSharePercent) {
    var percent = Number(meSharePercent);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new Error("負担割合は0〜100の整数で指定してください。");
    }

    var result = await client.from("app_settings")
      .upsert({
        id:1,
        me_share_percent:percent,
        updated_at:new Date().toISOString()
      }, { onConflict:"id" })
      .select("id,me_share_percent,updated_at")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function addCategory(name) {
    var value = String(name || "").trim();
    if (!value) throw new Error("費目名を入力してください。");

    var result = await client.from("categories")
      .insert({ name:value, is_demo:false })
      .select("id,name,icon")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function updateCategory(id, name) {
    var value = String(name || "").trim();
    if (!value) throw new Error("費目名を入力してください。");

    var result = await client.from("categories")
      .update({ name:value })
      .eq("id", Number(id))
      .select("id,name,icon")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function deleteCategory(id) {
    var result = await client.from("categories")
      .delete()
      .eq("id", Number(id));
    if (result.error) throw result.error;
  }

  async function saveMerchantRule(rule) {
    var categoryId = null;
    if (rule.mode === "auto") {
      var categoryResult = await client.from("categories")
        .select("id")
        .eq("name", rule.category_name)
        .limit(1);
      if (categoryResult.error) throw categoryResult.error;
      categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;
      if (!categoryId) throw new Error("費目を選んでください。");
    }

    var payload = {
      merchant_name:String(rule.merchant_name || "").trim(),
      category_id:categoryId,
      scope:rule.scope || "shared",
      mode:rule.mode || "auto",
      is_demo:false
    };
    if (!payload.merchant_name) throw new Error("店舗名を入力してください。");

    var rulesResult = await client.from("merchant_rules")
      .select("id,merchant_name")
      .eq("is_demo", false);
    if (rulesResult.error) throw rulesResult.error;

    var key = normalizeMerchantKey(payload.merchant_name);
    var duplicate = (rulesResult.data || []).find(function (row) {
      return normalizeMerchantKey(row.merchant_name) === key &&
        Number(row.id) !== Number(rule.id || 0);
    });

    var targetId = rule.id || (duplicate && duplicate.id) || null;
    var query = targetId
      ? client.from("merchant_rules").update(payload).eq("id", Number(targetId))
      : client.from("merchant_rules").insert(payload);

    var result = await query
      .select("id,merchant_name,scope,mode,is_demo,categories(name)")
      .single();
    if (result.error) throw result.error;

    return {
      id:result.data.id,
      merchant_name:result.data.merchant_name,
      category_name:categoryName(result.data),
      scope:result.data.scope,
      mode:result.data.mode
    };
  }

  async function deleteMerchantRule(id) {
    var result = await client.from("merchant_rules")
      .delete()
      .eq("id", Number(id));
    if (result.error) throw result.error;
  }

  async function saveMonthlyRepaymentAmount(planId, repaymentMonth, amount) {
    var value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("返済額は0円以上で指定してください。");
    }

    var result = await client.from("monthly_repayment_amounts")
      .upsert({
        repayment_plan_id:Number(planId),
        repayment_month:repaymentMonth + "-01",
        amount:Math.round(value),
        updated_at:new Date().toISOString()
      }, { onConflict:"repayment_plan_id,repayment_month" })
      .select("id,repayment_plan_id,repayment_month,amount,updated_at")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function markSettlementPaid(settlementMonth, amount, planId, repaymentAmount) {
    var result = await client.rpc("kakeibo_mark_settlement_paid", {
      p_settlement_month:settlementMonth + "-01",
      p_settlement_amount:Math.round(Number(amount || 0)),
      p_plan_id:planId ? Number(planId) : null,
      p_repayment_amount:Math.round(Number(repaymentAmount || 0))
    });
    if (result.error) throw result.error;
  }

  async function undoSettlementPaid(settlementMonth) {
    var result = await client.rpc("kakeibo_undo_settlement_paid", {
      p_settlement_month:settlementMonth + "-01"
    });
    if (result.error) throw result.error;
  }

  async function getAuditLogs() {
    var pageSize = 1000;
    var from = 0;
    var all = [];

    while (true) {
      var result = await client.from("audit_logs")
        .select("id,changed_at,actor_user_id,actor_email,action,table_name,record_id,changed_fields,before_data,after_data")
        .order("changed_at", { ascending:false })
        .range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      var rows = result.data || [];
      all = all.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  window.kakeiboDb = {
    client: client,
    getSession: getSession,
    signInWithPassword: signInWithPassword,
    signUpWithPassword: signUpWithPassword,
    sendPasswordReset: sendPasswordReset,
    updatePassword: updatePassword,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    checkAccess: checkAccess,
    getInitialData: getInitialData,
    getAuditLogs: getAuditLogs,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    addManualTransaction: addManualTransaction,
    importCsvTransactions: importCsvTransactions,
    addInitialExpense: addInitialExpense,
    updateInitialExpense: updateInitialExpense,
    deleteInitialExpense: deleteInitialExpense,
    saveCarryover: saveCarryover,
    deleteCarryover: deleteCarryover,
    saveAppSettings: saveAppSettings,
    addCategory: addCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    saveMerchantRule: saveMerchantRule,
    deleteMerchantRule: deleteMerchantRule,
    saveMonthlyRepaymentAmount: saveMonthlyRepaymentAmount,
    markSettlementPaid: markSettlementPaid,
    undoSettlementPaid: undoSettlementPaid
  };
})();
