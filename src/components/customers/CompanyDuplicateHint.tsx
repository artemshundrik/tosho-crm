import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import { getCurrentUserId } from "@/lib/currentUser";
import { pickCompanyHints, type CompanyHintMatch } from "@/lib/companyDuplicateHint";
import { cn } from "@/lib/utils";

/**
 * «Схожа компанія вже є» — поповер під полем назви, поки її набирають.
 *
 * НАВІЩО НЕ НА ЗБЕРЕЖЕННІ. Перевірка на дублі була й раніше, але спрацьовувала
 * на кнопці «Зберегти» — тобто коли форму вже заповнено. Рішення Артема
 * 27.08.2026: попередження після зробленої роботи роботи не економить.
 *
 * ЧОМУ САМЕ ПОПОВЕР, А НЕ БЛОК ПІД ПОЛЕМ. Перша версія була вбудованим блоком —
 * і щоразу, коли підказка зʼявлялась, вона зсувала «Джерело» й усе нижче.
 * Це класичний content jumping: людина цілиться в поле, а воно тікає. Поповер
 * лежить НАД формою й нічого не рухає.
 *
 * ЧОМУ ФОРМА РЯДКА ТАКА САМА, ЯК У ПОШУКУ (CommandPalette): логотип зліва,
 * назва першим рядком, підпис другим. Цей рядок читають десятки разів на день,
 * і другий, схожий-але-інший вигляд довелося б розпізнавати заново.
 *
 * ЧОМУ ДРУГИЙ РЯДОК — ОДНА СМУГА «тип · менеджер», а не два бордюрні чипи.
 * У попередній версії мітка типу стояла після назви на змінній відстані, а
 * менеджер був окремою пігулкою з власною рамкою: три рамки на рядок, і жодна
 * колонка не збігалася із сусідньою. Тепер у кожного рядка однакова структура,
 * тож око читає їх стовпчиком, а не по одному.
 */

/** Поки друкують, не смикаємо базу на кожну літеру. */
const DEBOUNCE_MS = 350;

/** Коротше — надто широко: на двох літерах у списку опиниться пів бази. */
const MIN_QUERY = 3;

/** Той самий ключ, що в CustomerLeadQuickViewDialog: імена в картках пишуть руками. */
const normalizeMemberKey = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

type HintState = { matches: CompanyHintMatch[]; loading: boolean };

function useCompanyDuplicateHint(
  teamId: string | null | undefined,
  query: string,
  excludeId?: string | null
): HintState {
  // Стан — ОДИН і з міткою запиту, на який він відповідає. «Крутиться» й
  // «нічого не знайшли» звідси виводяться, а не тримаються окремими прапорцями:
  // будь-який setState у тілі ефекту — це зайвий прохід рендеру на кожну літеру
  // (ратчет react-hooks/set-state-in-effect, scripts/check-compiler-debt.mjs).
  const [result, setResult] = useState<{ query: string; matches: CompanyHintMatch[] }>({
    query: "",
    matches: [],
  });
  const requestRef = useRef(0);

  const trimmed = query.trim();
  const active = Boolean(teamId) && trimmed.length >= MIN_QUERY;

  useEffect(() => {
    if (!active || !teamId) {
      // Скасовуємо політ у відповідь, але стану не чіпаємо — його вже не видно.
      requestRef.current += 1;
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
          setResult({
            query: trimmed,
            matches: pickCompanyHints(
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
            ),
          });
        } catch {
          if (ticket === requestRef.current) setResult({ query: trimmed, matches: [] });
        }
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, excludeId, trimmed, teamId]);

  // Крутілка — поки відповідь не наздогнала те, що вже набрано: видно ОДРАЗУ,
  // ще до паузи, інакше перші 350 мс поле виглядає так, ніби нічого не сталось.
  // Старий список тим часом лишається на екрані — як і було, щоб не блимав.
  return { matches: active ? result.matches : [], loading: active && result.query !== trimmed };
}

