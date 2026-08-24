/**
 * Базовий рівень перевірок безпеки БД — те, що вже так на проді (REQ-104).
 *
 * ЦЕ НЕ СПИСОК СХВАЛЕНОГО. Це знімок боргу на день заведення перевірки. Він
 * існує рівно для того, щоб `check-db-guards.mjs` міг падати на НОВОМУ, а не
 * тонути в старому — той самий ратчет, що й у check-file-growth.mjs.
 *
 * ПРАВИЛО. Рядок звідси прибирають, коли борг ПОГАСИЛИ (наприклад, увімкнули
 * security_invoker на в'юсі). Додають — лише свідомо, з поясненням у коміті,
 * чому інакше не можна. Мовчки дописати сюди новий об'єкт = обійти перевірку.
 */

/**
 * Гранти anon на таблиці та в'юхи.
 *
 * ЧОМУ ЦЕ НЕ ПАНІКА САМЕ ПО СОБІ. Дев'ять таблиць у public — типова роздача
 * Supabase для схеми API, а 51 об'єкт у tosho має лише SELECT. Поки на таблиці
 * ввімкнена RLS (а вона ввімкнена на ВСІХ — перевірка 1 це стереже), анонім
 * отримує нуль рядків: право на таблицю без політики нічого не відкриває.
 *
 * НЕБЕЗПЕЧНЕ ПОЄДНАННЯ — грант anon НА В'ЮХУ без security_invoker: в'юха
 * виконується правами власника й проходить повз RLS. Саме так у липні 2026
 * стався витік P0. Тому цей список має значення в парі з перевіркою 3.
 */
export const ANON_GRANTS = new Set([
  // Типова роздача Supabase для схеми API.
  "public.activity_log",
  "public.activity_read_state",
  "public.design_task_timer_sessions",
  "public.notifications",
  "public.push_subscriptions",
  "public.team_members",
  "public.team_members_view",
  "public.teams",
  "public.user_presence",
  // Наші таблиці: лише SELECT, доступ реально вирішує RLS.
  "tosho.activity_log_archive",
  "tosho.admin_observability_snapshots",
  "tosho.ai_usage",
  "tosho.audit_log",
  "tosho.backup_runs",
  "tosho.contract_revisions",
  "tosho.contractors",
  "tosho.crm_contacts",
  "tosho.customers",
  "tosho.entity_locks",
  "tosho.finance_accounts",
  "tosho.finance_expense_allocations",
  "tosho.finance_expense_categories",
  "tosho.finance_expense_monthly_amounts",
  "tosho.finance_expenses",
  "tosho.finance_invoices",
  "tosho.finance_legal_entities",
  "tosho.finance_order_meta",
  "tosho.finance_payments",
  "tosho.finance_payout_meta",
  "tosho.finance_taxes",
  "tosho.leads",
  "tosho.memberships",
  "tosho.nova_poshta_settings",
  "tosho.payroll_entries",
  "tosho.quote_attachments",
  "tosho.quote_comments",
  "tosho.quote_item_runs",
  "tosho.quote_items",
  "tosho.quote_set_items",
  "tosho.quote_sets",
  "tosho.quote_status_history",
  "tosho.quotes",
  "tosho.runtime_errors",
  "tosho.sample_stock_items",
  "tosho.sample_stock_movements",
  "tosho.support_feedback",
  "tosho.support_knowledge_items",
  "tosho.support_messages",
  "tosho.support_requests",
  "tosho.team_absences",
  "tosho.team_member_manager_rates",
  "tosho.team_member_profiles",
  "tosho.telegram_link_tokens",
  "tosho.thread_reactions",
  "tosho.thread_reads",
  "tosho.user_activity_daily",
  "tosho.user_notification_settings",
  "tosho.vchasno_documents",
  "tosho.workspace_invites",
  "tosho.workspaces",
]);

/**
 * В'юхи без security_invoker = true.
 *
 * ЩО ЦЕ ОЗНАЧАЄ. Така в'юха читає дані ПРАВАМИ ВЛАСНИКА, а не того, хто питає,
 * тобто RLS таблиць під нею не діє. Якщо на таку в'юху ще й є грант anon —
 * це відкриті дані.
 *
 * ЦЕ СПРАВЖНІЙ БОРГ, а не особливість: чотири в'юхи нижче варто перевести на
 * security_invoker = true і звірити, що застосунок не втратив рядків.
 */
export const VIEWS_WITHOUT_INVOKER = new Set([
  "public.team_members_view",
  "tosho.memberships_view",
  "tosho.v_quotes_list",
  "tosho.workspace_member_directory",
]);

/**
 * SECURITY DEFINER-функції без закріпленого search_path.
 *
 * ЩО ЦЕ ОЗНАЧАЄ. Функція виконується правами власника, а які саме таблиці вона
 * при цьому бачить, вирішує search_path ТОГО, ХТО ВИКЛИКАЄ. Підсунувши свою
 * схему попереду, викликач може підмінити таблицю під функцією з правами
 * власника. Лікується одним рядком: alter function ... set search_path = ...
 *
 * ЦЕ ТЕЖ БОРГ. П'ять функцій нижче чекають на закріплення окремою правкою:
 * міняти прод-схему заразом із заведенням перевірки не варто.
 */
export const DEFINER_WITHOUT_SEARCH_PATH = new Set([
  "public.accept_team_invite",
  "public.create_team_invite",
  "public.current_team_id",
  "public.next_quote_number",
  "tosho.next_quote_number",
]);

/**
 * Таблиці без RLS. Порожньо — і має лишатись порожнім: у серпні 2026 сюди
 * потрапляли user_profiles і team_member_*_events, і це був відкритий доступ
 * до кадрових даних. Будь-який новий рядок тут = дірка, а не борг.
 */
export const TABLES_WITHOUT_RLS = new Set([]);
