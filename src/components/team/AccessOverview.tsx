/**
 * «Огляд» адмін-центру — стан доступів команди одним екраном.
 *
 * НАВІЩО. Матриця відповідає на «хто має що», картка — на «що має ця людина».
 * Але питання, з якого починається будь-яка ревізія прав, інше: «де ми зараз
 * і що змінилось». Раніше на нього не відповідало ніщо — доводилось відкривати
 * двадцять карток і вірити пам'яті.
 *
 * Мова екрана взята з «Стеку» й «Релізів»: велике число, смуга часток і
 * легенда з абсолютними значеннями. Частка без числа не дає діяти («більшість»
 * — це скільки?), число без частки не дає зрозуміти масштаб.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Loader2, ShieldAlert } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { formatJobRole } from "@/lib/jobRoles";
import { pluralUk } from "@/lib/lastSeen";
import {
  defaultModuleAccess,
  describeModuleLock,
  getModuleDefinition,
  normalizeModuleAccess,
  type ModuleKey,
} from "@/lib/moduleAccess";
import { callToshoRpc } from "@/lib/toshoRpc";
import { cn } from "@/lib/utils";
import type { MatrixPerson } from "@/components/team/AccessMatrix";

const CARD = "rounded-2xl border border-border/60 bg-card";
const CAP = "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";

/** Контури, помилка в яких коштує найдорожче. Порядок — за вагою наслідків. */
const SENSITIVE: ModuleKey[] = ["payroll", "finance", "dev", "members_access", "vchasno_send"];

type AuditEntry = {
  id: number;
  actorUserId: string | null;
  actorName: string | null;
  entityId: string | null;
  action: string;
  changed: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  module_access: "доступ до модулів",
  employment_status: "статус співпраці",
  job_role: "посаду",
  access_role: "рівень доступу",
  availability_status: "доступність",
  availability_start_date: "початок відсутності",
  availability_end_date: "кінець відсутності",
  start_date: "дату старту",
  manager_user_id: "керівника",
  first_name: "імʼя",
  last_name: "прізвище",
  full_name: "імʼя",
  birth_date: "дату народження",
  phone: "телефон",
  avatar_path: "аватар",
  avatar_url: "аватар",
  manager_rate: "відсоток менеджера",
  probation_end_date: "кінець випробувального",
};

/**
 * Службові поля, які змінюються при КОЖНОМУ записі й нічого не кажуть людині.
 * `updated_by` тим паче зайвий: хто саме змінив, у рядку вже написано.
 */
const NOISE_FIELDS = new Set(["updated_by", "updated_at", "created_at", "probation_review_notified_at"]);

/** Людські назви змінених полів, без службових і без повторів («імʼя» двічі). */
function describeChangedFields(changed: AuditEntry["changed"]) {
  const labels = Object.keys(changed ?? {})
    .filter((field) => !NOISE_FIELDS.has(field))
    .map((field) => FIELD_LABELS[field] ?? field);
  return [...new Set(labels)];
}

