import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type InviteDelivery = "email" | "link";

type InviteRequest = {
  mode?:
    | "create_invite"
    | "deliver_invite"
    | "update_member_roles"
    | "list_workspace_member_profiles"
    | "update_member_profile";
  email?: string;
  accessRole?: string;
  jobRole?: string | null;
  expiresInDays?: number;
  /** email — Supabase шле лист; link — повертаємо посилання, адмін передає його сам. */
  delivery?: InviteDelivery;
  /** Для mode=deliver_invite: рядок tosho.workspace_invites, який перевидаємо. */
  inviteId?: string;
  userId?: string;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  availabilityStatus?: "available" | "vacation" | "sick_leave" | "offline" | null;
  startDate?: string | null;
  probationEndDate?: string | null;
  managerUserId?: string | null;
  // Ключі модулів не перелічуємо: реєстр живе у src/lib/moduleAccess.ts, а тут
  // ми лише пересилаємо те, що надіслав клієнт, нічого не втрачаючи.
  moduleAccess?: Record<string, boolean> | null;
};
type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

const normalizeRole = (value?: string | null) => {
  if (!value || value === "member") return null;
  return value;
};

const sameRole = (value: string | null | undefined, expected: string | null) => {
  const normalized = value === "member" ? null : value ?? null;
  return normalized === expected;
};

const isRecoverableError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("cannot update view") ||
    normalized.includes("could not find the table")
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const canManageTeam = (membership?: { access_role?: string | null; job_role?: string | null } | null) => {
  if (!membership) return false;
  return (membership.access_role ?? null) === "owner" || (membership.access_role ?? null) === "admin";
};

const resolveWorkspaceId = async (userClient: ReturnType<typeof createClient>, userId: string) => {
  const membershipSchemas = ["tosho", "public"] as const;
  const rpcCandidates = ["my_workspace_id", "current_workspace_id"] as const;

  for (const rpcName of rpcCandidates) {
    const { data, error } = await userClient.schema("tosho").rpc(rpcName);
    if (!error && data) {
      return data as string;
    }
  }

  const { data: membershipView } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();

  if (membershipView?.workspace_id) {
    return membershipView.workspace_id;
  }

  const membershipTables = ["memberships", "workspace_memberships"] as const;
  for (const schemaName of membershipSchemas) {
    for (const tableName of membershipTables) {
      const { data } = await userClient
        .schema(schemaName)
        .from(tableName)
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ workspace_id?: string | null }>();

      if (data?.workspace_id) {
        return data.workspace_id;
      }
    }
  }

  return null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}


/**
 * Витягує лише булеві прапорці з module_access, не втрачаючи невідомих ключів.
 * Перелік модулів — у src/lib/moduleAccess.ts (сюди не імпортується).
 */
function pickBooleanFlags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "boolean") result[key] = raw;
  }
  return result;
}

// Домен беремо так само, як решта функцій (_notificationDelivery, daily-digest,
// telegram-webhook, *Assistant): PUBLIC_APP_URL із запасним tosho.pro. Раніше
// тут був власний ланцюжок APP_URL || URL || SITE_URL, і на рантаймі Netlify
// підставляв URL = tosho-crm.netlify.app. Посилання вели на інший origin, а
// сесія живе під конкретним доменом — людина заходила за посиланням і на
// робочому tosho.pro все одно виглядала незалогіненою.
const resolveAppUrl = () => process.env.PUBLIC_APP_URL || "https://tosho.pro";

const buildInviteRedirect = (token: string) => `${resolveAppUrl()}/invite?token=${token}`;

type ActionLinkResult =
  | { ok: true; actionLink: string }
  | { ok: false; status: number; error: string };

/**
 * Видає одноразове посилання входу для запрошення.
 *
 * Таке посилання — носій доступу: хто ним перейшов, той опинився всередині
 * акаунта. Тому воно дозволене ЛИШЕ для акаунта, який ще не стоїть на власних
 * ногах (без пароля і без зовнішнього провайдера) і не є учасником жодного
 * воркспейсу — тобто для порожньої оболонки, чиї єдині права дає саме це
 * запрошення. Для самостійного акаунта правильний шлях — «Забув пароль?»:
 * лист іде у власну пошту людини, а не адміну в руки.
 *
 * Свідомо НЕ дивимось на last_sign_in_at: перехід за посиланням його виставляє,
 * але акаунт без пароля й без членства лишається порожнім і сам увійти не може.
 * Якщо вважати це «активованим», людина застрягає без жодного шляху назад.
 */
