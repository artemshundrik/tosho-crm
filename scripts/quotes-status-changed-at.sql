-- Коли прорахунок потрапив у свій поточний статус (REQ-178#p49).
--
-- НАВІЩО. Колонки канбану сортувались за created_at, тож щойно затверджений
-- старий прорахунок провалювався під новіші: менеджерка затвердила щоденник
-- від 22.09 і мусила його шукати. На дошці важливо, що рухали останнім.
-- updated_at не годиться — його міняє будь-яке автозбереження тиражу.
-- decided_at теж: ставиться лише раз і лише для фінальних статусів.
--
-- Мітку ставить уже наявний тригер quotes_status_stamp (ловить зміну статусу
-- будь-яким шляхом). Safe to run multiple times.

alter table tosho.quotes add column if not exists status_changed_at timestamptz;

create or replace function tosho.quotes_status_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'sent' and new.sent_at is null then
      new.sent_at := now();
    end if;
    -- В енумі співіснують 'canceled' і 'cancelled'; наявна RPC знала лише
    -- перший варіант, а застосунок пише другий. Приймаємо обидва.
    if new.status in ('approved', 'rejected', 'canceled', 'cancelled') and new.decided_at is null then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Бекфіл: останній перехід у поточний статус з історії; до липня 2026 історія
-- майже не писалась — тоді decided_at (лише фінальні статуси), далі created_at.
update tosho.quotes q
set status_changed_at = coalesce(
  (
    select max(h.created_at)
    from tosho.quote_status_history h
    where h.quote_id = q.id
      and h.to_status::text = q.status::text
  ),
  case when q.status::text in ('approved', 'rejected', 'canceled', 'cancelled') then q.decided_at end,
  q.created_at
)
where q.status_changed_at is null;
