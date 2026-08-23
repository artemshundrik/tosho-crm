import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invalidateWorkspaceResolution, resolveWorkspaceId, resolveWorkspaceMembership } from '@/lib/workspace';
import {
  buildPermissions,
  mapAccessRoleToTeamRole,
  permissionsForViewAs,
  type AccessRole,
  type AppPermissions,
  type JobRole,
  type TeamRole,
} from '@/lib/permissions';
import {
  isViewAsPerson,
  readViewAs,
  VIEW_AS_CHANGED_EVENT,
  viewAsModeOf,
  type ViewAsMode,
  type ViewAsTarget,
} from '@/auth/viewAs';
import { setViewOnlyMode } from '@/lib/viewOnlyGuard';
import {
  clearCachedTeamContext,
  readCachedTeamContext,
  writeCachedModuleAccess,
  writeCachedTeamContext,
} from '@/auth/teamContextCache';
import {
  defaultModuleAccess,
  fullModuleAccess,
  intersectModuleAccess,
  type ModuleAccess,
} from '@/lib/moduleAccess';
import {
  getCachedCurrentWorkspaceMemberDirectoryEntry,
  getCurrentWorkspaceMemberDirectoryEntry,
  listWorkspaceMemberDirectory,
  WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT,
} from '@/lib/workspaceMemberDirectory';

type AuthState = {
  session: Session | null;
  userId: string | null;
  teamId: string | null;
  role: TeamRole;
  accessRole: AccessRole;
  jobRole: JobRole;
  permissions: AppPermissions;
  /**
   * Дозволені модулі — вже з урахуванням режиму «Дивитись як».
   *
   * `undefined` = ще вантажиться (не показуй меню, бо блимне зайвим). Якщо
   * запису в довіднику немає, повертаємо дефолти за роллю, а не null: інакше
   * сайдбар (який трактував відсутність як «дозволено») і роут-гейт (який
   * вимагав явне true) розходилися, і людина бачила пункт меню, але на кліку
   * отримувала «потрібен доступ».
   *
   * Раніше кожен споживач сам кликав `getCurrentWorkspaceMemberDirectoryEntry()`,
   * а та функція вміє повертати ЛИШЕ власний запис — тому в режимі перегляду
   * підмінялись ролі, але не галочки модулів, і owner бачив своє меню очима
   * дизайнера. Тепер підміна одна на весь застосунок, тут.
   */
  moduleAccess: ModuleAccess | undefined;
  /** Активна ціль режиму «Дивитись як»; null — звичайний режим. */
  viewAs: ViewAsTarget | null;
  /**
   * Що це за режим: `observe` — очима конкретної людини, дії вимкнені;
   * `act` — приміряна посада, працювати можна (від свого імені й у межах
   * власних прав). `null` — звичайний режим.
   */
  viewAsMode: ViewAsMode | null;
  /** Чи має право вмикати режим бодай якимось входом. */
  canUseViewAs: boolean;
  /** Дивитись очима конкретної людини — лише owner. */
  canViewAsPerson: boolean;
  /** Приміряти посаду — owner і SEO. */
  canViewAsRole: boolean;
  /**
   * Чиї дані ПОКАЗУВАТИ. У режимі «Дивитись як» — id обраної людини, інакше
   * власний. Навмисно окремо від `userId`: той лишається справжнім, бо на ньому
   * будуються записи (автор задачі, коментаря), і підміна зробила б фальшиве
   * авторство. Використовуй лише для читання/відображення.
   */
  viewUserId: string | null;
  loading: boolean;
  /** Бекенд не відповідає: показувати не форму входу, а чесний екран. */
  backendUnavailable: boolean;
  refreshTeamContext: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const isMissingRelationError = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("relation");
};

/**
 * Пошук робочої команди людини.
 *
 * Навмисно НЕ приймає workspaceId: він тут потрібен був лише як запасне
 * значення, і через це весь виклик чекав на резолв workspace, хоча самі
 * запити залежать тільки від userId. Запасне значення тепер підставляє той,
 * хто кличе, — і завдяки цьому пошук іде паралельно з резолвом workspace.
 */
