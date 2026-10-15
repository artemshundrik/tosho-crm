-- Номер і дата видаткової накладної з BAS (REQ-322#p5).
--
-- ВН друкує BAS, не CRM. Але відтермінування рахується «N робочих або
-- календарних днів від дати ВН», тож CRM треба знати цю дату: бухгалтерія
-- вносить номер і дату після виписки, як номер акта. Від дати закривального
-- документа (ВН або акта) CRM рахує, до якого дня чекати доплату.

alter table tosho.orders
  add column if not exists waybill_number text,
  add column if not exists waybill_date date;

-- Номер і дату ВН чи акта міняє лише той, хто виписує рахунки (бухгалтерія,
-- СЕО, owner). Одна функція на обидва документи замість окремої для акта.
create or replace function tosho.enforce_order_closing_document_number()
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
  if new.waybill_number is distinct from old.waybill_number or new.waybill_date is distinct from old.waybill_date then
    if auth.uid() is not null and not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Номер накладної вносить бухгалтерія' using errcode = '42501';
    end if;
    new.waybill_number := nullif(btrim(coalesce(new.waybill_number, '')), '');
    if new.waybill_number is null then
      new.waybill_date := null;
    elsif new.waybill_date is null then
      new.waybill_date := current_date;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function tosho.enforce_order_closing_document_number() from public;

drop trigger if exists orders_act_number on tosho.orders;
drop trigger if exists orders_closing_document_number on tosho.orders;
create trigger orders_closing_document_number
before update of act_number, act_date, waybill_number, waybill_date on tosho.orders
for each row execute function tosho.enforce_order_closing_document_number();

drop function if exists tosho.enforce_order_act_number();
