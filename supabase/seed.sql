-- Prototype demo data
insert into public.categories (name, icon, is_demo) values
  ('食費','🛒',true),
  ('日用品','🧴',true),
  ('光熱費','💡',true),
  ('外食','☕',true),
  ('家具・家電','🪑',true),
  ('その他','•',true)
on conflict (name) do update set is_demo = excluded.is_demo, icon = excluded.icon;

insert into public.merchant_rules (merchant_name, category_id, scope, mode, is_demo)
select 'アルビス', id, 'shared', 'auto', true from public.categories where name='食費';
insert into public.merchant_rules (merchant_name, category_id, scope, mode, is_demo)
select 'クスリのアオキ', id, 'shared', 'auto', true from public.categories where name='日用品';
insert into public.merchant_rules (merchant_name, category_id, scope, mode, is_demo)
select '北陸電力', id, 'shared', 'auto', true from public.categories where name='光熱費';
insert into public.merchant_rules (merchant_name, category_id, scope, mode, is_demo)
values ('Amazon', null, 'shared', 'confirm', true);

insert into public.transactions
(transaction_date, merchant_name, merchant_raw, amount, category_id, scope, payer, status, source, is_demo)
select '2026-09-23','アルビス 小松店','ALBIS KOMATSU',3842,id,'shared','me','confirmed','epos_email',true
from public.categories where name='食費';

insert into public.transactions
(transaction_date, merchant_name, amount, category_id, scope, payer, status, source, is_demo)
select '2026-09-21','北陸電力',8920,id,'shared','me','confirmed','epos_email',true
from public.categories where name='光熱費';

insert into public.transactions
(transaction_date, merchant_name, amount, category_id, scope, payer, status, source, is_demo)
select '2026-09-20','スターバックス',720,id,'mine','me','confirmed','epos_email',true
from public.categories where name='外食';

insert into public.transactions
(transaction_date, merchant_name, merchant_raw, amount, scope, payer, status, source, is_demo)
values
('2026-09-20','AMZN MKTP JP','AMZN MKTP JP',2480,null,'partner','unclassified','epos_email',true),
('2026-09-18','KOMATSU STATION SHOP','KOMATSU STATION SHOP',1260,null,'me','unclassified','epos_email',true);

insert into public.transactions
(transaction_date, merchant_name, amount, category_id, scope, payer, status, source, is_demo)
select '2026-09-17','クスリのアオキ',4680,id,'shared','partner','confirmed','epos_email',true
from public.categories where name='日用品';

insert into public.transactions
(transaction_date, merchant_name, amount, category_id, scope, payer, status, source, is_demo)
select '2026-09-15','大阪屋ショップ',6150,id,'shared','me','confirmed','manual',true
from public.categories where name='食費';

insert into public.loans
(loan_date, description, amount, lender, borrower, status, is_demo) values
('2026-09-18','映画チケット',3800,'me','partner','open',true),
('2026-09-12','タクシー代',1600,'partner','me','open',true),
('2026-09-10','イベントチケット',4300,'me','partner','open',true);

insert into public.repayment_plans
(title, original_amount, remaining_amount, monthly_amount, lender, borrower, is_demo)
values ('同棲初期費用',300000,180000,20000,'me','partner',true);
