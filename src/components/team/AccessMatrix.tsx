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

import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Lock, Minus, ShieldAlert } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { formatJobRole } from "@/lib/jobRoles";
import { describeModuleLock, MODULE_GROUPS, type ModuleAccess, type ModuleKey } from "@/lib/moduleAccess";
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

export function AccessMatrix({ people }: { people: MatrixPerson[] }) {
  const [axis, setAxis] = useState<Axis>("people");

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
                        </div>
                      </td>
                      {axis === "roles"
                        ? roleColumns.map((column) => {
                            const lock = describeModuleLock(module.key, null, {
                              accessRole: column.accessRole,
                              jobRole: column.jobRole,
                            });
                            return (
                              <td
                                key={column.key}
                                className="border-b border-border/60 px-2 py-1.5 text-center group-hover:bg-muted/60"
                              >
                                <Cell
                                  checked={lock.checked}
                                  locked={lock.locked}
                                  title={`${column.label} · ${module.label}${lock.reason ? ` — ${lock.reason}` : ""}`}
                                />
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
          <span>
            Стартовий набір посади. Збережене значення конкретної людини сильніше за нього — це видно на вкладці
            «Люди».
          </span>
        )}
      </div>
    </div>
  );
}
