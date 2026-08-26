// Канонічний резолвер учасників команди для Netlify-функцій.
//
// Три різні таблиці тримають три шматки правди про людину, і кожен шматок —
// окрема пастка, на якій уже ламався прод:
//
//   tosho.memberships_view      — РОЛІ (access_role, job_role) + workspace_id.
//                                 full_name тут порожній майже у всіх.
//   tosho.team_member_profiles  — employment_status + ІМЕНА (first_name/last_name).
//                                 Колонок access_role/job_role тут НЕМАЄ: спроба
//                                 їх вибрати кладе функцію помилкою 42703.
//   public.team_members         — операційний team_id, яким скоупляться
//                                 бізнес-таблиці. Він НЕ дорівнює workspace_id.
//
// Тому все зводиться тут один раз, а не переписується в кожній функції.

export type TeamMemberRow = {
  userId: string;
  workspaceId: string | null;
  /** Операційний team_id для quotes/orders/leads/finance_expenses. */
  teamId: string | null;
  accessRole: string | null;
  jobRole: string | null;
  employmentStatus: string | null;
  fullName: string | null;
};

export type MembershipSource = {
  user_id?: string | null;
  workspace_id?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};

export type ProfileSource = {
  user_id?: string | null;
  employment_status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type TeamLinkSource = {
  user_id?: string | null;
  team_id?: string | null;
};

function norm(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Зводить три джерела в один список. Основа — членства: без ролі людини немає. */
export function mergeTeamMembers(sources: {
  memberships: MembershipSource[];
  profiles: ProfileSource[];
  teamLinks: TeamLinkSource[];
}): TeamMemberRow[] {
  const profileByUser = new Map<string, ProfileSource>();
  for (const row of sources.profiles) {
    if (row.user_id) profileByUser.set(row.user_id, row);
  }
  const teamByUser = new Map<string, string>();
  for (const row of sources.teamLinks) {
    if (row.user_id && row.team_id) teamByUser.set(row.user_id, row.team_id);
  }

  const members: TeamMemberRow[] = [];
  for (const row of sources.memberships) {
    if (!row.user_id) continue;
    const profile = profileByUser.get(row.user_id);
    const fullName =
      [profile?.first_name, profile?.last_name]
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .join(" ") || null;
    members.push({
      userId: row.user_id,
      workspaceId: row.workspace_id ?? null,
      teamId: teamByUser.get(row.user_id) ?? null,
      accessRole: row.access_role ?? null,
      jobRole: row.job_role ?? null,
      employmentStatus: profile?.employment_status ?? null,
      fullName,
    });
  }
  return members;
}

/**
 * Чи можна слати людині взагалі. Відсутній профіль — не привід виключати:
 * членство є, статусу просто нема, і мовчазно втратити отримувача гірше.
 */
export function isDeliverable(member: TeamMemberRow): boolean {
  const status = norm(member.employmentStatus);
  return status !== "inactive" && status !== "rejected";
}

/** Фін-ролі: власник/адмін + CEO + бухгалтери — той самий набір, що бачить Фінанси. */
export function isFinanceRole(member: TeamMemberRow): boolean {
  const access = norm(member.accessRole);
  const job = norm(member.jobRole);
  return access === "owner" || access === "admin" || ["seo", "accountant", "chief_accountant"].includes(job);
}

/** teamId → набір user_id, які проходять предикат. Ключ — ОПЕРАЦІЙНИЙ team_id. */
export function groupRecipientsByTeam(
  members: TeamMemberRow[],
  predicate: (member: TeamMemberRow) => boolean
): Map<string, Set<string>> {
  const byTeam = new Map<string, Set<string>>();
  for (const member of members) {
    if (!member.teamId) continue;
    if (!isDeliverable(member)) continue;
    if (!predicate(member)) continue;
    const set = byTeam.get(member.teamId) ?? new Set<string>();
    set.add(member.userId);
    byTeam.set(member.teamId, set);
  }
  return byTeam;
}

/** Унікальні операційні team_id — для скоупінгу бізнес-запитів. */
export function resolveTeamIds(members: TeamMemberRow[]): string[] {
  return Array.from(new Set(members.map((m) => m.teamId).filter((v): v is string => Boolean(v))));
}
