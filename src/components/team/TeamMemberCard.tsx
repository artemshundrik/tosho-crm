import { Cake, Mail, Phone, type LucideIcon } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { cn } from "@/lib/utils";
import { AbsenceBalanceMeters } from "@/components/team/AbsenceBalanceMeters";
import type { AbsenceBalance } from "@/lib/teamAbsenceQuotas";
import {
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import { toneBadgeClass, toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import type { AvatarAbsence } from "@/lib/absenceIndicator";

/**
 * Картка людини на вкладці «Люди».
 *
 * Статус береться з ЖУРНАЛУ відсутностей (approved-запис, що покриває
 * сьогодні), а не з окремого поля профілю: раніше ці два джерела розходились —
 * KPI зверху рахував одне, список знизу показував інше.
 *
 * Баланси — рольова деталь: `balance` передають лише там, де залишки видно
 * (свої — кожному, чужі — owner/SEO). Компонент сам нічого не вирішує.
 */

export type TeamMemberCardPerson = {
  userId: string;
  absence?: AvatarAbsence | null;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
  email?: string | null;
  phone?: string | null;
  online: boolean;
  inactive: boolean;
  probation: boolean;
  tenureLabel: string;
  startDateLabel: string;
  birthdayLabel: string | null;
  birthdayDaysUntil: number | null;
  presenceLabel: string;
};

function ContactRow({ icon: Icon, value, successMessage }: { icon: LucideIcon; value: string; successMessage: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <HoverCopyText
        value={value}
        buttonStyle="inline"
        className="min-w-0 flex-1"
        textClassName="text-xs text-muted-foreground"
        successMessage={successMessage}
      />
    </div>
  );
}

function formatShortDate(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

function pluralDays(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}

export function TeamMemberCard({
  person,
  absenceToday,
  pendingRequest,
  balance,
}: {
  person: TeamMemberCardPerson;
  /** Погоджена відсутність, що покриває сьогодні. */
  absenceToday?: TeamAbsence | null;
  /** Найближчий запит на погодженні — щоб було видно намір. */
  pendingRequest?: TeamAbsence | null;
  /** Передають лише коли залишки видно цьому глядачу. */
  balance?: AbsenceBalance | null;
}) {
  const birthdayToday = person.birthdayDaysUntil === 0;

  const statusChip = person.inactive
    ? { label: "Співпрацю завершено", className: toneBadgeClass.neutral }
    : absenceToday
      ? {
          label: `${TEAM_ABSENCE_KIND_LABELS[absenceToday.kind]} · до ${formatShortDate(absenceToday.endDate)}`,
          className: toneBadgeClass[TEAM_ABSENCE_KIND_TONE[absenceToday.kind]],
        }
      : pendingRequest
        ? {
            label: `Запит · ${formatShortDate(pendingRequest.startDate)}–${formatShortDate(pendingRequest.endDate)}`,
            className: toneBadgeClass.warning,
          }
        : { label: "На місці", className: toneBadgeClass.success };

  const email = person.email?.trim() ?? "";
  const phone = person.phone?.trim() ?? "";

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-inner border border-border/50 bg-card shadow-card",
        "transition-all duration-200 hover:border-border hover:shadow-[var(--shadow-elevated-sm)]"
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-0">
        <AvatarBase
          src={person.avatarUrl}
          name={person.name}
          fallback={person.initials}
          assetVariant="md"
          size={46}
          presence={person.online ? "online" : "offline"}
          inactive={person.inactive}
          // Повний рівень: на «Команді» тип відсутності треба бачити одразу.
          absence={person.absence ?? null}
          absenceDetail="full"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-sm font-semibold text-foreground",
                  person.inactive && "text-muted-foreground line-through"
                )}
              >
                {person.name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-xs text-muted-foreground">{person.roleLabel}</span>
                {person.probation ? (
                  <Badge tone="info" size="sm">
                    Випробувальний
                  </Badge>
                ) : null}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-3xs font-semibold",
                statusChip.className
              )}
            >
              {statusChip.label}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", person.online ? "tone-dot-success" : "bg-border")}
            />
            <span className="truncate">{person.presenceLabel}</span>
          </div>
        </div>
      </div>

      {email || phone ? (
        <div className="mt-3 space-y-1 px-4">
          {email ? <ContactRow icon={Mail} value={email} successMessage="Email скопійовано" /> : null}
          {phone ? <ContactRow icon={Phone} value={phone} successMessage="Номер скопійовано" /> : null}
        </div>
      ) : (
        <div className="mt-3 px-4 text-2xs text-muted-foreground/70">Контактів не вказано</div>
      )}

      {balance ? (
        <div className="mt-3 border-t border-border/40 px-4 pt-3">
          <AbsenceBalanceMeters balance={balance} dense />
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 pt-3 text-2xs text-muted-foreground">
        <span>
          Стаж <b className="font-medium text-foreground">{person.tenureLabel || "—"}</b>
        </span>
        <span>
          ДН{" "}
          <b className="font-medium tabular-nums text-foreground">{person.birthdayLabel ?? "—"}</b>
        </span>
        {person.startDateLabel ? <span className="text-muted-foreground/70">з {person.startDateLabel}</span> : null}
      </div>

      {birthdayToday ? (
        <div className={cn("flex items-center gap-2 border-t px-4 py-2", toneSubtleClass.warning)}>
          <Cake className={cn("h-3.5 w-3.5 shrink-0", toneTextClass.warning)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground">
            День народження — сьогодні
          </span>
        </div>
      ) : person.birthdayDaysUntil !== null && person.birthdayDaysUntil <= 7 ? (
        <div className={cn("flex items-center gap-2 border-t px-4 py-2", toneSubtleClass.warning)}>
          <Cake className={cn("h-3.5 w-3.5 shrink-0", toneTextClass.warning)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground">
            ДН через {person.birthdayDaysUntil} {pluralDays(person.birthdayDaysUntil)}
          </span>
        </div>
      ) : null}
    </article>
  );
}
