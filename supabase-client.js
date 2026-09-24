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
        .limit(1)
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
      repayment_plan: (results[4].data || [])[0] || null
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
    updateRepaymentAmount: updateRepaymentAmount
  };
})();
