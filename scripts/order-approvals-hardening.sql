-- ---------------------------------------------------------------------------
-- Догоняння після рецензії рахунку й погоджень (REQ-322, пункти p6–p10).
--
-- 1. Тригери на tosho.orders стояли лише на UPDATE. Через INSERT менеджер міг
--    одразу завести замовлення з номером рахунку з BAS (і зайняти цей номер у
--    серії) або з «підписом», поставленим нібито бухгалтером. Тепер на вставці
--    службові поля рахунку обнуляються для всіх, крім тих, хто його виписує, а
--    «хто попросив / хто підписав» ставить база.
-- 2. «Повернути» запит рахунку можна лише тоді, коли його справді просили.
-- 3. З order_approvals явно знято DELETE і TRUNCATE: історія рішень не
--    стирається, і це має бути видно в SQL, а не лише з відсутності політики.
--
-- Застосування: npm run db:apply scripts/order-approvals-hardening.sql
-- ---------------------------------------------------------------------------

create or replace function tosho.enforce_order_invoice_flow()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  _issuing boolean := new.invoice_number is distinct from old.invoice_number
    or new.invoice_date is distinct from old.invoice_date;
  _returning boolean := new.invoice_returned_at is distinct from old.invoice_returned_at
    or new.invoice_return_note is distinct from old.invoice_return_note;
  _requesting boolean := new.invoice_requested_at is distinct from old.invoice_requested_at;
begin
  -- Сервісні записи (psql, функції без сесії) не перевіряємо: так само, як у
  -- погодженні накрутки. Застосунок завжди ходить із сесією.
  if auth.uid() is null then
    return new;
  end if;

  if not (_issuing or _returning or _requesting
          or new.invoice_requested_by is distinct from old.invoice_requested_by
          or new.invoice_issued_by is distinct from old.invoice_issued_by
          or new.invoice_created_at is distinct from old.invoice_created_at) then
    return new;
  end if;

  if _issuing then
    if not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Номер і дату рахунку вносить бухгалтер з BAS'
        using errcode = '42501';
    end if;
    new.invoice_number := nullif(btrim(coalesce(new.invoice_number, '')), '');
    if new.invoice_number is not null and new.invoice_date is null then
      raise exception 'Вкажіть дату рахунку з BAS' using errcode = '23514';
    end if;
    if new.invoice_number is null then
      new.invoice_date := null;
      new.invoice_issued_by := null;
      new.invoice_created_at := null;
    else
      new.invoice_issued_by := auth.uid();
      new.invoice_created_at := coalesce(
        case when old.invoice_number is null then null else old.invoice_created_at end,
        timezone('utc', now())
      );
      new.invoice_return_note := null;
      new.invoice_returned_at := null;
    end if;
    return new;
  end if;

  if _returning then
    if not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Повернути запит рахунку може бухгалтер'
        using errcode = '42501';
    end if;
    if old.invoice_number is not null then
      raise exception 'Рахунок уже виписано — повертати нема що' using errcode = '23514';
    end if;
    if old.invoice_requested_at is null then
      raise exception 'Рахунок ніхто не просив — повертати нема що' using errcode = '23514';
    end if;
    new.invoice_return_note := nullif(btrim(coalesce(new.invoice_return_note, '')), '');
    if new.invoice_return_note is null then
      raise exception 'Напишіть менеджеру, що виправити' using errcode = '23514';
    end if;
    new.invoice_returned_at := timezone('utc', now());
    new.invoice_requested_at := null;
    new.invoice_requested_by := old.invoice_requested_by;
    new.invoice_issued_by := old.invoice_issued_by;
    new.invoice_created_at := old.invoice_created_at;
    return new;
  end if;

  if _requesting then
    if old.invoice_number is not null then
      raise exception 'Рахунок уже виписано' using errcode = '23514';
    end if;
    if new.invoice_requested_at is null then
      -- Зняти запит без повернення може лише бухгалтерія (через «Повернути»).
      raise exception 'Запит рахунку знімає бухгалтер кнопкою «Повернути менеджеру»'
        using errcode = '42501';
    end if;
    new.invoice_requested_at := timezone('utc', now());
    new.invoice_requested_by := auth.uid();
    new.invoice_return_note := null;
    new.invoice_returned_at := null;
    new.invoice_issued_by := old.invoice_issued_by;
    new.invoice_created_at := old.invoice_created_at;
    return new;
  end if;

  -- Решта службових колонок напряму не пишеться.
  raise exception 'Ці поля рахунку ставить CRM сама' using errcode = '42501';
end;
$$;

create or replace function tosho.guard_order_insert_marks()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not tosho.is_order_invoice_issuer(auth.uid()) then
    new.invoice_number := null;
    new.invoice_date := null;
    new.invoice_issued_by := null;
    new.invoice_created_at := null;
  end if;
  new.invoice_returned_at := null;
  new.invoice_return_note := null;
  new.invoice_requested_by := case when new.invoice_requested_at is null then null else auth.uid() end;
  new.contract_signed_by := case when new.contract_signed_at is null then null else auth.uid() end;
  new.specification_signed_by := case when new.specification_signed_at is null then null else auth.uid() end;
  return new;
end;
$$;

revoke all on function tosho.guard_order_insert_marks() from public;

drop trigger if exists orders_insert_marks on tosho.orders;
create trigger orders_insert_marks
before insert on tosho.orders
for each row execute function tosho.guard_order_insert_marks();

revoke delete, truncate on tosho.order_approvals from authenticated;
