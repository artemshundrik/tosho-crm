-- Номер акта й тип позиції замовлення (REQ-322, хвости p1–p3).
--
-- Акт, як і рахунок, нумерує BAS (серія ОУ-…). CRM номер не вигадує: його
-- вносить бухгалтерія після виписки, і лише тоді він друкується в акті.
-- Тип позиції (товар чи послуга) підказує закривальний документ: самі
-- послуги закриває акт, товари — видаткова накладна.

alter table tosho.orders
  add column if not exists act_number text,
  add column if not exists act_date date;

alter table tosho.order_items
  add column if not exists item_kind text not null default 'goods';

alter table tosho.order_items drop constraint if exists order_items_item_kind_check;
alter table tosho.order_items
  add constraint order_items_item_kind_check check (item_kind in ('goods', 'service'));

-- Номер і дату акта міняє лише той, хто виписує рахунки (бухгалтерія, СЕО, owner).
create or replace function tosho.enforce_order_act_number()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if new.act_number is distinct from old.act_number or new.act_date is distinct from old.act_date then
    if auth.uid() is not null and not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Номер акта вносить бухгалтерія' using errcode = '42501';
    end if;
    new.act_number := nullif(btrim(coalesce(new.act_number, '')), '');
    if new.act_number is null then
      new.act_date := null;
    elsif new.act_date is null then
      new.act_date := current_date;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function tosho.enforce_order_act_number() from public;

drop trigger if exists orders_act_number on tosho.orders;
create trigger orders_act_number
before update of act_number, act_date on tosho.orders
for each row execute function tosho.enforce_order_act_number();
