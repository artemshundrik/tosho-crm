-- Sample stock inventory for CRM warehouse samples.
-- Safe to run multiple times.

create table if not exists tosho.sample_stock_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  visual_ref text,
  sku text,
  category text,
  color text,
  specifications text,
  quantity_on_hand integer not null default 0,
  reserved_quantity integer not null default 0,
  unit_price numeric(12, 2) not null default 0,
  currency text not null default 'UAH',
  location text,
  comments text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sample_stock_items_quantity_on_hand_check check (quantity_on_hand >= 0),
  constraint sample_stock_items_reserved_quantity_check check (reserved_quantity >= 0),
  constraint sample_stock_items_unit_price_check check (unit_price >= 0),
  constraint sample_stock_items_currency_check check (currency in ('UAH', 'USD', 'EUR'))
);

alter table if exists tosho.sample_stock_items
  add column if not exists visual_ref text,
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists color text,
  add column if not exists specifications text,
  add column if not exists quantity_on_hand integer not null default 0,
  add column if not exists reserved_quantity integer not null default 0,
  add column if not exists unit_price numeric(12, 2) not null default 0,
  add column if not exists currency text not null default 'UAH',
  add column if not exists location text,
  add column if not exists comments text,
  add column if not exists is_archived boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists tosho.sample_stock_movements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  item_id uuid not null references tosho.sample_stock_items(id) on delete cascade,
  movement_type text not null,
  quantity integer not null,
  previous_quantity_on_hand integer not null,
  next_quantity_on_hand integer not null,
  previous_reserved_quantity integer not null,
  next_reserved_quantity integer not null,
  comment text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sample_stock_movements_type_check check (
    movement_type in ('incoming', 'outgoing', 'reserve', 'release', 'adjustment')
  ),
  constraint sample_stock_movements_quantity_check check (quantity > 0)
);

alter table if exists tosho.sample_stock_movements
  add column if not exists comment text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create index if not exists sample_stock_items_team_name_idx
  on tosho.sample_stock_items (team_id, name);

create index if not exists sample_stock_items_team_sku_idx
  on tosho.sample_stock_items (team_id, sku);

create index if not exists sample_stock_items_team_category_idx
  on tosho.sample_stock_items (team_id, category);

create unique index if not exists sample_stock_items_team_identity_idx
  on tosho.sample_stock_items (
    team_id,
    lower(name),
    coalesce(sku, ''),
    coalesce(color, '')
  );

create index if not exists sample_stock_movements_team_item_created_idx
  on tosho.sample_stock_movements (team_id, item_id, created_at desc);

create or replace function tosho.touch_sample_stock_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sample_stock_items_touch_updated_at on tosho.sample_stock_items;
create trigger sample_stock_items_touch_updated_at
before update on tosho.sample_stock_items
for each row execute function tosho.touch_sample_stock_items_updated_at();

create or replace function tosho.adjust_sample_stock_item(
  p_item_id uuid,
  p_team_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_comment text default null
)
returns tosho.sample_stock_items
language plpgsql
security invoker
set search_path = tosho, public
as $$
declare
  target_item tosho.sample_stock_items;
  previous_quantity integer;
  previous_reserved integer;
  next_quantity integer;
  next_reserved integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_movement_type not in ('incoming', 'outgoing', 'reserve', 'release', 'adjustment') then
    raise exception 'Unsupported sample stock movement type: %', p_movement_type;
  end if;

  select *
  into target_item
  from tosho.sample_stock_items
  where id = p_item_id
    and team_id = p_team_id
  for update;

  if target_item.id is null then
    raise exception 'Sample stock item not found';
  end if;

  previous_quantity := target_item.quantity_on_hand;
  previous_reserved := target_item.reserved_quantity;
  next_quantity := target_item.quantity_on_hand;
  next_reserved := target_item.reserved_quantity;

  if p_movement_type = 'incoming' then
    next_quantity := target_item.quantity_on_hand + p_quantity;
  elsif p_movement_type = 'outgoing' then
    if p_quantity > target_item.quantity_on_hand - target_item.reserved_quantity then
      raise exception 'Cannot write off more than available sample quantity';
    end if;
    next_quantity := target_item.quantity_on_hand - p_quantity;
  elsif p_movement_type = 'reserve' then
    if p_quantity > target_item.quantity_on_hand - target_item.reserved_quantity then
      raise exception 'Cannot reserve more than available sample quantity';
    end if;
    next_reserved := target_item.reserved_quantity + p_quantity;
  elsif p_movement_type = 'release' then
    if p_quantity > target_item.reserved_quantity then
      raise exception 'Cannot release more than reserved sample quantity';
    end if;
    next_reserved := target_item.reserved_quantity - p_quantity;
  elsif p_movement_type = 'adjustment' then
    next_quantity := p_quantity;
    if next_reserved > next_quantity then
      next_reserved := next_quantity;
    end if;
  end if;

  update tosho.sample_stock_items
  set quantity_on_hand = next_quantity,
      reserved_quantity = next_reserved
  where id = p_item_id
    and team_id = p_team_id
  returning * into target_item;

  insert into tosho.sample_stock_movements (
    team_id,
    item_id,
    movement_type,
    quantity,
    previous_quantity_on_hand,
    next_quantity_on_hand,
    previous_reserved_quantity,
    next_reserved_quantity,
    comment,
    created_by
  )
  values (
    p_team_id,
    p_item_id,
    p_movement_type,
    p_quantity,
    previous_quantity,
    next_quantity,
    previous_reserved,
    next_reserved,
    nullif(trim(coalesce(p_comment, '')), ''),
    auth.uid()
  );

  return target_item;
end;
$$;

grant execute on function tosho.adjust_sample_stock_item(uuid, uuid, text, integer, text) to authenticated;

alter table tosho.sample_stock_items enable row level security;
alter table tosho.sample_stock_movements enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_items' and policyname = 'sample_stock_items_select'
  ) then
    if has_member_fn then
      create policy sample_stock_items_select on tosho.sample_stock_items
      for select using (public.is_team_member(team_id));
    else
      create policy sample_stock_items_select on tosho.sample_stock_items
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_items' and policyname = 'sample_stock_items_insert'
  ) then
    if has_member_fn then
      create policy sample_stock_items_insert on tosho.sample_stock_items
      for insert with check (public.is_team_member(team_id));
    else
      create policy sample_stock_items_insert on tosho.sample_stock_items
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_items' and policyname = 'sample_stock_items_update'
  ) then
    if has_member_fn then
      create policy sample_stock_items_update on tosho.sample_stock_items
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy sample_stock_items_update on tosho.sample_stock_items
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_items' and policyname = 'sample_stock_items_delete'
  ) then
    if has_member_fn then
      create policy sample_stock_items_delete on tosho.sample_stock_items
      for delete using (public.is_team_member(team_id));
    else
      create policy sample_stock_items_delete on tosho.sample_stock_items
      for delete using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_movements' and policyname = 'sample_stock_movements_select'
  ) then
    if has_member_fn then
      create policy sample_stock_movements_select on tosho.sample_stock_movements
      for select using (public.is_team_member(team_id));
    else
      create policy sample_stock_movements_select on tosho.sample_stock_movements
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'sample_stock_movements' and policyname = 'sample_stock_movements_insert'
  ) then
    if has_member_fn then
      create policy sample_stock_movements_insert on tosho.sample_stock_movements
      for insert with check (public.is_team_member(team_id));
    else
      create policy sample_stock_movements_insert on tosho.sample_stock_movements
      for insert with check (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
