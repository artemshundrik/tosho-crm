/**
 * Матриця доступів — поперечний погляд «хто має що».
 *
 * НАВІЩО. Картка людини відповідає на питання «що має ця людина». Питання
 * навпаки — «хто має Фінанси», «у кого відкритий Dev» — не мало відповіді
 * ніде: щоб її дістати, треба було відкрити двадцять карток підряд. Саме на
 * цьому місці ловляться зайві доступи, а не в картці окремої людини.
 *
 * Це НЕ друга копія даних: клітинка показує той самий результат, який дає
 * реєстр модулів (`describeModuleLock`) картці людини. Редактор один — у
 * картці; матриця лише дивиться під іншим кутом.
 *
 * Дві осі навмисно. «Посади» відповідають, що посада дає за замовчуванням —
 * це проєктне рішення. «Люди» показують, що є НАСПРАВДІ, разом із ручними
 * відхиленнями. Питання різні, і зводити їх до однієї таблиці означало б
 * втратити одне з них.
 */

import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Loader2, Lock, Minus, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { formatJobRole } from "@/lib/jobRoles";
import {
  defaultModuleAccess,
  describeModuleLock,
  MODULE_GROUPS,
  type ModuleAccess,
  type ModuleKey,
  type RoleModuleOverrides,
} from "@/lib/moduleAccess";
import {
  clearRoleModuleDefault,
  loadRoleModuleOverrides,
  setRoleModuleDefault,
} from "@/lib/roleModuleDefaults";
import {
  invalidateWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
} from "@/lib/workspaceMemberDirectory";
import { pluralUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

export type MatrixPerson = {
  userId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  accessRole: string | null;
  jobRole: string | null;
  moduleAccess: Partial<ModuleAccess> | null | undefined;
};

type Axis = "roles" | "people";

/** Чутливі модулі: помилка тут коштує найдорожче, тож вони позначені. */
const SENSITIVE: ModuleKey[] = ["finance", "payroll", "vchasno_send", "members_access", "dev"];

const CELL = "inline-grid h-6 w-6 place-items-center rounded-md";

function Cell({
  checked,
  locked,
  title,
}: {
  checked: boolean;
  locked: boolean;
  title: string;
}) {
  if (locked) {
    return (
      <span
        className={cn(CELL, checked ? "bg-info-soft text-info-foreground" : "bg-muted text-muted-foreground/70")}
        title={title}
      >
        {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : <Lock className="h-3 w-3" />}
      </span>
    );
  }
  return checked ? (
    <span className={cn(CELL, "bg-info-soft text-info-foreground")} title={title}>
      <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
    </span>
  ) : (
    <span className={cn(CELL, "text-border")} title={title}>
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

/** Стала порожня мапа — щоб `useQuery` не віддавав щоразу новий об'єкт. */
const EMPTY_OVERRIDES: RoleModuleOverrides = new Map();

type PendingChange = {
  jobRole: string;
  roleLabel: string;
  moduleKey: ModuleKey;
  moduleLabel: string;
  next: boolean;
  /** Хто підхопить зміну сам — у них модуль стоїть рівно за старим дефолтом. */
  follows: MatrixPerson[];
  /** У кого записано інакше, ніж новий набір: їх «Застосувати до всіх» не чіпає. */
  deviating: MatrixPerson[];
};

export function AccessMatrix({
  people,
  workspaceId,
  canEditRoles = false,
  actorUserId = null,
  onPeopleChanged,
}: {
  people: MatrixPerson[];
  workspaceId?: string | null;
  /** Стартові набори посад міняють лише власник і СЕО. */
  canEditRoles?: boolean;
  actorUserId?: string | null;
  /**
   * Масова зміна переписала доступи людей — сторінці треба перечитати довідник.
   * Без цього наступний діалог рахує наслідки за списком, застарілим на одну
   * зміну: «не зачепить» там, де насправді зачепить (спіймано живцем).
   */
  onPeopleChanged?: () => void;
}) {
  const [axis, setAxis] = useState<Axis>("people");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  /*
   * Запитом, а не ефектом зі станом: `setState` в ефекті рахує ратчет боргу
   * перед пушем, і тут він ні до чого — це звичайне читання, якому личить кеш.
   * Помилка мовчазна: матриця має показувати набори навіть тоді, коли таблиця
   * винятків недоступна, — тоді просто без винятків, як у коді.
   */
  const { data: overrides = EMPTY_OVERRIDES } = useQuery({
    queryKey: ["role-module-overrides", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      loadRoleModuleOverrides(workspaceId as string).catch((error) => {
        console.warn("[matrix] role overrides unavailable", error);
        return EMPTY_OVERRIDES;
      }),
  });

  /** Колонки-посади — лише ті, які в команді справді є. */
  const roleColumns = useMemo(() => {
    const seen = new Map<string, number>();
    people.forEach((person) => {
      const key = (person.accessRole ?? "").toLowerCase() === "owner" ? "__owner" : (person.jobRole || "__none");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    return [...seen.entries()]
      .map(([key, count]) => ({
        key,
        count,
        label: key === "__owner" ? "Власник" : key === "__none" ? "Без посади" : formatJobRole(key) || key,
        accessRole: key === "__owner" ? "owner" : null,
        jobRole: key === "__owner" || key === "__none" ? null : key,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"));
  }, [people]);

  const columns = axis === "roles" ? roleColumns.length : people.length;

  /**
   * Готуємо зміну: рахуємо, кого вона зачепить ПОІМЕННО.
   *
   * Людина «підхопить сама», якщо її збережене значення дорівнює нинішньому
   * дефолту, — тобто вона ніколи не відступала від посади. Якщо ж значення
   * інше, це свідоме ручне рішення, і масове застосування його не чіпає:
   * стерти рішення керівника мовчки — найгірше, що тут можна зробити.
   */
  const openChange = useCallback(
    (jobRole: string, roleLabel: string, moduleKey: ModuleKey, moduleLabel: string, next: boolean) => {
      const current = defaultModuleAccess({ accessRole: null, jobRole }, overrides)[moduleKey];
      const sameRole = people.filter(
        (person) => (person.jobRole ?? "") === jobRole && (person.accessRole ?? "").toLowerCase() !== "owner"
      );
      const follows: MatrixPerson[] = [];
      const deviating: MatrixPerson[] = [];
      sameRole.forEach((person) => {
        const saved = person.moduleAccess?.[moduleKey];
        if (typeof saved !== "boolean" || saved === current) follows.push(person);
        else deviating.push(person);
      });
      setPending({ jobRole, roleLabel, moduleKey, moduleLabel, next, follows, deviating });
    },
    [overrides, people]
  );

  const applyChange = useCallback(
    async (mode: "new_only" | "everyone") => {
      if (!pending || !workspaceId) return;
      setSaving(true);
      try {
        /*
         * Повернення до того, що каже КОД, — це видалення рядка, а не запис
         * «як у коді». Інакше клік туди-назад лишав би в базі виняток, який
         * сьогодні збігається з ROLE_MENUS, а завтра — мовчки перебиває нове
         * рішення в коді.
         */
        const codeDefault = defaultModuleAccess({ accessRole: null, jobRole: pending.jobRole })[
          pending.moduleKey
        ];
        if (pending.next === codeDefault) {
          await clearRoleModuleDefault({
            workspaceId,
            jobRole: pending.jobRole,
            moduleKey: pending.moduleKey,
          });
        } else {
          await setRoleModuleDefault({
            workspaceId,
            jobRole: pending.jobRole,
            moduleKey: pending.moduleKey,
            enabled: pending.next,
            actorUserId,
          });
        }

        if (mode === "everyone") {
          // Пишемо лише тим, у кого значення СТОЯЛО явно: у кого його немає,
          // новий дефолт підхопиться сам, і зайвий запис лише зафіксував би
          // теперішній стан назавжди.
          const targets = pending.follows.filter(
            (person) => typeof person.moduleAccess?.[pending.moduleKey] === "boolean"
          );
          for (const person of targets) {
            await upsertWorkspaceMemberProfile({
              workspaceId,
              userId: person.userId,
              moduleAccess: {
                ...(person.moduleAccess as Record<string, boolean>),
                [pending.moduleKey]: pending.next,
              },
              updatedBy: actorUserId,
            });
          }
          invalidateWorkspaceMemberDirectory(workspaceId);
          onPeopleChanged?.();
        }

        await queryClient.invalidateQueries({ queryKey: ["role-module-overrides", workspaceId] });
        toast.success(
          pending.next
            ? `${pending.roleLabel}: ${pending.moduleLabel} відкрито`
            : `${pending.roleLabel}: ${pending.moduleLabel} прибрано`,
          {
            description:
              mode === "everyone"
                ? `Застосовано до всіх, крім тих, у кого записано інакше (${pending.deviating.length})`
                : "Діє для нових людей на цій посаді",
          }
        );
        setPending(null);
      } catch (error) {
        console.error("Failed to change role default", error);
        toast.error("Не вдалося змінити стартовий набір");
      } finally {
        setSaving(false);
      }
    },
    [actorUserId, onPeopleChanged, pending, queryClient, workspaceId]
  );

  if (!people.length) {
    return <div className="p-6 text-sm text-muted-foreground">Нема кого показувати.</div>;
  }

  return (
    // Верхній відступ свій: тіло сторінки повнорозмірне, і без нього перемикач
    // осі торкався смуги вкладок — так само, як було в «Огляді».
    <div className="flex min-h-0 flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
        <SegmentedGroup className="h-8">
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={axis === "people"}
            onClick={() => setAxis("people")}
          >
            Люди
          </Button>
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={axis === "roles"}
            onClick={() => setAxis("roles")}
          >
            Посади
          </Button>
        </SegmentedGroup>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Cell checked locked={false} title="" /> є доступ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cell checked={false} locked={false} title="" /> немає
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cell checked locked title="" /> дає роль — зняти не можна
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cell checked={false} locked title="" /> закрито в базі
          </span>
        </div>
        <span className="ml-auto text-2xs text-muted-foreground">
          {axis === "people"
            ? `${pluralUk(columns, "людина", "людини", "людей")} · редагується в картці`
            : `${pluralUk(columns, "посада", "посади", "посад")} · стартовий набір`}
        </span>
      </div>

      <div className="overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[15rem] border-b border-r border-border/60 bg-card px-4 py-2 text-left align-bottom font-semibold">
                Модуль
              </th>
              {axis === "roles"
                ? roleColumns.map((column) => (
                    <th
                      key={column.key}
                      className="sticky top-0 z-20 min-w-[5.5rem] border-b border-border/60 bg-card px-2 py-2 align-bottom"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-center text-2xs font-semibold leading-tight">{column.label}</span>
                        <span className="text-3xs tabular-nums text-muted-foreground">
                          {pluralUk(column.count, "людина", "людини", "людей")}
                        </span>
                      </div>
                    </th>
                  ))
                : people.map((person) => (
                    <th
                      key={person.userId}
                      className="sticky top-0 z-20 min-w-[3.25rem] border-b border-border/60 bg-card px-1 py-2 align-bottom"
                    >
                      <Link
                        to={`/team/${person.userId}`}
                        className="flex flex-col items-center gap-1"
                        title={`${person.name} · ${formatJobRole(person.jobRole) || "без посади"}`}
                      >
                        <AvatarBase
                          src={person.avatarUrl}
                          name={person.name}
                          fallback={person.initials}
                          assetVariant="xs"
                          size={26}
                          shape="circle"
                          className="border-border bg-muted/50"
                          fallbackClassName="text-3xs font-bold"
                        />
                      </Link>
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody>
            {MODULE_GROUPS.map((group) => (
              <Fragment key={group.group}>
                <tr>
                  <td
                    className="sticky left-0 z-20 border-b border-r border-border/60 bg-muted px-4 py-1.5 text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
                    colSpan={1}
                  >
                    {group.label}
                  </td>
                  <td className="border-b border-border/60 bg-muted" colSpan={columns} />
                </tr>
                {group.modules.map((module) => {
                  const sensitive = SENSITIVE.includes(module.key);
                  /*
                   * Модуль, якого немає в жодному наборі посад, — новий: у коді
                   * його бачать лише власник і СЕО, поки хтось не вирішить,
                   * кому він потрібен. Мовчати про це не можна: інакше рядок
                   * порожніх клітинок читається як «нікому не треба», хоч
                   * насправді це «ще не думали».
                   */
                  const unconfigured =
                    axis === "roles" &&
                    roleColumns
                      .filter((column) => Boolean(column.jobRole) && column.jobRole !== "seo")
                      .every(
                        (column) =>
                          !defaultModuleAccess(
                            { accessRole: column.accessRole, jobRole: column.jobRole },
                            overrides
                          )[module.key]
                      );
                  const withAccess = people.filter(
                    (person) =>
                      describeModuleLock(module.key, person.moduleAccess, {
                        accessRole: person.accessRole,
                        jobRole: person.jobRole,
                      }).checked
                  ).length;
                  return (
                    <tr key={module.key} className="group">
                      <td className="sticky left-0 z-20 border-b border-r border-border/60 bg-card px-4 py-1.5 group-hover:bg-muted/60">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {sensitive ? <ShieldAlert className="h-3.5 w-3.5 text-warning-foreground" /> : null}
                          <span className="font-medium">{module.label}</span>
                          <span className="text-3xs tabular-nums text-muted-foreground">
                            {withAccess} із {people.length}
                          </span>
                          {unconfigured ? (
                            <Badge tone="neutral" size="sm" className="shrink-0">
                              доступи посад не налаштовані
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      {axis === "roles"
                        ? roleColumns.map((column) => {
                            const ctx = { accessRole: column.accessRole, jobRole: column.jobRole };
                            const lock = describeModuleLock(module.key, null, ctx);
                            // Незаблокована клітинка показує ДІЮЧИЙ дефолт — уже
                            // з винятками власника, інакше після зміни вона
                            // малювала б старе значення з коду.
                            const checked = lock.locked
                              ? lock.checked
                              : defaultModuleAccess(ctx, overrides)[module.key];
                            const editable = canEditRoles && !lock.locked && Boolean(column.jobRole) && Boolean(workspaceId);
                            const title = `${column.label} · ${module.label}${lock.reason ? ` — ${lock.reason}` : ""}`;
                            return (
                              <td
                                key={column.key}
                                className="border-b border-border/60 px-2 py-1.5 text-center group-hover:bg-muted/60"
                              >
                                {editable ? (
                                  <button
                                    type="button"
                                    onClick={() => openChange(column.jobRole as string, column.label, module.key, module.label, !checked)}
                                    className="inline-grid cursor-pointer place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    title={`${title} · клік змінює стартовий набір посади`}
                                    aria-label={`${column.label}: ${checked ? "прибрати" : "додати"} ${module.label}`}
                                  >
                                    <Cell checked={checked} locked={false} title="" />
                                  </button>
                                ) : (
                                  <Cell
                                    checked={checked}
                                    locked={lock.locked}
                                    title={
                                      canEditRoles && lock.locked
                                        ? `${title} · це рішення реєстру модулів, матрицею його не змінити`
                                        : title
                                    }
                                  />
                                )}
                              </td>
                            );
                          })
                        : people.map((person) => {
                            const lock = describeModuleLock(module.key, person.moduleAccess, {
                              accessRole: person.accessRole,
                              jobRole: person.jobRole,
                            });
                            return (
                              <td
                                key={person.userId}
                                className="border-b border-border/60 px-1 py-1.5 text-center group-hover:bg-muted/60"
                              >
                                <Cell
                                  checked={lock.checked}
                                  locked={lock.locked}
                                  title={`${person.name} · ${module.label}${lock.reason ? ` — ${lock.reason}` : ""}`}
                                />
                              </td>
                            );
                          })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => (!open && !saving ? setPending(null) : undefined)}>
        <DialogContent className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>
              {pending?.next ? "Відкрити модуль посаді" : "Прибрати модуль у посади"}
            </DialogTitle>
            <DialogDescription>
              {pending
                ? `${pending.roleLabel} · ${pending.moduleLabel}. Це стартовий набір посади — те, що людина отримує, поки їй не виставили інше.`
                : null}
            </DialogDescription>
          </DialogHeader>

          {pending ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-[var(--radius-md)] border border-border/60 p-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Зачепить зараз ({pending.follows.length})
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground">
                  {pending.follows.length
                    ? pending.follows.map((person) => person.name).join(", ")
                    : "Нікого — на цій посаді зараз нікого немає."}
                </p>
              </div>
              {pending.deviating.length ? (
                <div className="rounded-[var(--radius-md)] border border-border/60 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Не зачепить — інше значення ({pending.deviating.length})
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">
                    {pending.deviating.map((person) => person.name).join(", ")}
                  </p>
                  <p className="mt-1.5 text-2xs text-muted-foreground">
                    У цих людей модуль записаний інакше, ніж каже новий набір. Масова зміна їх не чіпає:
                    затерти те, що комусь виставили свідомо, — найгірше, що тут можна зробити.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" disabled={saving} onClick={() => setPending(null)}>
              Скасувати
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={() => void applyChange("new_only")}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Лише новим
              </Button>
              <Button disabled={saving} onClick={() => void applyChange("everyone")}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Застосувати до всіх
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-6 text-2xs text-muted-foreground">
        {axis === "people" ? (
          <>
            <span>Клік по аватарці відкриває картку людини — там доступ і міняється.</span>
            <Badge tone="warning">
              <ShieldAlert className="h-3 w-3" />
              чутливий модуль
            </Badge>
            <span>— дані, помилка з якими коштує найдорожче.</span>
          </>
        ) : (
          <>
            <span>
              Стартовий набір посади. Збережене значення конкретної людини сильніше за нього — це видно на вкладці
              «Люди».
            </span>
            {canEditRoles ? (
              <span className="inline-flex items-center gap-1.5">
                <Pencil className="h-3 w-3" />
                Клік по клітинці міняє набір посади.
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