async function lookupOperationalTeamId(userId: string) {
  const attempts = [
    () =>
      supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ team_id?: string | null }>(),
    () =>
      supabase
        .schema("tosho")
        .from("team_members" as never)
        .select("team_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ team_id?: string | null }>(),
  ];

  for (const run of attempts) {
    const { data, error } = await run();
    if (!error && data?.team_id) {
      return data.team_id;
    }
    if (error && !isMissingRelationError(error.message)) {
      throw error;
    }
  }

  return null;
}

/**
 * Скільки чекаємо на відповідь про сесію, перш ніж сказати «база не відповідає».
 *
 * 12 секунд — це вже явно «щось не так», але ще не встигає роздратувати того,
 * у кого просто повільний інтернет.
 */
const SESSION_CHECK_TIMEOUT_MS = 12_000;

/**
 * Чи це та сама картка доступів.
 *
 * Потрібне саме порівняння ЗНАЧЕНЬ: фонова звірка щоразу приносить новий
 * об'єкт, і якщо класти його в стан не дивлячись, контекст авторизації
 * «міняється» на кожному фокусі вкладки — а з ним перезбирається піддерево
 * маршруту й сторінка монтується заново.
 */
const sameModuleAccess = (a: ModuleAccess | undefined, b: ModuleAccess | undefined) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ModuleAccess>;
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>(null);
  const [accessRole, setAccessRole] = useState<AccessRole>(null);
  const [jobRole, setJobRole] = useState<JobRole>(null);
  const [loading, setLoading] = useState(true);
  /** Бекенд не відповів на перевірку сесії — окремо від «немає сесії». */
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const userId = session?.user?.id ?? null;
  const userIdRef = useRef<string | null>(null);

  const resetTeamContext = useCallback(() => {
    setTeamId(null);
    setRole(null);
    setAccessRole(null);
    setJobRole(null);
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /**
   * Один політ на людину: поки контекст оновлюється, повторний виклик чекає на
   * той самий запит, а не заводить свій ланцюг.
   *
   * НАВІЩО. Оновлення тягне чотири звернення ПОСЛІДОВНО (блокування → воркспейс
   * → членство → команда), і від нього залежить перший кадр сторінки. А кличуть
   * його одразу троє: завантаження сесії, подія авторизації і повернення фокуса
   * у вкладку. Заміряно 20.08.2026 на дизайн-задачі: current_user_blocked ×3,
   * my_workspace_id ×3, memberships_view ×3 — три однакові ланцюги замість
   * одного, і кожен додає власне очікування мережі.
   *
   * Приєднуємось лише до польоту, який не старіший за наш запит: примусове
   * оновлення (forceRefresh) не має задовольнятись відповіддю з кешу.
   */
  const refreshInFlight = useRef<{ key: string; forced: boolean; task: Promise<void> } | null>(null);

  const runTeamContextRefresh = useCallback(async (targetUserId?: string | null, options?: { forceRefresh?: boolean }) => {
    const effectiveUserId = targetUserId ?? userId;
    if (!effectiveUserId) {
      resetTeamContext();
      return;
    }

    if (options?.forceRefresh) {
      invalidateWorkspaceResolution(effectiveUserId);
    }

    /**
     * Три незалежні запити — паралельно, а не ланцюжком.
     *
     * Було п'ять послідовних звернень до бази, перш ніж застосунок дізнавався
     * свій teamId, і весь цей час екран показував «Завантаження CRM». Але
     * залежність тут лише одна: членство потребує workspaceId. Перевірка
     * блокування не залежить ні від чого, а пошук команди — тільки від userId.
     *
     * Порядок наслідків збережено: якщо людину заблоковано, ми виходимо ДО
     * того, як щось запишемо в стан. Зайві два запити для заблокованого — це
     * ціна, яку платить один випадок на тисячу; RLS їм усе одно нічого не
     * віддасть.
     */
    const [blockedCheck, workspaceId, teamIdFromMembers] = await Promise.all([
      // Hard lockout: if the user has been offboarded (employment_status
      // inactive/rejected) they must not stay in the app — even with a currently
      // open tab. The RLS gates already deny their data, this forces a clean
      // logout instead of a broken UI. Runs on every focus/visibility refresh.
      supabase
        .schema("tosho")
        .rpc("current_user_blocked")
        .then(
          ({ data, error }) => (!error && data === true ? "blocked" : "ok"),
          (error) => {
            // RPC not deployed yet or transient failure — fall through, never
            // lock a legitimate user out because the check itself errored.
            console.error("Failed to check access lockout", error);
            return "ok" as const;
          }
        ),
      resolveWorkspaceId(effectiveUserId, options),
      // Помилку тут НЕ глушимо. Тихий відкат означав би teamId = workspaceId, а
      // це різні сутності: дані по такому id просто не знайдуться, і людина
      // побачить порожню, але правдоподібну CRM. Хай краще впаде вище — там
      // контекст скидається чесно.
      lookupOperationalTeamId(effectiveUserId),
    ]);

    if (blockedCheck === "blocked") {
      resetTeamContext();
      await supabase.auth.signOut();
      return;
    }

    let roleValue: TeamRole = null;
    let accessRoleValue: AccessRole = null;
    let jobRoleValue: JobRole = null;
    if (workspaceId) {
      const membership = await resolveWorkspaceMembership(workspaceId, effectiveUserId, options);
      if (membership) {
        accessRoleValue = (membership.accessRole as AccessRole) ?? null;
        jobRoleValue = (membership.jobRole as JobRole) ?? null;
        roleValue = mapAccessRoleToTeamRole(accessRoleValue);
      }
    }

    // Запасне значення підставляємо тут: раніше це робив сам пошук, і саме
    // через це він чекав на workspaceId.
    const operationalTeamId = teamIdFromMembers ?? workspaceId;
    setTeamId(operationalTeamId);
    setRole(roleValue);
    setAccessRole(accessRoleValue);
    setJobRole(jobRoleValue);
    // Запам'ятовуємо ЩОЙНО перевірене, щоб наступний старт не чекав на мережу.
    writeCachedTeamContext(effectiveUserId, {
      teamId: operationalTeamId,
      role: roleValue,
      accessRole: accessRoleValue,
      jobRole: jobRoleValue,
    });
  }, [resetTeamContext, userId]);

  /**
   * Підставити контекст, збережений минулого разу.
   *
   * Повертає `true`, якщо вдалося: тоді той, хто кличе, не тримає екран
   * «Завантаження CRM» на час мережевої звірки, а пускає застосунок одразу і
   * лишає справжній резолв у фоні.
   *
   * Гейт `if (!teamId) return` на сторінках лишається на місці — кешоване
   * значення приходить ДО першого рендеру, а не замість перевірки.
   */
  const applyCachedTeamContext = useCallback((targetUserId: string | null | undefined) => {
    const cached = readCachedTeamContext(targetUserId);
    if (!cached) return false;
    setTeamId(cached.teamId);
    setRole(cached.role);
    setAccessRole(cached.accessRole);
    setJobRole(cached.jobRole);
    return true;
  }, []);

  const refreshTeamContext = useCallback(
    async (targetUserId?: string | null, options?: { forceRefresh?: boolean }) => {
      const effectiveUserId = targetUserId ?? userId;
      if (!effectiveUserId) {
        resetTeamContext();
        return;
      }

      const forced = Boolean(options?.forceRefresh);
      const pending = refreshInFlight.current;
      if (pending && pending.key === effectiveUserId && (pending.forced || !forced)) {
        return pending.task;
      }

      const task = runTeamContextRefresh(effectiveUserId, options);
      refreshInFlight.current = { key: effectiveUserId, forced, task };
      try {
        await task;
      } finally {
        if (refreshInFlight.current?.task === task) refreshInFlight.current = null;
      }
    },
    [resetTeamContext, runTeamContextRefresh, userId]
  );

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        /**
         * Перевірка сесії з ДЕДЛАЙНОМ.
         *
         * Коли бекенд мовчить, supabase-js не здається: він повторює оновлення
         * токена знову й знову, і `getSession()` не повертається ВЗАГАЛІ.
         * Застосунок при цьому показує «Завантаження CRM» скільки завгодно
         * довго — саме це бачив власник під час аварії 20.08.2026, і саме тому
         * мережевого тайм-ауту самого по собі не досить (перевірено на живій
         * аварії: запити обривались за 5 с, а екран не змінювався).
         *
         * Дедлайн не «лагодить» бекенд — він лише дозволяє сказати правду
         * замість вічного колеса.
         */
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("SESSION_CHECK_TIMEOUT")), SESSION_CHECK_TIMEOUT_MS)
          ),
        ]);
        if (!mounted) return;
        const nextSession = data.session ?? null;
        setSession(nextSession);
        if (nextSession?.user?.id) {
          const bootUserId = nextSession.user.id;
          /**
           * Є збережений контекст — не тримаємо застосунок на місці.
           *
           * Раніше `loading` лишався true до кінця цього ланцюга, а поки він
           * true, `RequireAuth` малює оболонку і ЖОДНА сторінка не монтується.
           * Тобто дві хвилі запитів стояли перед кожним відкриттям картки.
           */
          if (applyCachedTeamContext(bootUserId)) {
            setLoading(false);
            void refreshTeamContext(bootUserId, { forceRefresh: true }).catch((error) => {
              // Контекст у нас уже є. Скидати його через мережевий збій означало б
              // зламати робочу вкладку заради помилки, яка сама по собі минуща.
              // Блокування співробітника це не пропускає: перевірка живе
              // всередині refreshTeamContext і виходить із системи сама.
              console.error("Failed to verify cached team context", error);
            });
          } else {
            try {
              await refreshTeamContext(bootUserId, { forceRefresh: true });
            } catch (error) {
              console.error("Failed to initialize team context", error);
              if (mounted) {
                resetTeamContext();
              }
            }
          }
        } else {
          resetTeamContext();
        }
      } catch (error) {
        console.error("Failed to initialize auth state", error);
        if (!mounted) return;
        // Бекенд не відповів — це НЕ «користувач вийшов». Показати екран входу
        // тут означало б збрехати: людина спробує увійти, і вхід теж не
        // працюватиме. Тому окремий стан, який оболонка показує як «база не
        // відповідає».
        if (errorText(error) === "SESSION_CHECK_TIMEOUT") setBackendUnavailable(true);
        setSession(null);
        resetTeamContext();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);

      // Do not block UI on token refresh events. They happen in background and
      // should not remount protected routes.
      if (event === "TOKEN_REFRESHED") {
        return;
      }

      // Lightweight handling for sign-out.
      if (event === "SIGNED_OUT") {
        clearCachedTeamContext();
        resetTeamContext();
        setLoading(false);
        return;
      }

      const nextUserId = nextSession?.user?.id ?? null;
      if (!nextUserId) {
        resetTeamContext();
        setLoading(false);
        return;
      }

      // Keep UI stable for any auth event affecting the same user
      // (token refresh, session sync, user profile updates, etc).
      if (nextUserId === userIdRef.current) {
        void refreshTeamContext(nextUserId, { forceRefresh: true }).catch((error) => {
          console.error("Failed to refresh auth context", error);
        });
        return;
      }

      /**
       * Only block UI when auth context switches to another user.
       *
       * Той самий виняток, що й на старті: якщо контекст цієї людини вже
       * збережений, тримати перед нею «Завантаження CRM» немає за чим —
       * звірка все одно піде слідом. Тут це важливо ще й тому, що подія
       * INITIAL_SESSION приходить сюди ж: вона трапляється на кожному
       * завантаженні, і без винятку саме вона повертала б екран очікування
       * назад одразу після того, як старт його зняв.
       *
       * Прапорець ставимо явно, а не «не вмикаємо»: на старті він уже true.
       */
      setLoading(!applyCachedTeamContext(nextUserId));
      void (async () => {
        try {
          await refreshTeamContext(nextUserId, { forceRefresh: true });
        } catch (error) {
          console.error("Failed to switch auth context", error);
          if (mounted) {
            resetTeamContext();
          }
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applyCachedTeamContext, refreshTeamContext, resetTeamContext]);

  useEffect(() => {
    if (!userId) return;

    const refreshAccess = () => {
      void refreshTeamContext(userId, { forceRefresh: true }).catch((error) => {
        console.error("Failed to refresh auth context on visibility change", error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAccess();
      }
    };

    window.addEventListener("focus", refreshAccess);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshAccess);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTeamContext, userId]);

  /**
   * Режим «Дивитись як» (тільки owner): підміняємо ролі в ОДНІЙ точці, тому
   * весь застосунок автоматично рендериться очима обраної людини — окремих
   * перевірок по компонентах не треба. Сесія Supabase не змінюється, тож RLS
   * лишається owner-івською: це UI-режим, не безпека (див. src/auth/viewAs.ts).
   */
  const [viewAs, setViewAs] = useState<ViewAsTarget | null>(() => readViewAs());
  useEffect(() => {
    const sync = () => setViewAs(readViewAs());
    window.addEventListener(VIEW_AS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(VIEW_AS_CHANGED_EVENT, sync);
  }, []);

  const realPermissions = useMemo(
    () => buildPermissions({ role, accessRole, jobRole }),
    [role, accessRole, jobRole],
  );
  /**
   * Кому який вхід дозволено.
   *
   * «Очима людини» — тільки owner: там живі дані конкретного співробітника, аж
   * до його заробітку. «Приміряти посаду» — ще й SEO: посада без людини чужих
   * особистих даних не показує взагалі, а йому потрібне саме це — побути в
   * шкірі продакта чи менеджера, проклацати й одразу щось підправити.
   *
   * Рахується від РЕАЛЬНИХ прав, а не від підмінених: інакше, увійшовши «як
   * дизайнер», людина втратила б разом із правами й вихід із режиму.
   */
  const canViewAsPerson = realPermissions.isSuperAdmin;
  const canViewAsRole = realPermissions.isSuperAdmin || realPermissions.isSeo;
  const activeViewAs =
    viewAs && (isViewAsPerson(viewAs) ? canViewAsPerson : canViewAsRole) ? viewAs : null;
  const viewAsMode = viewAsModeOf(activeViewAs);

  /**
   * Посада без людини навмисно не несе `accessRole`: «приміряв роль» ніколи не
   * видає owner-ських чи адмінських прапорців, хоч би яку посаду обрали.
   */
  const targetAccessRole = activeViewAs
    ? isViewAsPerson(activeViewAs)
      ? activeViewAs.accessRole
      : null
    : accessRole;
  const effectiveRole = activeViewAs ? mapAccessRoleToTeamRole(targetAccessRole) : role;
  const effectiveAccessRole = targetAccessRole as AccessRole | null;
  const effectiveJobRole = (activeViewAs ? activeViewAs.jobRole : jobRole) as JobRole | null;

  const permissions = useMemo(
    () =>
      activeViewAs
        ? permissionsForViewAs(
            realPermissions,
            buildPermissions({
              role: effectiveRole,
              accessRole: effectiveAccessRole,
              jobRole: effectiveJobRole,
            }),
          )
        : realPermissions,
    [activeViewAs, effectiveRole, effectiveAccessRole, effectiveJobRole, realPermissions],
  );

  /**
   * Гальмо на записи — рівно в режимі ПЕРЕГЛЯДУ.
   *
   * «Приміряв посаду» лишається робочим: SEO для того й заходить, щоб щось
   * підправити, і робить це від свого імені й у межах своїх прав. А от «очима
   * людини» існує, щоб ПОДИВИТИСЬ, тож усе, що пише, там вимкнено (див.
   * lib/viewOnlyGuard.ts).
   */
  useEffect(() => {
    setViewOnlyMode(viewAsMode === "observe");
    return () => setViewOnlyMode(false);
  }, [viewAsMode]);

  /**
   * Дозволені модулі — вже з урахуванням режиму.
   *
   * У звичайному режимі це власний запис із довідника. У режимі — ПЕРЕТИН
   * власних із доступами цілі: доступи в CRM персональні, а RLS у таблицях
   * командна (по team_id), тож «побачив пункт меню» означає «прочитав дані».
   * Отже режим має тільки звужувати, як і права.
   *
   * Запис обраної людини доводиться шукати в повному списку, бо
   * `getCurrentWorkspaceMemberDirectoryEntry` вміє лише «поточного»; для посади
   * без людини беремо дефолти цієї посади.
   */
  const viewAsPersonId = isViewAsPerson(activeViewAs) ? activeViewAs.userId : null;
  const [moduleAccess, setModuleAccess] = useState<ModuleAccess | undefined>(() =>
    activeViewAs ? undefined : getCachedCurrentWorkspaceMemberDirectoryEntry()?.moduleAccess,
  );

  useEffect(() => {
    let cancelled = false;
    // Немає запису в довіднику — беремо дефолти за роллю, а не «нічого».
    const ownFallback = () => defaultModuleAccess({ accessRole, jobRole });
    const targetFallback = () =>
      defaultModuleAccess({ accessRole: effectiveAccessRole, jobRole: effectiveJobRole });
    const effective = (own: ModuleAccess, target: ModuleAccess) =>
      activeViewAs ? intersectModuleAccess(own, target) : own;

    if (!userId) {
      setModuleAccess(effective(ownFallback(), targetFallback()));
      return () => {
        cancelled = true;
      };
    }

    /**
     * Доступи з минулого разу — до того, як приїде відповідь.
     *
     * Не заради швидшого меню: без цього значення в контексті підміняється вже
     * ПІСЛЯ того, як сторінка змонтувалась, і вона монтується вдруге, заново
     * питаючи всі свої дані.
     */
    if (!activeViewAs) {
      const cachedAccess = readCachedTeamContext(userId)?.moduleAccess ?? undefined;
      if (cachedAccess) {
        setModuleAccess((prev) => (sameModuleAccess(prev, cachedAccess) ? prev : cachedAccess));
      }
    }

    const load = async () => {
      try {
        const ownEntry = await getCurrentWorkspaceMemberDirectoryEntry();
        writeCachedModuleAccess(userId, ownEntry?.moduleAccess ?? null);
        /**
         * «Свої» доступи — це те, що людина відкриває НАСПРАВДІ, а не галочки
         * в її картці. У owner галочки бувають зняті (в Артема, наприклад,
         * `overview: false`), бо гейт маршруту пропускає його повз них за
         * `isSuperAdmin` (Rule 0). Без цієї поправки перетин закривав owner'у
         * власний «Огляд» щойно він заходив у режим — сторінка, яку поза
         * режимом він відкриває щодня.
         */
        const own = realPermissions.isSuperAdmin
          ? fullModuleAccess()
          : ownEntry?.moduleAccess ?? ownFallback();

        if (!activeViewAs) {
          if (!cancelled) setModuleAccess((prev) => (sameModuleAccess(prev, own) ? prev : own));
          return;
        }

        let target = targetFallback();
        if (viewAsPersonId) {
          const workspaceId = await resolveWorkspaceId(userId);
          if (workspaceId) {
            const rows = await listWorkspaceMemberDirectory(workspaceId);
            target = rows.find((row) => row.userId === viewAsPersonId)?.moduleAccess ?? target;
          }
        }

        const next = intersectModuleAccess(own, target);
        if (!cancelled) setModuleAccess((prev) => (sameModuleAccess(prev, next) ? prev : next));
      } catch (error) {
        console.error('Failed to resolve module access', error);
        if (!cancelled) setModuleAccess(effective(ownFallback(), targetFallback()));
      }
    };

    void load();

    // Змінили комусь доступи — перечитуємо, не чекаючи перезавантаження.
    const handleDirectoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId || detail.userId === viewAsPersonId) void load();
    };
    window.addEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate);
    };
  }, [
    activeViewAs,
    accessRole,
    jobRole,
    effectiveAccessRole,
    effectiveJobRole,
    realPermissions.isSuperAdmin,
    viewAsPersonId,
    userId,
  ]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId,
      teamId,
      role: effectiveRole,
      accessRole: effectiveAccessRole,
      jobRole: effectiveJobRole,
      permissions,
      moduleAccess,
      loading,
      backendUnavailable,
      refreshTeamContext,
      signOut,
      viewAs: activeViewAs,
      viewAsMode,
      canUseViewAs: canViewAsPerson || canViewAsRole,
      canViewAsPerson,
      canViewAsRole,
      // Приміряна посада — це не чужі дані: показуємо свої, але чужим інтерфейсом.
      viewUserId: viewAsPersonId ?? userId,
    }),
    [
      session,
      userId,
      teamId,
      effectiveRole,
      effectiveAccessRole,
      effectiveJobRole,
      permissions,
      moduleAccess,
      loading,
      backendUnavailable,
      refreshTeamContext,
      activeViewAs,
      viewAsMode,
      canViewAsPerson,
      canViewAsRole,
      viewAsPersonId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
