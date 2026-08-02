import { AvatarBase } from "@/components/app/avatar-kit";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";
import { toneBadgeClass } from "@/lib/statusTones";
import {
  ABSENCE_KIND_ICONS,
  formatAbsenceLabel,
  formatReturnDate,
  getAbsenceTone,
  toAvatarAbsence,
  type AvatarAbsence,
} from "@/lib/absenceIndicator";
import { formatJobRole } from "@/lib/jobRoles";
import { getInitialsFromName } from "@/lib/userName";
import { isInactiveEmployment } from "@/lib/employment";

/**
 * Картка людини під курсором — для поверхонь, де ухвалюють РІШЕННЯ про людину:
 * вибір виконавця, картка задачі, призначення менеджера.
 *
 * Там, де аватарка просто підписує автора (коментарі, історія), картка зайва —
 * достатньо `title` на самій аватарці, який уже несе статус із датами.
 *
 * ЩО СВІДОМО НЕ ПОКАЗУЄМО: залишок відпустки, ставки й виплати — приватне
 * (бачить сама людина + owner/SEO, і то на своїй сторінці, а не під курсором).
 */

/**
 * Рядок директорії → дані картки. Один конвертер на всі сторінки: інакше
 * кожна збирала б поля по-своєму і десь забула б, наприклад, приглушити
 * звільненого.
 */
export function toPersonHoverCardData(
  row: {
    userId: string;
    label: string;
    jobRole?: string | null;
    avatarDisplayUrl?: string | null;
    initials?: string | null;
    email?: string | null;
    phone?: string | null;
    absenceToday?: { kind: string; startDate?: string | null; endDate?: string | null } | null;
    employmentStatus?: string | null;
  },
  extras?: {
    roleLabel?: string | null;
    online?: boolean;
    lastSeenLabel?: string | null;
    activeTasks?: number | null;
    birthdayToday?: boolean;
    pendingAbsence?: AvatarAbsence | null;
    inactive?: boolean;
  }
): PersonHoverCardData {
  return {
    userId: row.userId,
    name: row.label,
    roleLabel: extras?.roleLabel ?? formatJobRole(row.jobRole) ?? null,
    avatarUrl: row.avatarDisplayUrl ?? null,
    initials: row.initials?.trim() || getInitialsFromName(row.label, row.email),
    email: row.email ?? null,
    phone: row.phone ?? null,
    absence: toAvatarAbsence(row.absenceToday),
    pendingAbsence: extras?.pendingAbsence ?? null,
    online: extras?.online ?? false,
    lastSeenLabel: extras?.lastSeenLabel ?? null,
    activeTasks: extras?.activeTasks ?? null,
    birthdayToday: extras?.birthdayToday ?? false,
    inactive: extras?.inactive ?? isInactiveEmployment(row.employmentStatus),
  };
}

export type PersonHoverCardData = {
  userId: string;
  name: string;
  roleLabel?: string | null;
  avatarUrl?: string | null;
  initials: string;
  email?: string | null;
  phone?: string | null;
  absence?: AvatarAbsence | null;
  /** Заявка на погодженні — щоб не планувати роботу на ці дні наперед. */
  pendingAbsence?: AvatarAbsence | null;
  online?: boolean;
  lastSeenLabel?: string | null;
  /** Скільки задач у роботі — головне число в момент призначення. */
  activeTasks?: number | null;
  birthdayToday?: boolean;
  inactive?: boolean;
};

function StatusBlock({ absence, pending }: { absence?: AvatarAbsence | null; pending?: AvatarAbsence | null }) {
  const target = absence ?? pending;
  if (!target) return null;
  const tone = getAbsenceTone(target.kind);
  const Icon = ABSENCE_KIND_ICONS[target.kind];
  const returnDate = absence ? formatReturnDate(absence) : "";

  return (
    <div className={cn("mt-2.5 rounded-[10px] border px-2.5 py-2", toneBadgeClass[tone])}>
      <div className="flex items-center gap-1.5 text-2xs font-semibold">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {absence ? formatAbsenceLabel(absence) : `просить ${formatAbsenceLabel(target)}`}
      </div>
      {returnDate ? <div className="mt-0.5 text-2xs opacity-90">повернеться {returnDate}</div> : null}
    </div>
  );
}

export function PersonHoverCard({
  person,
  children,
  side = "top",
}: {
  person: PersonHoverCardData;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const contacts = [person.email?.trim(), person.phone?.trim()].filter(Boolean).join(" · ");

  const card = (
    <div className="w-[248px]">
      <div className="flex items-start gap-2.5">
        <AvatarBase
          src={person.avatarUrl}
          name={person.name}
          fallback={person.initials}
          assetVariant="md"
          size={40}
          absence={person.absence}
          absenceDetail="full"
          inactive={person.inactive}
          showStatusIndicator={!person.absence && !person.inactive}
          presence={person.online ? "online" : "offline"}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight text-foreground">{person.name}</div>
          {person.roleLabel ? (
            <div className="mt-0.5 text-2xs text-muted-foreground">{person.roleLabel}</div>
          ) : null}
        </div>
      </div>

      {person.inactive ? (
        <div className="mt-2.5 rounded-[10px] border px-2.5 py-2 text-2xs font-semibold tone-neutral">
          Співпрацю завершено
        </div>
      ) : (
        <StatusBlock absence={person.absence} pending={person.pendingAbsence} />
      )}

      {person.birthdayToday ? (
        <div className={cn("mt-2 rounded-[10px] border px-2.5 py-1.5 text-2xs font-semibold", toneBadgeClass.festive)}>
          Сьогодні день народження
        </div>
      ) : null}

      {typeof person.activeTasks === "number" || person.lastSeenLabel ? (
        <div className="mt-2.5 space-y-1 text-2xs text-muted-foreground">
          {typeof person.activeTasks === "number" ? (
            <div className="flex items-center justify-between gap-3">
              <span>У роботі</span>
              <span className="font-medium tabular-nums text-foreground">{person.activeTasks}</span>
            </div>
          ) : null}
          {person.lastSeenLabel ? (
            <div className="flex items-center justify-between gap-3">
              <span>У мережі</span>
              <span className="font-medium text-foreground">{person.lastSeenLabel}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {contacts ? (
        <div className="mt-2.5 truncate border-t border-border/40 pt-2 text-2xs text-muted-foreground">{contacts}</div>
      ) : null}
    </div>
  );

  return (
    <HoverTip label={card} side={side} contentClassName="max-w-none rounded-[14px] p-3">
      {children}
    </HoverTip>
  );
}

/**
 * Зручна обгортка для місць, де людину може бути не визначено (незакріплений
 * менеджер, видалений виконавець): без даних просто рендерить дитину.
 */
export function PersonHoverCardMaybe({
  person,
  children,
  side = "top",
}: {
  person: PersonHoverCardData | null;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!person) return <>{children}</>;
  return (
    <PersonHoverCard person={person} side={side}>
      {children}
    </PersonHoverCard>
  );
}
