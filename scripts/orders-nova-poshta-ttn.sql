-- Nova Poshta ТТН на замовленні (Phase 2). Ідемпотентно (patern contract_number).
-- № накладної, її Ref (для скасування), вартість і орієнтовна дата доставки.

alter table if exists tosho.orders
  add column if not exists np_ttn_number text,
  add column if not exists np_ttn_ref text,
  add column if not exists np_ttn_cost numeric,
  add column if not exists np_ttn_estimated_delivery text,
  add column if not exists np_ttn_created_at timestamptz;

notify pgrst, 'reload schema';
