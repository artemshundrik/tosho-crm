begin;

alter table public.user_presence
  set (
    fillfactor = 70,
    autovacuum_vacuum_scale_factor = 0.0,
    autovacuum_vacuum_threshold = 25,
    autovacuum_analyze_scale_factor = 0.0,
    autovacuum_analyze_threshold = 25
  );

vacuum (analyze) public.user_presence;

commit;
