alter table if exists tosho.quotes
  add column if not exists customer_deadline_at timestamptz,
  add column if not exists design_deadline_at timestamptz;

comment on column tosho.quotes.customer_deadline_at is
  'Дедлайн замовника: готовність до відвантаження.';

comment on column tosho.quotes.design_deadline_at is
  'Внутрішній дедлайн дизайну: погодити макет / візуал.';