async function issueActionLink(params: {
  adminClient: ReturnType<typeof createClient>;
  email: string;
  inviteToken: string;
  /** Роль САМОГО запрошення, до якого прив'яжеться посилання, а не та, що просили в запиті. */
  inviteAccessRole: string | null;
  actorIsOwner: boolean;
}): Promise<ActionLinkResult> {
  const { adminClient, email, inviteToken, inviteAccessRole, actorIsOwner } = params;

  // Перевірка ролі живе тут, а не на місцях виклику: посилання прив'язується до
  // конкретного запрошення, і саме його роль отримає той, хто ним скористається.
  // Роль із тіла запиту для цього не показник — при збігу email функція
  // перевикористовує вже наявне запрошення разом з його роллю.
  if (!actorIsOwner && (inviteAccessRole ?? null) === "owner") {
    return { ok: false, status: 403, error: "Admin cannot deliver a Super Admin invite" };
  }

  const redirectTo = buildInviteRedirect(inviteToken);

  const { data: stateData, error: stateError } = await adminClient
    .schema("tosho")
    .rpc("invite_account_state", { _email: email });

  if (stateError) {
    return { ok: false, status: 500, error: stateError.message };
  }

  const state = (stateData ?? {}) as {
    userId?: string | null;
    accountExists?: boolean;
    activated?: boolean;
  };

  if (state.activated) {
    return {
      ok: false,
      status: 409,
      error:
        "У цієї людини вже активований акаунт — посилання для входу не видаємо. Хай скористається «Забув пароль?» на сторінці входу.",
    };
  }

  if (state.userId) {
    // Навмисно БЕЗ фільтра по workspace_id: акаунт, що вже є учасником
    // будь-де, не порожня оболонка, і адмін одного воркспейсу не має
    // отримувати вхід у нього через запрошення в свій.
    const { data: existingMembership, error: membershipError } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("user_id")
      .eq("user_id", state.userId)
      .limit(1)
      .maybeSingle<{ user_id?: string | null }>();

    if (membershipError) {
      return { ok: false, status: 500, error: membershipError.message };
    }
    if (existingMembership) {
      return { ok: false, status: 409, error: "Ця людина вже учасник workspace." };
    }
  }

  // Акаунта ще нема — тип invite його й створить. Якщо акаунт уже є (лист
  // колись надсилали, але людина так і не увійшла) — invite впаде на
  // email_exists, тож для нього беремо magiclink.
  const generated = state.accountExists
    ? await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      })
    : await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { workspace_invite_token: inviteToken } },
      });

  if (generated.error) {
    return { ok: false, status: 500, error: generated.error.message };
  }

  const actionLink = generated.data?.properties?.action_link;
  if (!actionLink) {
    return { ok: false, status: 500, error: "Supabase не повернув посилання для входу." };
  }

  // Якщо redirectTo немає у списку дозволених у Supabase Auth, GoTrue МОВЧКИ
  // підставляє Site URL — посилання спрацює, але викине людину на корінь без
  // токена запрошення, і збоку це виглядає як «нічого не сталося». Краще впасти
  // тут з чіткою причиною, ніж віддати адміну посилання в нікуди.
  const returnedRedirect = new URL(actionLink).searchParams.get("redirect_to");
  if (returnedRedirect !== redirectTo) {
    return {
      ok: false,
      status: 500,
      error:
        `Supabase підмінив адресу повернення на «${returnedRedirect ?? "порожньо"}». ` +
        `Додай ${redirectTo.split("?")[0]} у Authentication → URL Configuration → Redirect URLs.`,
    };
  }

  // Віддаємо не сире посилання Supabase, а нашу сторінку /enter із токеном у
  // hash. Месенджери самі відкривають кожен надісланий URL заради прев'ю і цим
  // спалюють одноразовий токен ще до людини — у нас сесію буквально тримав
  // user_agent «TelegramBot (like TwitterBot)». Фрагмент після # на сервер не
  // надсилається, тож краулер його не бачить, а перехід робить лише людина.
  const wrapped = `${resolveAppUrl()}/enter#link=${encodeURIComponent(actionLink)}`;

  return { ok: true, actionLink: wrapped };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  let payload: InviteRequest;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const workspaceId = await resolveWorkspaceId(userClient, userData.user.id);

  if (!workspaceId) {
    return jsonResponse(400, { error: "Workspace not found" });
  }

  if (payload.mode === "update_member_roles") {
    const targetUserId = payload.userId?.trim();
    if (!targetUserId) {
      return jsonResponse(400, { error: "Missing userId" });
    }

    const nextAccessRole = normalizeRole(payload.accessRole ?? "member");
    const nextJobRole = normalizeRole(payload.jobRole);

    const { data: actorMembership, error: actorMembershipError } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if (!canManageTeam(actorMembership)) {
      return jsonResponse(403, { error: "Only Super Admin or Admin can manage team" });
    }
    const actorIsOwner = (actorMembership?.access_role ?? null) === "owner";
    if (targetUserId === userData.user.id && !actorIsOwner) {
      return jsonResponse(400, { error: "Admin cannot change own roles" });
    }
    if (!actorIsOwner && nextAccessRole === "owner") {
      return jsonResponse(403, { error: "Admin cannot assign Super Admin role" });
    }

    const recoverableErrors: string[] = [];
    const { data: membershipTarget, error: membershipTargetError } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("id,access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle<{ id?: string | null; access_role?: string | null; job_role?: string | null }>();

    if (membershipTargetError) {
      return jsonResponse(500, { error: membershipTargetError.message });
    }

    const membershipId = membershipTarget?.id ?? null;
    /**
     * Операційна команда цілі — для записів у public.team_members.
     *
     * workspaceId сюди НЕ підходить: team_id і workspace_id — різні сутності з
     * різними значеннями, і фільтр по воркспейсу мовчки оновлював нуль рядків
     * (Supabase не вважає це помилкою). Саме тому ролі в public.team_members
     * роками лишались застарілими. Резолвимо з рядка самої людини.
     */
    const { data: teamRow } = await adminClient
      .from("team_members")
      .select("team_id")
      .eq("user_id", targetUserId)
      .limit(1)
      .maybeSingle<{ team_id?: string | null }>();
    const targetTeamId = teamRow?.team_id ?? null;
    const currentAccessRole = membershipTarget?.access_role ?? null;
    const currentJobRole = membershipTarget?.job_role ?? null;
    const accessRoleChanged = !sameRole(currentAccessRole, nextAccessRole);
    const jobRoleChanged = !sameRole(currentJobRole, nextJobRole);

    if (!accessRoleChanged && !jobRoleChanged) {
      return jsonResponse(200, {
        success: true,
        userId: targetUserId,
        accessRole: currentAccessRole,
        jobRole: currentJobRole,
      });
    }

    if (!actorIsOwner && currentAccessRole === "owner") {
      return jsonResponse(403, { error: "Admin cannot edit Super Admin members" });
    }

    const verifyUpdated = async () => {
      const { data: row, error: checkError } = await adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("access_role,job_role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId)
        .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

      if (checkError) throw new Error(checkError.message);
      if (!row) return false;
      const ok = sameRole(row.access_role, nextAccessRole) && sameRole(row.job_role, nextJobRole);
      return ok;
    };

    const verifyUpdatedEventually = async (attempts = 5, delayMs = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        const ok = await verifyUpdated();
        if (ok) return true;
        if (i < attempts - 1) {
          await sleep(delayMs);
        }
      }
      return false;
    };

    const membershipUpdateSchemas = ["tosho", "public"] as const;
    const tryUpdateWorkspaceScoped = async (
      tableName: string,
      updatePayload: Record<string, string | null>,
      scope: "workspace_user" | "membership_id" | "team_user"
    ) => {
      let wroteData = false;
      for (const schemaName of membershipUpdateSchemas) {
        if (scope === "membership_id" && !membershipId) {
          continue;
        }
        if (scope === "team_user" && !targetTeamId) {
          continue;
        }

        const { error } =
          scope === "workspace_user"
            ? await adminClient
                .schema(schemaName)
                .from(tableName)
                .update(updatePayload)
                .eq("workspace_id", workspaceId)
                .eq("user_id", targetUserId)
            : scope === "membership_id"
              ? await adminClient
                  .schema(schemaName)
                  .from(tableName)
                  .update(updatePayload)
                  .eq("id", membershipId as string)
              : await adminClient
                  .schema(schemaName)
                  .from(tableName)
                  .update(updatePayload)
                  .eq("team_id", targetTeamId as string)
                  .eq("user_id", targetUserId);

        if (error) {
          if (!isRecoverableError(error.message)) throw new Error(error.message);
          recoverableErrors.push(
            `${schemaName}.${tableName}[${scope}](${Object.keys(updatePayload).join(",")}): ${error.message}`
          );
          continue;
        }

        wroteData = true;
        const updated = await verifyUpdatedEventually();
        if (updated) return { updated: true, wroteData: true };

        // A successful write in one schema is enough for this attempt.
        // Do not continue to another schema just to avoid noisy recoverable errors.
        return { updated: false, wroteData: true };
      }

      return { updated: false, wroteData };
    };

    try {
      const updateAttempts: Array<{
        tableName: string;
        payload: Record<string, string | null>;
        scopes: Array<"workspace_user" | "membership_id" | "team_user">;
      }> = [
        {
          tableName: "memberships",
          payload: {
            ...(accessRoleChanged ? { access_role: nextAccessRole } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "memberships",
          payload: {
            ...(accessRoleChanged ? { role: nextAccessRole ?? "member" } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "workspace_members",
          payload: {
            ...(accessRoleChanged ? { access_role: nextAccessRole } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "workspace_members",
          payload: {
            ...(accessRoleChanged ? { role: nextAccessRole ?? "member" } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "workspace_memberships",
          payload: {
            ...(accessRoleChanged ? { access_role: nextAccessRole } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "workspace_memberships",
          payload: {
            ...(accessRoleChanged ? { role: nextAccessRole ?? "member" } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["workspace_user", "membership_id"],
        },
        {
          tableName: "team_members",
          payload: {
            ...(accessRoleChanged ? { access_role: nextAccessRole } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["membership_id", "team_user"],
        },
        {
          tableName: "team_members",
          payload: {
            ...(accessRoleChanged ? { role: nextAccessRole ?? "member" } : {}),
            ...(jobRoleChanged ? { job_role: nextJobRole } : {}),
          },
          scopes: ["membership_id", "team_user"],
        },
      ].filter((attempt) => Object.keys(attempt.payload).length > 0);

      let updated = false;
      let wroteData = false;
      for (const attempt of updateAttempts) {
        for (const scope of attempt.scopes) {
          const result = await tryUpdateWorkspaceScoped(attempt.tableName, attempt.payload, scope);
          wroteData = wroteData || result.wroteData;
          updated = result.updated;
          if (updated) break;
        }
        if (updated) break;
      }

      if (!updated && wroteData) {
        updated = await verifyUpdatedEventually(8, 150);
      }

      if (!updated) {
        if (wroteData) {
          return jsonResponse(200, {
            success: true,
            userId: targetUserId,
            accessRole: nextAccessRole,
            jobRole: nextJobRole,
            verified: false,
          });
        }
        return jsonResponse(500, {
          error:
            recoverableErrors[recoverableErrors.length - 1] ||
            "Could not update roles. Check memberships table and exposed columns in PostgREST.",
        });
      }

      return jsonResponse(200, {
        success: true,
        userId: targetUserId,
        accessRole: nextAccessRole,
        jobRole: nextJobRole,
      });
    } catch (error: unknown) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Could not update roles",
      });
    }
  }

  if (payload.mode === "list_workspace_member_profiles") {
    const { data: actorMembership, error: actorMembershipError } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if (!canManageTeam(actorMembership)) {
      return jsonResponse(403, { error: "Only Super Admin or Admin can manage team" });
    }

    const { data: rows, error: rowsError } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("user_id")
      .eq("workspace_id", workspaceId);

    if (rowsError) {
      return jsonResponse(500, { error: rowsError.message });
    }

    const userIds = Array.from(
      new Set(((rows ?? []) as Array<{ user_id?: string | null }>).map((row) => row.user_id).filter(Boolean))
    ) as string[];

    const profilesByUserId: Record<
      string,
      {
        firstName: string;
        lastName: string;
        fullName: string;
        birthDate: string;
        phone: string;
        availabilityStatus: "available" | "vacation" | "sick_leave" | "offline";
        startDate: string;
        probationEndDate: string;
        managerUserId: string;
        moduleAccess: {
          overview: boolean;
          orders: boolean;
          finance: boolean;
          design: boolean;
          logistics: boolean;
          catalog: boolean;
          contractors: boolean;
          team: boolean;
        };
      }
    > = {};

    await Promise.all(
      userIds.map(async (id) => {
        try {
          const { data: userProfile, error } = await adminClient.auth.admin.getUserById(id);
          if (error || !userProfile?.user) return;
          const meta = (userProfile.user.user_metadata ?? {}) as Record<string, unknown>;
          profilesByUserId[id] = {
            firstName: typeof meta.first_name === "string" ? meta.first_name : "",
            lastName: typeof meta.last_name === "string" ? meta.last_name : "",
            fullName: typeof meta.full_name === "string" ? meta.full_name : "",
            birthDate: typeof meta.birth_date === "string" ? meta.birth_date : "",
            phone: typeof meta.phone === "string" ? meta.phone : "",
            availabilityStatus:
              meta.availability_status === "vacation" ||
              meta.availability_status === "sick_leave" ||
              meta.availability_status === "offline"
                ? meta.availability_status
                : "available",
            startDate: typeof meta.start_date === "string" ? meta.start_date : "",
            probationEndDate: typeof meta.probation_end_date === "string" ? meta.probation_end_date : "",
            managerUserId: typeof meta.manager_user_id === "string" ? meta.manager_user_id : "",
            // Пропускаємо ВСІ булеві ключі, а не фіксований перелік: раніше тут
            // було вісім із тринадцяти, і кожен прохід мовчки з'їдав stock,
            // marketing, pulse та обидва «Вчасно». Список модулів живе в
            // src/lib/moduleAccess.ts, сюди він не імпортується (окремий
            // бандл), тож не дублюємо його, а просто нічого не втрачаємо.
            moduleAccess: pickBooleanFlags(meta.module_access),
          };
        } catch {
          // ignore item-level failures
        }
      })
    );

    return jsonResponse(200, {
      success: true,
      profilesByUserId,
    });
  }

  if (payload.mode === "update_member_profile") {
    const targetUserId = payload.userId?.trim();
    if (!targetUserId) {
      return jsonResponse(400, { error: "Missing userId" });
    }

    const { data: actorMembership, error: actorMembershipError } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if (!canManageTeam(actorMembership)) {
      return jsonResponse(403, { error: "Only Super Admin or Admin can manage team" });
    }
    const actorIsOwner = (actorMembership?.access_role ?? null) === "owner";

    const { data: targetMembership, error: targetMembershipError } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle<{ access_role?: string | null }>();

    if (targetMembershipError) {
      return jsonResponse(500, { error: targetMembershipError.message });
    }
    if (!targetMembership) {
      return jsonResponse(404, { error: "Member not found in workspace" });
    }
    if (!actorIsOwner && (targetMembership.access_role ?? null) === "owner") {
      return jsonResponse(403, { error: "Admin cannot edit Super Admin members" });
    }

    const { data: targetUser, error: targetUserError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (targetUserError || !targetUser?.user) {
      return jsonResponse(500, { error: targetUserError?.message ?? "User not found" });
    }

    const firstName = (payload.firstName ?? "").toString().trim();
    const lastName = (payload.lastName ?? "").toString().trim();
    const birthDate = (payload.birthDate ?? "").toString().trim();
    const phone = (payload.phone ?? "").toString().trim();
    const availabilityStatus =
      payload.availabilityStatus === "vacation" ||
      payload.availabilityStatus === "sick_leave" ||
      payload.availabilityStatus === "offline"
        ? payload.availabilityStatus
        : "available";
    const startDate = (payload.startDate ?? "").toString().trim();
    const probationEndDate = (payload.probationEndDate ?? "").toString().trim();
    const managerUserId = (payload.managerUserId ?? "").toString().trim();
    const moduleAccess =
      payload.moduleAccess && typeof payload.moduleAccess === "object"
        ? {
            overview: Boolean(payload.moduleAccess.overview),
            orders: Boolean(payload.moduleAccess.orders),
            finance: Boolean(payload.moduleAccess.finance),
            design: Boolean(payload.moduleAccess.design),
            logistics: Boolean(payload.moduleAccess.logistics),
            catalog: Boolean(payload.moduleAccess.catalog),
            contractors: (targetMembership.access_role ?? null) === "owner" ? true : Boolean(payload.moduleAccess.contractors),
            team: Boolean(payload.moduleAccess.team),
          }
        : {
            overview: true,
            orders: true,
            finance: false,
            design: true,
            logistics: false,
            catalog: false,
            contractors: (targetMembership.access_role ?? null) === "owner",
            team: false,
          };
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const currentMeta = (targetUser.user.user_metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = {
      ...currentMeta,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName || null,
      birth_date: birthDate || null,
      phone: phone || null,
      availability_status: availabilityStatus,
      start_date: startDate || null,
      probation_end_date: probationEndDate || null,
      manager_user_id: managerUserId || null,
      module_access: moduleAccess,
    };

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      user_metadata: nextMeta,
    });

    if (updateError) {
      return jsonResponse(500, { error: updateError.message });
    }

    return jsonResponse(200, {
      success: true,
      userId: targetUserId,
      profile: {
        firstName,
        lastName,
        fullName,
        birthDate,
        phone,
        availabilityStatus,
        startDate,
        probationEndDate,
        managerUserId,
        moduleAccess,
      },
    });
  }

  // Перевидача вже створеного запрошення: або лист ще раз, або посилання.
  if (payload.mode === "deliver_invite") {
    const inviteId = payload.inviteId?.trim();
    if (!inviteId) {
      return jsonResponse(400, { error: "Missing inviteId" });
    }

    const { data: actorMembership, error: actorMembershipError } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if (!canManageTeam(actorMembership)) {
      return jsonResponse(403, { error: "Only Super Admin or Admin can manage invites" });
    }
    const actorIsOwner = (actorMembership?.access_role ?? null) === "owner";

    // Фільтр по workspace_id обов'язковий: без нього адмін одного воркспейсу
    // перевидав би доступ у чужий за самим лише id запрошення.
    const { data: invite, error: inviteLoadError } = await adminClient
      .schema("tosho")
      .from("workspace_invites")
      .select("id,email,token,access_role,accepted_at,expires_at")
      .eq("id", inviteId)
      .eq("workspace_id", workspaceId)
      .maybeSingle<{
        id?: string | null;
        email?: string | null;
        token?: string | null;
        access_role?: string | null;
        accepted_at?: string | null;
        expires_at?: string | null;
      }>();

    if (inviteLoadError) {
      return jsonResponse(500, { error: inviteLoadError.message });
    }
    if (!invite?.token || !invite.email) {
      return jsonResponse(404, { error: "Запрошення не знайдено" });
    }
    if (invite.accepted_at) {
      return jsonResponse(409, { error: "Запрошення вже використано" });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return jsonResponse(409, { error: "Термін дії запрошення минув" });
    }
    if (!actorIsOwner && (invite.access_role ?? null) === "owner") {
      return jsonResponse(403, { error: "Admin cannot deliver a Super Admin invite" });
    }

    const inviteEmail = invite.email.trim().toLowerCase();

    if (payload.delivery === "link") {
      const linkResult = await issueActionLink({
        adminClient,
        email: inviteEmail,
        inviteToken: invite.token,
        inviteAccessRole: invite.access_role ?? null,
        actorIsOwner,
      });

      if (!linkResult.ok) {
        return jsonResponse(linkResult.status, { error: linkResult.error });
      }

      return jsonResponse(200, {
        success: true,
        delivery: "link",
        email: inviteEmail,
        token: invite.token,
        actionLink: linkResult.actionLink,
      });
    }

    const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: buildInviteRedirect(invite.token),
      data: { workspace_invite_token: invite.token },
    });

    if (resendError) {
      return jsonResponse(500, { error: resendError.message });
    }

    return jsonResponse(200, {
      success: true,
      delivery: "email",
      email: inviteEmail,
      token: invite.token,
    });
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    return jsonResponse(400, { error: "Missing email" });
  }

  const accessRole = payload.accessRole || "member";
  const jobRole = payload.jobRole ?? null;

  // Authorization: only owner/admin may create invites; only owner may invite an owner.
  const { data: actorMembership, error: actorMembershipError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();
  if (actorMembershipError) {
    return jsonResponse(500, { error: actorMembershipError.message });
  }
  if (!canManageTeam(actorMembership)) {
    return jsonResponse(403, { error: "Only Super Admin or Admin can invite members" });
  }
  if ((actorMembership?.access_role ?? null) !== "owner" && accessRole === "owner") {
    return jsonResponse(403, { error: "Admin cannot invite a Super Admin" });
  }

  const expiresInDays =
    typeof payload.expiresInDays === "number" && payload.expiresInDays > 0
      ? payload.expiresInDays
      : 7;

  const tokenValue = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: inviteInsertError } = await adminClient
    .schema("tosho")
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email,
      access_role: accessRole,
      job_role: jobRole,
      token: tokenValue,
      created_by: userData.user.id,
      expires_at: expiresAt,
    });

  let finalToken = tokenValue;
  let finalExpiresAt = expiresAt;
  let finalAccessRole: string | null = accessRole;
  let reusedExistingInvite = false;

  if (inviteInsertError) {
    const isDuplicateActiveInvite =
      inviteInsertError.code === "23505" &&
      inviteInsertError.message.includes("workspace_invites_unique_active_per_email");

    if (!isDuplicateActiveInvite) {
      return jsonResponse(500, { error: inviteInsertError.message });
    }

    const now = new Date().toISOString();
    const { data: existingInvite, error: existingInviteError } = await adminClient
      .schema("tosho")
      .from("workspace_invites")
      .select("token,expires_at,access_role")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError || !existingInvite?.token) {
      return jsonResponse(500, { error: inviteInsertError.message });
    }

    finalToken = existingInvite.token as string;
    finalExpiresAt = (existingInvite.expires_at as string) ?? expiresAt;
    // Роль беремо з наявного рядка: вона може бути вищою за ту, що просили зараз.
    finalAccessRole = (existingInvite.access_role as string | null) ?? null;
    reusedExistingInvite = true;
  }

  // Канал доставки обираємо явно. Лист і посилання лежать у РІЗНИХ слотах
  // auth.one_time_tokens (confirmation_token проти recovery_token), тож
  // спокійно співіснують. А от повторна видача того самого способу перезаписує
  // свій слот — індекс one_time_tokens_user_id_token_type_key унікальний по
  // (user_id, token_type) — і гасить попереднє. Посилання для входу ділить слот
  // із «Забув пароль», тож вони гасять одне одного.
  if (payload.delivery === "link") {
    const linkResult = await issueActionLink({
      adminClient,
      email,
      inviteToken: finalToken,
      inviteAccessRole: finalAccessRole,
      actorIsOwner: (actorMembership?.access_role ?? null) === "owner",
    });

    if (!linkResult.ok) {
      return jsonResponse(linkResult.status, { error: linkResult.error });
    }

    return jsonResponse(200, {
      token: finalToken,
      email,
      expiresAt: finalExpiresAt,
      reusedExistingInvite,
      delivery: "link",
      actionLink: linkResult.actionLink,
    });
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: buildInviteRedirect(finalToken),
    data: { workspace_invite_token: finalToken },
  });

  if (inviteError) {
    return jsonResponse(500, { error: inviteError.message });
  }

  return jsonResponse(200, {
    token: finalToken,
    email,
    expiresAt: finalExpiresAt,
    reusedExistingInvite,
    delivery: "email",
  });
};
