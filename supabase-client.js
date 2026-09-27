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

  async function signInWithEmail(email) {
    var redirectTo = window.location.origin + window.location.pathname;
    var result = await client.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true
      }
    });
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
    var result = await client.from("categories").select("id").limit(1);
    if (result.error) throw result.error;
    return (result.data || []).length > 0;
  }

  async function getInitialData() {
    var session = await getSession();
    if (!session) throw new Error("Not authenticated");

    var results = await Promise.all([
      client.from("categories").select("id,name,icon").order("id"),
      client.from("merchant_rules").select("id,merchant_name,scope,mode,is_demo,categories(name)").order("id"),
      client.from("transactions")
        .select("id,transaction_date,merchant_name,merchant_raw,amount,scope,payer,status,source,memo,is_demo,categories(name)")
        .eq("is_demo", false)
        .order("transaction_date", { ascending: false }),
      client.from("loans")
        .select("id,loan_date,description,amount,lender,borrower,status,memo,is_demo")
        .eq("is_demo", false)
        .order("loan_date", { ascending: false }),
      client.from("repayment_plans")
        .select("id,title,original_amount,remaining_amount,monthly_amount,lender,borrower,is_demo")
        .eq("is_demo", false)
        .order("id")
        .limit(1),
      client.from("initial_expenses")
        .select("id,expense_date,item_name,amount,payer,memo,created_at")
        .order("expense_date", { ascending: false })
        .order("id", { ascending: false }),
      client.from("monthly_carryovers")
        .select("id,from_month,to_month,category,amount,updated_at")
        .order("from_month", { ascending: true })
    ]);

    results.forEach(function (r) {
      if (r.error) throw r.error;
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
      transactions: (results[2].data || []).map(function (t) {
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
          memo:t.memo
        };
      }),
      loans: (results[3].data || []).map(function (x) {
        return {
          id:x.id,
          date:x.loan_date,
          description:x.description,
          amount:x.amount,
          lender:x.lender,
          borrower:x.borrower,
          status:x.status,
          memo:x.memo
        };
      }),
      repayment_plan: (results[4].data || [])[0] || null,
      initial_expenses: (results[5].data || []).map(function (x) {
        return {
          id:x.id,
          date:x.expense_date,
          item_name:x.item_name,
          amount:x.amount,
          payer:x.payer,
          memo:x.memo
        };
      }),
      carryovers: (results[6].data || []).map(function (x) {
        return {
          id:x.id,
          from_month:x.from_month,
          to_month:x.to_month,
          category:x.category,
          amount:x.amount,
          updated_at:x.updated_at
        };
      })
    };
  }

  async function classifyTransaction(id, categoryNameValue, scope, rememberMerchant) {
    var categoryResult = await client.from("categories")
      .select("id").eq("name", categoryNameValue).limit(1);
    if (categoryResult.error) throw categoryResult.error;

    var categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;

    var updateResult = await client.from("transactions")
      .update({ category_id: categoryId, scope: scope, status: "confirmed" })
      .eq("id", id)
      .eq("is_demo", false);
    if (updateResult.error) throw updateResult.error;

    if (rememberMerchant) {
      var txResult = await client.from("transactions")
        .select("merchant_name")
        .eq("id", id)
        .eq("is_demo", false)
        .limit(1);
      if (txResult.error) throw txResult.error;

      if (txResult.data[0]) {
        var ruleResult = await client.from("merchant_rules").insert({
          merchant_name: txResult.data[0].merchant_name,
          category_id: categoryId,
          scope: scope,
          mode: "auto",
          is_demo: false
        });
        if (ruleResult.error) throw ruleResult.error;
      }
    }
  }

  async function deleteTransaction(id) {
    var result = await client.from("transactions")
      .delete()
      .eq("id", id)
      .eq("is_demo", false);
    if (result.error) throw result.error;
  }

  async function addLoan(loan) {
    var borrower = loan.lender === "me" ? "partner" : "me";
    var result = await client.from("loans").insert({
      loan_date: loan.date,
      description: loan.description,
      amount: loan.amount,
      lender: loan.lender,
      borrower: borrower,
      status: "open",
      memo: loan.memo || null,
      is_demo: false
    }).select("id,loan_date,description,amount,lender,borrower,status,memo").single();

    if (result.error) throw result.error;
    return result.data;
  }

  async function addManualTransaction(tx) {
    var categoryResult = await client.from("categories")
      .select("id").eq("name", tx.category_name).limit(1);
    if (categoryResult.error) throw categoryResult.error;

    var categoryId = categoryResult.data[0] ? categoryResult.data[0].id : null;
    var result = await client.from("transactions").insert({
      transaction_date: tx.date,
      merchant_name: tx.merchant_name,
      amount: tx.amount,
      category_id: categoryId,
      scope: tx.scope,
      payer: tx.payer,
      status: "confirmed",
      source: "manual",
      memo: tx.memo || null,
      is_demo: false
    }).select("id,transaction_date,merchant_name,amount,scope,payer,status,source,memo").single();

    if (result.error) throw result.error;
    return result.data;
  }

  async function syncInitialExpenseRepaymentPlan() {
    var expenseResult = await client.from("initial_expenses")
      .select("amount,payer");
    if (expenseResult.error) throw expenseResult.error;

    var expenses = expenseResult.data || [];
    var total = expenses.reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);
    var paidByMe = expenses.filter(function (x) {
      return x.payer === "me";
    }).reduce(function (sum, x) {
      return sum + Number(x.amount || 0);
    }, 0);

    // Basic household split is currently 50/50.
    // Positive means うー owes にゃち; negative means にゃち owes うー.
    var net = Math.round(paidByMe - total / 2);
    var originalAmount = Math.abs(net);
    var lender = net >= 0 ? "me" : "partner";
    var borrower = net >= 0 ? "partner" : "me";

    var planResult = await client.from("repayment_plans")
      .select("id,original_amount,remaining_amount,monthly_amount,lender,borrower")
      .eq("is_demo", false)
      .order("id")
      .limit(1);
    if (planResult.error) throw planResult.error;

    var current = (planResult.data || [])[0] || null;
    if (!current) {
      var insertPlan = await client.from("repayment_plans").insert({
        title: "同棲初期費用",
        original_amount: originalAmount,
        remaining_amount: originalAmount,
        monthly_amount: 0,
        lender: lender,
        borrower: borrower,
        is_demo: false
      });
      if (insertPlan.error) throw insertPlan.error;
      return;
    }

    var sameDirection = current.lender === lender && current.borrower === borrower;
    var repaid = sameDirection
      ? Math.max(0, Number(current.original_amount || 0) - Number(current.remaining_amount || 0))
      : 0;
    var remainingAmount = Math.max(0, originalAmount - repaid);

    var updatePlan = await client.from("repayment_plans")
      .update({
        original_amount: originalAmount,
        remaining_amount: remainingAmount,
        lender: lender,
        borrower: borrower
      })
      .eq("id", current.id)
      .eq("is_demo", false);
    if (updatePlan.error) throw updatePlan.error;
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

    await syncInitialExpenseRepaymentPlan();
    return result.data;
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

  async function updateRepaymentAmount(planId, amount) {
    var result = await client.from("repayment_plans")
      .update({ monthly_amount: amount })
      .eq("id", planId)
      .eq("is_demo", false);
    if (result.error) throw result.error;
  }

  window.kakeiboDb = {
    client: client,
    getSession: getSession,
    signInWithEmail: signInWithEmail,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    checkAccess: checkAccess,
    getInitialData: getInitialData,
    classifyTransaction: classifyTransaction,
    deleteTransaction: deleteTransaction,
    addLoan: addLoan,
    addManualTransaction: addManualTransaction,
    addInitialExpense: addInitialExpense,
    saveCarryover: saveCarryover,
    updateRepaymentAmount: updateRepaymentAmount
  };
})();
