-- Finance module — нагадування про майбутній платіж.
-- На регулярному платежі з датою «next_charge_date» можна ввімкнути нагадування
-- за N днів до списання (напр. велика річна підписка — щоб були кошти на картці).
-- null = вимкнено; N = за скільки днів попередити. Дата вже є в next_charge_date,
-- тому окремий «reminder_at» НЕ додаємо (фінанси — дата, floating wall-clock;
-- тригер рахує cron датовою арифметикою в Europe/Kiev). Safe to run multiple times.

begin;

alter table tosho.finance_expenses
  add column if not exists reminder_lead_days integer;

comment on column tosho.finance_expenses.reminder_lead_days is
  'Нагадати про платіж за N днів до next_charge_date (null = вимкнено). Нотифікацію шле cron finance-payment-reminders у дзвіночок + Telegram.';

-- Легка перевірка діапазону (0–90 днів) — щоб не зберегти безглузде значення.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tosho.finance_expenses'::regclass
      and conname = 'finance_expenses_reminder_lead_days_range'
  ) then
    alter table tosho.finance_expenses
      add constraint finance_expenses_reminder_lead_days_range
      check (reminder_lead_days is null or (reminder_lead_days between 0 and 90));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
