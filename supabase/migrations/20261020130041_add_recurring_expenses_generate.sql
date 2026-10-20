-- 毎月の固定費：再開時のさかのぼり防止、明細との対応、生成関数（20261020130024 の続き）

-- 一時停止から再開したときは、止めていた月をさかのぼって入れない（再開した月から入れる）。
-- 更新日時もここで付ける。
create or replace function private.kakeibo_recurring_expense_before_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_month date :=
    (date_trunc('month', (now() at time zone 'Asia/Tokyo')) - interval '1 month')::date;
begin
  new.updated_at := now();
  if old.active = false and new.active = true and v_previous_month >= new.start_month then
    new.last_generated_month := greatest(coalesce(old.last_generated_month, v_previous_month), v_previous_month);
  end if;
  return new;
end;
$function$;

revoke all on function private.kakeibo_recurring_expense_before_update() from public, anon, authenticated;

create trigger kakeibo_recurring_expense_before_update
  before update on public.recurring_expenses
  for each row execute function private.kakeibo_recurring_expense_before_update();

-- 自動で入れた支出と、元の固定費・何月分かの対応。
alter table public.transactions
  add column if not exists recurring_expense_id bigint references public.recurring_expenses(id) on delete set null,
  add column if not exists recurring_month date;

alter table public.transactions add constraint transactions_recurring_month_check check (
  recurring_month is null or recurring_month = date_trunc('month', recurring_month)::date
);

alter table public.transactions add constraint transactions_recurring_key
  unique (recurring_expense_id, recurring_month);

create index if not exists transactions_recurring_expense_id_idx
  on public.transactions (recurring_expense_id);

comment on column public.transactions.recurring_expense_id is '毎月の固定費から自動で入れた支出の元。null は通常の明細。';
comment on column public.transactions.recurring_month is '固定費の何月分か（月初日）。';

-- 開始月〜今月（日本時間）のうち、まだ入れていない月の支出を入れる。入れた件数を返す。
-- last_generated_month は画面から書き換えられないため security definer で動かし、許可ユーザーかを先に確かめる。
create or replace function public.kakeibo_generate_recurring_expenses()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current_month date := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
  v_template record;
  v_month date;
  v_date date;
  v_inserted integer := 0;
  v_count integer;
begin
  if not private.kakeibo_is_allowed() then
    raise exception 'KAKEIBO_NOT_ALLOWED';
  end if;

  -- ふたりが同時に開いても、同じ月を二重に入れない（一意制約でも防ぐ）。
  perform pg_advisory_xact_lock(hashtext('kakeibo_recurring'));

  for v_template in
    select * from public.recurring_expenses r
    where r.active = true
      and r.start_month <= v_current_month
      and (r.last_generated_month is null or r.last_generated_month < v_current_month)
    order by r.id
    for update
  loop
    v_month := case
      when v_template.last_generated_month is null then v_template.start_month
      else (v_template.last_generated_month + interval '1 month')::date
    end;

    while v_month <= v_current_month loop
      v_date := least(
        v_month + (v_template.day_of_month - 1),
        (v_month + interval '1 month' - interval '1 day')::date
      );

      insert into public.transactions (
        transaction_date, merchant_name, amount, category_id, scope, payer,
        me_share_amount, status, source, memo, is_demo,
        recurring_expense_id, recurring_month
      ) values (
        v_date, v_template.name, v_template.amount, v_template.category_id,
        v_template.scope, v_template.payer, v_template.me_share_amount,
        'confirmed', 'manual', v_template.memo, false,
        v_template.id, v_month
      )
      on conflict (recurring_expense_id, recurring_month) do nothing;

      get diagnostics v_count = row_count;
      v_inserted := v_inserted + v_count;
      v_month := (v_month + interval '1 month')::date;
    end loop;

    update public.recurring_expenses
       set last_generated_month = v_current_month
     where id = v_template.id;
  end loop;

  return v_inserted;
end;
$function$;

revoke all on function public.kakeibo_generate_recurring_expenses() from public, anon;
grant execute on function public.kakeibo_generate_recurring_expenses() to authenticated;
