alter table tosho.quote_item_runs
  add column if not exists desired_manager_income numeric default 0,
  add column if not exists manager_rate numeric default 10,
  add column if not exists fixed_cost_rate numeric default 30,
  add column if not exists vat_rate numeric default 20;
