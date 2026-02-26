-- Hotfix: quote lock trigger must support tables without team_id column
-- (for example: tosho.quote_item_runs).

create or replace function public.assert_quote_lock_from_quote_id()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_quote_id text;
  v_user_id uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_team_id := nullif(to_jsonb(old)->>'team_id', '')::uuid;
    v_quote_id := nullif(to_jsonb(old)->>'quote_id', '');
  else
    v_team_id := nullif(to_jsonb(new)->>'team_id', '')::uuid;
    v_quote_id := nullif(to_jsonb(new)->>'quote_id', '');
  end if;

  if v_quote_id is null then
    return coalesce(new, old);
  end if;

  if v_team_id is null then
    select q.team_id into v_team_id
    from tosho.quotes q
    where q.id::text = v_quote_id
    limit 1;
  end if;

  if not public.is_entity_lock_allowed(v_team_id, 'quote', v_quote_id, v_user_id) then
    raise exception 'Quote is locked by another user'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

notify pgrst, 'reload schema';
