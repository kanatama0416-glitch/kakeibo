-- Kakeibo prototype seed data
insert into public.categories (name, icon) values
  ('食費','🛒'),
  ('日用品','🧴'),
  ('光熱費','💡'),
  ('外食','☕'),
  ('家具・家電','🪑'),
  ('その他','•')
on conflict (name) do nothing;

insert into public.merchant_rules (merchant_name, category_id, scope, mode)
select 'アルビス', id, 'shared', 'auto' from public.categories where name='食費';

insert into public.merchant_rules (merchant_name, category_id, scope, mode)
select 'クスリのアオキ', id, 'shared', 'auto' from public.categories where name='日用品';

insert into public.merchant_rules (merchant_name, category_id, scope, mode)
select '北陸電力', id, 'shared', 'auto' from public.categories where name='光熱費';

insert into public.merchant_rules (merchant_name, category_id, scope, mode)
values ('Amazon', null, 'shared', 'confirm');

insert into public.transactions (transaction_date, merchant_name, merchant_raw, amount, category_id, scope, payer, status, source)
select '2026-09-23','アルビス 小松店','ALBIS KOMATSU',3842,id,'shared','me','confirmed','epos_email'
from public.categories where name='食費';

insert into public.transactions (transaction_date, merchant_name, amount, category_id, scope, payer, status, source)
select '2026-09-21','北陸電力',8920,id,'shared','me','confirmed','epos_email'
from public.categories where name='光熱費';

insert into public.transactions (transaction_date, merchant_name, amount, category_id, scope, payer, status, source)
select '2026-09-20','スターバックス',720,id,'mine','me','confirmed','epos_email'
from public.categories where name='外食';

insert into public.transactions (transaction_date, merchant_name, merchant_raw, amount, scope, payer, status, source)
values
('2026-09-20','AMZN MKTP JP','AMZN MKTP JP',2480,null,'partner','unclassified','epos_email'),
('2026-09-18','KOMATSU STATION SHOP','KOMATSU STATION SHOP',1260,null,'me','unclassified','epos_email');

insert into public.transactions (transaction_date, merchant_name, amount, category_id, scope, payer, status, source)
select '2026-09-17','クスリのアオキ',4680,id,'shared','partner','confirmed','epos_email'
from public.categories where name='日用品';

insert into public.transactions (transaction_date, merchant_name, amount, category_id, scope, payer, status, source)
select '2026-09-15','大阪屋ショップ',6150,id,'shared','me','confirmed','manual'
from public.categories where name='食費';

insert into public.loans (loan_date, description, amount, lender, borrower, status) values
('2026-09-18','映画チケット',3800,'me','partner','open'),
('2026-09-12','タクシー代',1600,'partner','me','open'),
('2026-09-10','イベントチケット',4300,'me','partner','open');

insert into public.repayment_plans (title, original_amount, remaining_amount, monthly_amount, lender, borrower)
values ('同棲初期費用',300000,180000,20000,'me','partner');