/**
 * Збереження ролей людини — рівень доступу (`access_role`) і посада (`job_role`).
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ. Ця логіка жила всередині TeamMembersPage, зшита з її
 * станом (`setMembers`, `setEditBusy`, тости). Поки редактор доступів був один,
 * це нікому не заважало. Але профіль людини стає СПІЛЬНОЮ поверхнею для двох
 * входів — «Команди» і адмін-центру, — і другий виклик означав би другу копію
 * цього каскаду. Копія розійшлася б із першою рівно так, як свого часу
 * розійшлися шість списків модулів (див. `src/lib/moduleAccess.ts`).
 *
 * Модуль нічого не знає про React: він пише й повертає збережене. Тости,
 * стан кнопки й оновлення списку лишаються за тим, хто кличе, — саме тому
 * перевірки прав актора («Admin не може призначати Super Admin») теж не тут:
 * вони показують повідомлення й належать сторінці.
 */

import { supabase } from "@/lib/supabaseClient";

/** «Без ролі» в селекті означає порожню посаду в базі, а не рядок "none". */
export function normalizeJobRoleInput(role: string | null) {
  return !role || role === "none" ? null : role;
}

/**
 * `member` і NULL — це той самий «звичайний учасник»: у базі рівень за
 * замовчуванням не записаний. Порівнювати їх напряму означало б бачити зміну
 * там, де її немає.
 */
export function normalizeRoleForCompare(value: string | null | undefined) {
  if (!value || value === "member") return null;
  return value;
}

/**
 * Помилка, після якої є сенс спробувати інший шлях запису.
 *
 * Схема ролей історично розповзлась по кількох таблицях і схемах, і на різних
 * оточеннях живі різні. «Немає такої таблиці/колонки» — це не поломка, а
 * «спробуй наступний варіант»; усе інше падає одразу.
 */
export function isRecoverableRoleUpdateError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("cannot update view") ||
    normalized.includes("could not find the table")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export type SavePersonRolesInput = {
  workspaceId: string;
  /**
   * `public.team_members` живе на team_id, а не на workspace_id — оновлення по
   * workspace_id там мовчки не чіпало жодного рядка. Див. [[project_workspace_vs_team_id]].
   */
  teamId: string | null;
  userId: string;
  currentAccessRole: string | null;
  currentJobRole: string | null;
  nextAccessRole: string;
  nextJobRole: string;
};

export type SavePersonRolesResult = {
  /** false — нове значення дорівнює старому, у базу нічого не пішло. */
  changed: boolean;
  accessRole: string | null;
  jobRole: string | null;
  /** Серверна функція недоступна (404) — записали напряму в таблиці. */
  viaFallback: boolean;
};

/**
 * Пише ролі й повертає те, що реально збереглося.
 *
 * Кидає помилку, якщо жоден шлях не спрацював. Мовчазний успіх неможливий:
 * після запису результат перечитується з `memberships_view`, бо саме за нею
 * ходить решта застосунку.
 */