/** Аватарки колег: довідник змінюється раз на місяці, тягнемо один раз. */
function useMemberAvatars() {
  const [byId, setById] = useState<Record<string, string | null>>({});
  const [byLabel, setByLabel] = useState<Record<string, string | null>>({});

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
        const nextById: Record<string, string | null> = {};
        const nextByLabel: Record<string, string | null> = {};
        for (const row of rows) {
          const avatar = row.avatarDisplayUrl ?? row.avatarUrl ?? null;
          nextById[row.userId] = avatar;
          const key = normalizeMemberKey(row.label);
          if (key) nextByLabel[key] = avatar;
        }
        setById(nextById);
        setByLabel(nextByLabel);
      } catch {
        // Без аватарок підказка лишається корисною — імена в ній усе одно є.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { byId, byLabel };
}

/**
 * Обгортка навколо поля назви: тримає якір поповера й крутілку.
 *
 * Поле лишається за викликачем — у замовника й ліда різні плейсхолдери,
 * розміри й валідація, і забирати його сюди означало б зліпити два різні
 * контроли в один «майже однаковий».
 */
export function CompanyDuplicateHintField({
  teamId,
  query,
  excludeId,
  children,
  className,
}: {
  teamId: string | null | undefined;
  query: string;
  /** Картка, яку зараз редагують: сама себе підказувати не має. */
  excludeId?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const { matches, loading } = useCompanyDuplicateHint(teamId, query, excludeId);
  const { byId, byLabel } = useMemberAvatars();

  return (
    <Popover open={matches.length > 0}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          {children}
          {/*
            Крутілка НЕ перехоплює вказівник: вона стоїть над полем, і без
            pointer-events-none клік у правий край поля не ставив би курсор.
          */}
          {loading ? (
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              role="status"
              aria-label="Шукаю схожі компанії"
            >
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            </span>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        // ШИРИНА ПОЛЯ: підказка має читатись як продовження саме цього поля, а
        // не як окрема панель, що прилетіла збоку.
        //
        // ФОН НЕПРОЗОРИЙ, на відміну від решти поповерів. Базовий `bg-popover/95`
        // з розмиттям добре виглядає в меню, яке накриває порожнє місце; тут
        // панель лягає просто на сусідні поля форми, і крізь неї читалось
        // «Джерело» під назвами компаній. Підказку про дубль треба прочитати з
        // першого разу, а не розбирати крізь чужий текст.
        className="w-[var(--radix-popover-trigger-width)] border-border/60 bg-popover p-1.5 backdrop-blur-none"
        // Фокус лишається в полі: людина продовжує друкувати, а поповер лише
        // показує. Без цього перше ж спрацювання виривало б курсор із поля.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="px-1.5 pb-1 pt-0.5 text-2xs font-medium text-muted-foreground">
          Схожа компанія вже є
        </div>
        <ul className="space-y-0.5">
          {matches.map((match) => {
            const manager = match.manager?.trim() || "";
            const avatar =
              (match.managerUserId ? byId[match.managerUserId] : null) ??
              (manager ? byLabel[normalizeMemberKey(manager)] ?? null : null);
            return (
              <li
                key={`${match.kind}-${match.id}`}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5"
              >
                <EntityAvatar
                  src={match.logoUrl ?? null}
                  name={match.name}
                  fallback={match.name.slice(0, 2).toUpperCase()}
                  size={34}
                  fallbackClassName="text-2xs font-semibold"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{match.name}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0">{match.kind}</span>
                    {manager ? (
                      <>
                        <span className="shrink-0 text-muted-foreground/50" aria-hidden>
                          ·
                        </span>
                        <AvatarBase
                          src={avatar}
                          name={manager}
                          size={16}
                          className="shrink-0 border-border/60"
                          fallbackClassName="text-[8px] font-semibold"
                        />
                        <span className="truncate">{manager}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