function when(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `сьогодні, ${date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
}

/** Смуга часток + легенда — той самий примітив, що в «Стеку». */
function ShareTile({
  cap,
  value,
  unit,
  parts,
}: {
  cap: string;
  value: number;
  unit: string;
  parts: { label: string; count: number; color: string }[];
}) {
  const total = parts.reduce((sum, part) => sum + part.count, 0) || 1;
  return (
    <div className={cn(CARD, "flex flex-col gap-3 p-4")}>
      <span className={CAP}>{cap}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">{value}</span>
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
      <div className="flex h-2.5 gap-[3px] overflow-hidden" aria-hidden="true">
        {parts
          .filter((part) => part.count > 0)
          .map((part) => (
            <span
              key={part.label}
              className={cn("rounded-[2px]", part.color)}
              style={{ flexGrow: part.count / total }}
            />
          ))}
      </div>
      <div className="flex flex-col gap-1">
        {parts.map((part) => (
          <div key={part.label} className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", part.color)} />
            <span className="min-w-0 truncate">{part.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{part.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccessOverview({
  people,
  workspaceId,
  pendingInvites,
  onOpenMatrix,
}: {
  people: MatrixPerson[];
  workspaceId: string | null;
  pendingInvites: number;
  onOpenMatrix: () => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);

  const byId = useMemo(() => new Map(people.map((person) => [person.userId, person])), [people]);

  /**
   * Хто відхиляється від стартового набору посади.
   *
   * Заблоковані модулі не рахуємо: там рішення ухвалює роль або сама база, і
   * «відхиленням» це називати означало б лякати тим, чого ніхто не робив.
   */
  const deviating = useMemo(
    () =>
      people.filter((person) => {
        const ctx = { accessRole: person.accessRole, jobRole: person.jobRole };
        const actual = normalizeModuleAccess(person.moduleAccess, person.accessRole, person.jobRole);
        const defaults = defaultModuleAccess(ctx);
        return (Object.keys(actual) as ModuleKey[]).some((key) => {
          const lock = describeModuleLock(key, actual, ctx);
          return !lock.locked && actual[key] !== defaults[key];
        });
      }),
    [people]
  );

  const sensitiveRows = useMemo(
    () =>
      SENSITIVE.map((key) => {
        const definition = getModuleDefinition(key);
        const holders = people.filter(
          (person) =>
            describeModuleLock(key, person.moduleAccess, {
              accessRole: person.accessRole,
              jobRole: person.jobRole,
            }).checked
        );
        return {
          key,
          label: definition?.label ?? key,
          holders,
          /** Роль вирішує повністю — галочка тут не важить нічого. */
          roleDecides: Boolean(definition?.roleDecides || definition?.restrictedTo),
        };
      }),
    [people]
  );

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      setLoadingLog(true);
      try {
        const { data } = await callToshoRpc<AuditEntry[]>("get_audit_log", {
          p_workspace_id: workspaceId,
          p_entity_type: "team_member_profile",
          p_entity_id: null,
          p_actor_user_id: null,
          p_limit: 30,
        });
        if (!cancelled) setEntries(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoadingLog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const financeHolders = sensitiveRows.find((row) => row.key === "finance")?.holders.length ?? 0;
  const payrollHolders = sensitiveRows.find((row) => row.key === "payroll")?.holders.length ?? 0;

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <div className="grid gap-3 md:grid-cols-3">
        <ShareTile
          cap="У команді"
          value={people.length}
          unit={pluralUk(people.length, "людина", "людини", "людей").split(" ")[1]}
          parts={[
            { label: "працюють зараз", count: people.length, color: "bg-chart-3" },
            { label: "чекають на запрошення", count: pendingInvites, color: "bg-chart-1" },
          ]}
        />
        <ShareTile
          cap="Джерело доступів"
          value={people.length - deviating.length}
          unit="за посадою"
          parts={[
            { label: "стартовий набір посади", count: people.length - deviating.length, color: "bg-chart-1" },
            { label: "з ручними відхиленнями", count: deviating.length, color: "bg-chart-5" },
          ]}
        />
        <ShareTile
          cap="Гроші"
          value={financeHolders}
          unit="бачать фінанси"
          parts={[
            // Найвужчий контур — теплим, решта — канонічним синім візуалізацій.
            { label: "бачать виплати команді", count: payrollHolders, color: "bg-chart-2" },
            { label: "лише рахунки й витрати", count: Math.max(financeHolders - payrollHolders, 0), color: "bg-chart-1" },
          ]}
        />
      </div>

      <section className={CARD}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold">Чутливі контури</h2>
          <span className="text-2xs text-muted-foreground">хто справді має доступ — з урахуванням бази</span>
          <button
            type="button"
            onClick={onOpenMatrix}
            className="ml-auto cursor-pointer text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Уся матриця
          </button>
        </header>
        {sensitiveRows.map((row) => (
          <div
            key={row.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-2.5 last:border-b-0"
          >
            <div className="flex min-w-[13rem] items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 text-warning-foreground" />
              {row.label}
            </div>
            <div className="flex min-w-0 flex-1 items-center">
              {row.holders.length === 0 ? (
                <span className="text-2xs text-muted-foreground">немає нікого</span>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {row.holders.slice(0, 8).map((person) => (
                    <Link
                      key={person.userId}
                      to={`/team/${person.userId}`}
                      title={`${person.name} · ${formatJobRole(person.jobRole) || "без посади"}`}
                    >
                      <AvatarBase
                        src={person.avatarUrl}
                        name={person.name}
                        fallback={person.initials}
                        assetVariant="xs"
                        size={24}
                        shape="circle"
                        className="border-border bg-muted/50"
                        fallbackClassName="text-3xs font-bold"
                      />
                    </Link>
                  ))}
                  {row.holders.length > 8 ? (
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      +{row.holders.length - 8}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {pluralUk(row.holders.length, "людина", "людини", "людей")}
            </span>
            <Badge tone={row.roleDecides ? "neutral" : "info"}>
              {row.roleDecides ? "вирішує посада" : "керується вручну"}
            </Badge>
          </div>
        ))}
      </section>

      <section className={CARD}>
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Останні зміни</h2>
          <span className="ml-auto text-2xs text-muted-foreground">ролі, доступи й HR-статуси</span>
        </header>
        {loadingLog ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Змін ще не зафіксовано. Нові зміни ролей і доступів з'являтимуться тут.
          </div>
        ) : (
          entries.slice(0, 12).map((entry) => {
            const target = entry.entityId ? byId.get(entry.entityId) : null;
            const actor = entry.actorUserId ? byId.get(entry.actorUserId) : null;
            const fields = describeChangedFields(entry.changed);
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-4 py-2.5 text-xs last:border-b-0"
              >
                {actor ? (
                  <AvatarBase
                    src={actor.avatarUrl}
                    name={actor.name}
                    fallback={actor.initials}
                    assetVariant="xs"
                    size={22}
                    shape="circle"
                    className="border-border bg-muted/50"
                    fallbackClassName="text-3xs font-bold"
                  />
                ) : null}
                <span className="font-medium">{actor?.name ?? entry.actorName ?? "Система"}</span>
                <span className="text-muted-foreground">
                  {entry.action === "insert"
                    ? "створює профіль"
                    : fields.length
                      ? "змінює"
                      : "оновлює профіль"}
                </span>
                {fields.length ? <span className="text-muted-foreground">{fields.join(", ")}</span> : null}
                {target ? (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Link
                      to={`/team/${target.userId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {target.name}
                    </Link>
                  </>
                ) : null}
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{when(entry.createdAt)}</span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