export async function savePersonRoles(input: SavePersonRolesInput): Promise<SavePersonRolesResult> {
  const { workspaceId, teamId, userId, nextAccessRole, nextJobRole } = input;

  const normalizedAccessRole = nextAccessRole === "member" ? null : nextAccessRole;
  const normalizedJobRole = normalizeJobRoleInput(nextJobRole);
  const accessRoleChanged = (input.currentAccessRole ?? "member") !== nextAccessRole;
  const jobRoleChanged = (input.currentJobRole ?? "none") !== nextJobRole;

  if (!accessRoleChanged && !jobRoleChanged) {
    return {
      changed: false,
      accessRole: normalizedAccessRole,
      jobRole: normalizedJobRole,
      viaFallback: false,
    };
  }

  const verifyRoles = async () => {
    const { data, error } = await supabase
      .schema("tosho")
      .from("memberships_view")
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (error) throw new Error(error.message);
    if (!data) return false;

    return (
      normalizeRoleForCompare(data.access_role ?? null) === normalizeRoleForCompare(normalizedAccessRole) &&
      normalizeRoleForCompare(data.job_role ?? null) === normalizeRoleForCompare(normalizedJobRole)
    );
  };

  /**
   * В'юха оновлюється не миттєво, тож «ще не видно» ≠ «не записалось».
   * Кілька спроб дешевші за фальшиву помилку в обличчя людині.
   */
  const verifyRolesEventually = async (attempts = 5, delayMs = 120) => {
    for (let i = 0; i < attempts; i += 1) {
      if (await verifyRoles()) return true;
      if (i < attempts - 1) await sleep(delayMs);
    }
    return false;
  };

  const fallbackUpdateRolesDirectly = async () => {
    const membershipUpdateSchemas = ["tosho", "public"] as const;
    const { data: membershipTarget, error: membershipTargetError } = await supabase
      .schema("tosho")
      .from("memberships_view")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ id?: string | null }>();

    if (membershipTargetError) throw new Error(membershipTargetError.message);
    const membershipId = membershipTarget?.id ?? null;

    type Scope = "workspace_user" | "membership_id" | "team_user";
    const accessPayload = (column: "access_role" | "role"): Record<string, string | null> =>
      accessRoleChanged
        ? { [column]: column === "role" ? (normalizedAccessRole ?? "member") : normalizedAccessRole }
        : {};
    const jobPayload: Record<string, string | null> = jobRoleChanged ? { job_role: normalizedJobRole } : {};

    const allAttempts: Array<{ tableName: string; payload: Record<string, string | null>; scopes: Scope[] }> = [
      { tableName: "memberships", payload: { ...accessPayload("access_role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "memberships", payload: { ...accessPayload("role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "workspace_members", payload: { ...accessPayload("access_role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "workspace_members", payload: { ...accessPayload("role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "workspace_memberships", payload: { ...accessPayload("access_role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "workspace_memberships", payload: { ...accessPayload("role"), ...jobPayload }, scopes: ["workspace_user", "membership_id"] },
      { tableName: "team_members", payload: { ...accessPayload("access_role"), ...jobPayload }, scopes: ["membership_id", "team_user"] },
      { tableName: "team_members", payload: { ...accessPayload("role"), ...jobPayload }, scopes: ["membership_id", "team_user"] },
    ];
    const attempts = allAttempts.filter((attempt) => Object.keys(attempt.payload).length > 0);

    let lastRecoverableError = "Не вдалося оновити ролі напряму";
    let wroteData = false;
    for (const attempt of attempts) {
      for (const scope of attempt.scopes) {
        for (const schemaName of membershipUpdateSchemas) {
          if (scope === "membership_id" && !membershipId) continue;

          const { error } =
            scope === "workspace_user"
              ? await supabase
                  .schema(schemaName)
                  .from(attempt.tableName as never)
                  .update(attempt.payload as never)
                  .eq("workspace_id", workspaceId)
                  .eq("user_id", userId)
              : scope === "membership_id"
                ? await supabase
                    .schema(schemaName)
                    .from(attempt.tableName as never)
                    .update(attempt.payload as never)
                    .eq("id", membershipId as string)
                : await supabase
                    .schema(schemaName)
                    .from(attempt.tableName as never)
                    .update(attempt.payload as never)
                    .eq("team_id", teamId ?? "")
                    .eq("user_id", userId);

          if (error) {
            if (!isRecoverableRoleUpdateError(error.message)) throw new Error(error.message);
            lastRecoverableError = `${schemaName}.${attempt.tableName}[${scope}]: ${error.message}`;
            continue;
          }

          wroteData = true;
          if (await verifyRolesEventually()) return;

          // Запис пройшов — не повторюємо ту саму спробу в іншій схемі лише
          // заради того, щоб не отримати хибну «відновлювану» помилку.
          break;
        }
      }
    }

    if (wroteData) {
      // В'юха може відставати. Запис відбувся — блокуючої помилки тут не місце.
      await verifyRolesEventually(8, 150);
      return;
    }

    throw new Error(lastRecoverableError);
  };

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");

  const response = await fetch("/.netlify/functions/create-workspace-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      mode: "update_member_roles",
      userId,
      accessRole: nextAccessRole,
      jobRole: nextJobRole,
    }),
  });

  const payload = await parseJsonSafe<{ error?: string; accessRole?: string | null; jobRole?: string | null }>(response);

  let viaFallback = false;
  let appliedByRecoverableServerError = false;
  if (!response.ok) {
    if (response.status === 404) {
      await fallbackUpdateRolesDirectly();
      viaFallback = true;
    } else {
      const message = payload?.error || `Не вдалося оновити ролі (HTTP ${response.status})`;
      if (!isRecoverableRoleUpdateError(message)) throw new Error(message);
      if (!(await verifyRolesEventually(8, 150))) throw new Error(message);
      appliedByRecoverableServerError = true;
    }
  }

  const trusted = response.ok || appliedByRecoverableServerError;
  return {
    changed: true,
    accessRole: trusted ? (payload?.accessRole ?? normalizedAccessRole) : normalizedAccessRole,
    jobRole: trusted ? (payload?.jobRole ?? normalizedJobRole) : normalizedJobRole,
    viaFallback,
  };
}
