-- Safe patch: add customer_logo_url without dropping existing view columns.
do $$
declare
  v_sql text;
  v_sql_next text;
begin
  select pg_get_viewdef('tosho.v_quotes_list'::regclass, true) into v_sql;

  if v_sql ilike '%customer_logo_url%' then
    raise notice 'v_quotes_list already contains customer_logo_url';
    return;
  end if;

  v_sql_next := replace(
    v_sql,
    'c.name as customer_name',
    'c.name as customer_name, c.logo_url as customer_logo_url'
  );

  if v_sql_next = v_sql then
    raise exception 'customer_name not found in v_quotes_list definition. Edit view manually.';
  end if;

  execute 'create or replace view tosho.v_quotes_list as ' || v_sql_next;
end $$;
