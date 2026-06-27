-- Fayna decommission: drop football app + empty legacy CRM-prototype tables from public.
-- KEEP (CRM foundation, untouched): teams, team_members, notifications, push_subscriptions,
--   activity_log, activity_read_state, user_presence, design_task_timer_sessions,
--   design_task_number_counters, + entire tosho schema, + auth.*.
-- Single seam severed first: public.teams.club_id -> public.clubs.
-- Wrap in transaction; toggle ROLLBACK/COMMIT at the end.

BEGIN;

-- 1. Sever the only CRM<->Fayna structural link.
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_club_id_fkey;

-- 2. Drop all Fayna + empty legacy tables. CASCADE handles inter-Fayna FKs.
DROP TABLE IF EXISTS
  public.finance_pool_participants,
  public.finance_pools,
  public.finance_recurring_rules,
  public.finance_transactions,
  public.finance_invoices,
  public.finance_plans,
  public.finance_categories,
  public.match_attendance,
  public.match_events,
  public.matches,
  public.training_attendance,
  public.trainings,
  public.team_tournament_players,
  public.tournament_teams,
  public.team_tournaments,
  public.tournament_standings_rows,
  public.tournament_standings_runs,
  public.tournament_standings_current,
  public.tournaments,
  public.team_invites,
  public.players,
  public.clubs,
  public.quote_attachments,
  public.quote_comments,
  public.quote_status_history,
  public.quote_items,
  public.quote_counters,
  public.quote_number_migration_log,
  public.quotes,
  public.crm_contacts,
  public.customers
CASCADE;

-- 3. Sanity: CRM foundation + tosho data must still be readable inside the same txn.
SELECT 'public.teams' AS obj, count(*) FROM public.teams
UNION ALL SELECT 'public.team_members', count(*) FROM public.team_members
UNION ALL SELECT 'public.notifications', count(*) FROM public.notifications
UNION ALL SELECT 'public.push_subscriptions', count(*) FROM public.push_subscriptions
UNION ALL SELECT 'public.activity_log', count(*) FROM public.activity_log
UNION ALL SELECT 'tosho.quotes', count(*) FROM tosho.quotes
UNION ALL SELECT 'tosho.orders', count(*) FROM tosho.orders
UNION ALL SELECT 'tosho.memberships', count(*) FROM tosho.memberships;

COMMIT;
