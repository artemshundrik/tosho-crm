-- Finance module — «Обʼєкт» на витраті для групування за адресою/офісом.
-- Оренда + комуналка + інтернет одного офісу групуються в списку «Інші регулярні
-- платежі» за спільним значенням object_group (вільний текст, напр. «Богданівська 7»).
-- Safe to run multiple times.

begin;

alter table tosho.finance_expenses add column if not exists object_group text;

comment on column tosho.finance_expenses.object_group is
  'Обʼєкт/адреса (напр. «Богданівська 7») — для візуального групування оренди+комуналки+інтернету одного офісу. Вільний текст.';

notify pgrst, 'reload schema';

commit;
