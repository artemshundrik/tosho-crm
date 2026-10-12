-- Finance module — поправка суми сталої витрати на конкретний місяць.
-- Оренду офісу ($1 000) власниця щомісяця перераховує у гривні за своїм курсом
-- (міжбанк/обмінник), а CRM рахує за НБУ — і кожен місяць розходиться на кілька
-- тисяч. Курс у неї щомісяця інший, тож одне число на витрату не годиться:
-- потрібна фактична сума в гривнях з рахунку саме за цей місяць.
--
-- Мапа «YYYY-MM» → сума в гривнях. Місяця немає в мапі — рахуємо як раніше
-- (сума × курс НБУ). Пишеться окремим update лише цього поля, тож збереження
-- вікна витрати поправки не зачіпає.
-- Safe to run multiple times. Транзакцію дає npm run db:apply.

set local lock_timeout = '5s';

alter table tosho.finance_expenses
  add column if not exists month_uah_overrides jsonb not null default '{}'::jsonb;

alter table tosho.finance_expenses
  drop constraint if exists finance_expenses_month_uah_overrides_object;
alter table tosho.finance_expenses
  add constraint finance_expenses_month_uah_overrides_object
  check (jsonb_typeof(month_uah_overrides) = 'object');

comment on column tosho.finance_expenses.month_uah_overrides is
  'Фактична сума в гривнях за конкретні місяці: {"2026-10": 41500}. Перекриває суму × курс НБУ лише для цих місяців; решта рахується як завжди.';
