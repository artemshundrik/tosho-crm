-- Перейменування замовника чи ліда доїжджає до прорахунків (REQ-193).
--
-- ЩО БУЛО НЕ ТАК. `tosho.quotes.customer_name` — це ТЕКСТ, заморожений у момент
-- створення прорахунку. Для ліда він ще й єдиний зв'язок: поля `lead_id` у
-- прорахунках немає, є лише `customer_id` для замовників. Артем перейменував
-- ліда «masseeds» → «MAS Seeds» 27.08.2026 — і на канбані Прорахунків, на дошці
-- Дизайну та в дизайн-задачі під правильним логотипом лишився старий підпис.
-- Логотип правильний, бо його шукають зіставленням назв (lib/partyNameMatch);
-- підпис — ні, бо його просто читають із прорахунку.
--
-- ЧОМУ ТРИГЕР, А НЕ ПРАВКА В ФОРМІ. Полагодити показ на трьох екранах означало б
-- полагодити ті три, які згадав розробник: те саме поле читають ще звіти,
-- документи, AI-помічник і пошук. Джерело одне — рядок у базі, і синхронізувати
-- його треба там, де він змінюється, а не в кожного читача. Це рівно той урок,
-- який за добу коштував трьох заходів (REQ-190 і сусідні).
--
-- ЗВУЖЕНО НАВМИСНО. Для лідів беремо ТОЧНУ стару назву й лише прорахунки без
-- `customer_id`: нечітке зіставлення тут коштувало б чужих карток (у
-- partyNameMatch описано, як «masseeds» колись відкрив ліда «EDS»).
-- Safe to run multiple times.

begin;

create or replace function tosho.sync_quote_customer_name()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  if tg_table_name = 'leads' then
    -- Лід тримається в прорахунку самим текстом: шукаємо за старою назвою.
    if new.company_name is distinct from old.company_name
       and coalesce(old.company_name, '') <> '' then
      update tosho.quotes q
      set customer_name = new.company_name
      where q.team_id = new.team_id
        and q.customer_id is null
        and q.customer_name = old.company_name;
    end if;
  else
    -- Замовник має справжній зв'язок — оновлюємо за id, без вгадування.
    if new.name is distinct from old.name then
      update tosho.quotes q
      set customer_name = new.name
      where q.customer_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

comment on function tosho.sync_quote_customer_name() is
  'Тримає quotes.customer_name у згоді з назвою ліда/замовника: підпис на всіх дошках і в документах читається саме звідти (REQ-193).';

drop trigger if exists leads_sync_quote_customer_name on tosho.leads;
create trigger leads_sync_quote_customer_name
  after update of company_name on tosho.leads
  for each row execute function tosho.sync_quote_customer_name();

drop trigger if exists customers_sync_quote_customer_name on tosho.customers;
create trigger customers_sync_quote_customer_name
  after update of name on tosho.customers
  for each row execute function tosho.sync_quote_customer_name();

-- Разовий бекфіл того, що вже розійшлось: два прорахунки masseeds → MAS Seeds.
-- Сміттєві ліди з назвами «.» і «..» свідомо не чіпаємо — там нема що лагодити.
update tosho.quotes q
set customer_name = l.company_name
from tosho.leads l
where q.customer_id is null
  and q.team_id = l.team_id
  and length(regexp_replace(l.company_name, '[^[:alnum:]]', '', 'g')) > 1
  and lower(regexp_replace(q.customer_name, '[^[:alnum:]]', '', 'g'))
      = lower(regexp_replace(l.company_name, '[^[:alnum:]]', '', 'g'))
  and q.customer_name is distinct from l.company_name;

commit;
