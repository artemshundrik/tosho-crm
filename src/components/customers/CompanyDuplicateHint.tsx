import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import { getCurrentUserId } from "@/lib/currentUser";
import { pickCompanyHints, type CompanyHintMatch } from "@/lib/companyDuplicateHint";
import { cn } from "@/lib/utils";

/**
 * «Така компанія вже є» — під полем назви, поки її друкують.
 *
 * НАВІЩО НЕ НА ЗБЕРЕЖЕННІ. Перевірка на дублі в CRM була й раніше, але
 * спрацьовувала на кнопці «Зберегти». Рішення Артема 27.08.2026: попередження
 * після заповненої форми роботи не economить — «все одно витрачена робота».
 * Людина має побачити збіг на першому ж полі й сама вирішити не заводити.
 *
 * ЧОМУ НЕ ТЕЛЕФОН. Телефон — сильніший сигнал дубля, але він у формі НИЖЧЕ:
 * поки до нього дійдеш, усе інше вже набрано. Тому акцент на назві, яку
 * вводять першою.
 *
 * АВАТАРКА МЕНЕДЖЕРА — не прикраса. Сенс підказки в тому, щоб не задублювати
 * роботу КОЛЕГИ, тож головне питання не «чи є така картка», а «чия вона».
 * Побачивши обличчя, людина знає, до кого підійти.
 *
 * НІЧОГО НЕ ЗАБОРОНЯЄ. Заборона на схожість була б хибною: у базі законно
 * живуть «Агро Панцир» і «Агропросперіс». Точний збіг назви й далі блокує
 * збереження — це окрема, суворіша перевірка.
 */

/** Той самий ключ, що в CustomerLeadQuickViewDialog: імена в картках пишуть руками. */
const normalizeMemberKey = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Поки друкують, не смикаємо базу на кожну літеру. */
const DEBOUNCE_MS = 350;

/** Коротше — надто широко: на двох літерах у списку опиниться пів бази. */
const MIN_QUERY = 3;

export function CompanyDuplicateHint({
  teamId,
  query,
  /** Картка, яку зараз редагують: сама себе підказувати не має. */
  excludeId,
  className,
}: {
  teamId: string | null | undefined;
  query: string;
  excludeId?: string | null;
  className?: string;
}) {
  const [matches, setMatches] = useState<CompanyHintMatch[]>([]);
  const [avatarById, setAvatarById] = useState<Record<string, string | null>>({});
  const [avatarByLabel, setAvatarByLabel] = useState<Record<string, string | null>>({});
  const requestRef = useRef(0);

  // Довідник учасників тягнемо один раз на відкриття форми, а не на кожен
  // запит: він змінюється раз на місяці, а підказка смикається щокілька літер.
  // Користувача питаємо самі, а не приймаємо пропом: інакше його довелося б
  // протягувати через кожну форму, що відкриває цей діалог, — а він потрібен
  // рівно для того, щоб дістати аватарки колег.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId || cancelled) return;
        const workspaceId = await resolveWorkspaceId(currentUserId);
        if (!workspaceId || cancelled) return;
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        if (cancelled) return;
        const byId: Record<string, string | null> = {};
        const byLabel: Record<string, string | null> = {};
        for (const row of rows) {
          const avatar = row.avatarDisplayUrl ?? row.avatarUrl ?? null;
          byId[row.userId] = avatar;
          const key = normalizeMemberKey(row.label);
          if (key) byLabel[key] = avatar;
        }
        setAvatarById(byId);
        setAvatarByLabel(byLabel);
      } catch {
        // Без аватарок підказка лишається корисною — імена в ній усе одно є.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!teamId || trimmed.length < MIN_QUERY) {
      setMatches([]);
      return;
    }
    const ticket = ++requestRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [leads, customers] = await Promise.all([
            listLeadsBySearch(teamId, trimmed).catch(() => []),
            listCustomersBySearch(teamId, trimmed).catch(() => []),
          ]);
          // Пізня відповідь на старий запит не має перебивати свіжу: людина
          // друкує далі, і список під полем стрибав би назад.
          if (ticket !== requestRef.current) return;
          setMatches(
            pickCompanyHints(
              trimmed,
              leads
                .filter((row) => row.id !== excludeId)
                .map((row) => ({
                  id: row.id,
                  name: row.company_name ?? "",
                  legalName: row.legal_name ?? null,
                  manager: row.manager ?? null,
                  managerUserId: row.manager_user_id ?? null,
                  logoUrl: row.logo_url ?? null,
                })),
              customers
                .filter((row) => row.id !== excludeId)
                .map((row) => ({
                  id: row.id,
                  name: row.name ?? "",
                  legalName: row.legal_name ?? null,
                  manager: row.manager ?? null,
                  managerUserId: row.manager_user_id ?? null,
                  logoUrl: row.logo_url ?? null,
                }))
            )
          );
        } catch {
          if (ticket === requestRef.current) setMatches([]);
        }
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [excludeId, query, teamId]);

  if (matches.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-border/60 bg-card px-2.5 py-2", className)}>
      <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Схожа компанія вже є
      </div>
      {/*
        ФОРМА РЯДКА — та сама, що в пошуку по застосунку (CommandPalette):
        логотип зліва, назва з міткою, менеджер чипом під назвою. Люди вже
        читають цей рядок десятки разів на день, і другий, власний його вигляд
        довелося б розпізнавати заново.
        Логотип НАВМИСНО більший за пошуковий (32 проти 28): у пошуку поруч є
        назва запиту й підсвітка збігу, а тут єдине питання — «це та сама
        компанія?», і відповідає на нього саме він.
      */}
      <ul className="space-y-1.5">
        {matches.map((match) => {
          const manager = match.manager?.trim() || "";
          const avatar =
            (match.managerUserId ? avatarById[match.managerUserId] : null) ??
            (manager ? avatarByLabel[normalizeMemberKey(manager)] ?? null : null);
          return (
            <li key={`${match.kind}-${match.id}`} className="flex items-center gap-2.5">
              <EntityAvatar
                src={match.logoUrl ?? null}
                name={match.name}
                fallback={match.name.slice(0, 2).toUpperCase()}
                size={32}
                fallbackClassName="text-2xs font-semibold"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{match.name}</span>
                  <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {match.kind}
                  </span>
                </div>
                {manager ? (
                  <span className="mt-0.5 inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                    <AvatarBase
                      src={avatar}
                      name={manager}
                      size={16}
                      className="shrink-0 border-border/60"
                      fallbackClassName="text-[8px] font-semibold"
                    />
                    <span className="truncate">{manager}</span>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
