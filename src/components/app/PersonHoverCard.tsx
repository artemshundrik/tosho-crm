import * as React from "react";

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
import { formatLastSeenAgo, formatLastSeenExact } from "@/lib/lastSeen";
import { supabase } from "@/lib/supabaseClient";

/**
 * Картка людини під курсором — для поверхонь, де ухвалюють РІШЕННЯ про людину:
 * вибір виконавця, картка задачі, призначення менеджера.
 *
 * Там, де аватарка просто підписує автора (коментарі, історія), картка зайва —
 * достатньо `title` на самій аватарці, який уже несе статус із датами.
 *
 * ЩО СВІДОМО НЕ ПОКАЗУЄМО: залишок відпустки, ставки й виплати — приватне
 * (бачить сама людина + owner/CEO, і то на своїй сторінці, а не під курсором).
 */

/**
 * «Коли був» картка вміє діставати САМА — ліниво, при першому наведенні.
 *
 * Інакше кожна поверхня (Прорахунки, Дизайн, …) мала б тягнути user_presence
 * заради поля, яке здебільшого ніхто не дивиться. Кеш короткий: присутність
 * живе хвилинами, і вічний кеш показував би вчорашнє як сьогоднішнє.
 * Сторінка Команди передає підпис сама (їй присутність уже відома) — тоді
 * запиту не буде взагалі.
 */
const lastSeenCache = new Map<string, { at: number; lastSeenAt: string | null }>();
const LAST_SEEN_TTL_MS = 60_000;

async function loadLastSeenAt(userId: string): Promise<string | null> {
  const cached = lastSeenCache.get(userId);
  if (cached && Date.now() - cached.at < LAST_SEEN_TTL_MS) return cached.lastSeenAt;
  try {
    const { data } = await supabase
      .from("user_presence")
      .select("last_seen_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_seen_at?: string | null }>();
    const lastSeenAt = data?.last_seen_at ?? null;
    lastSeenCache.set(userId, { at: Date.now(), lastSeenAt });
    return lastSeenAt;
  } catch {
    // Картка — допоміжна річ: не показати рядок краще, ніж зламати наведення.
    return null;
  }
}

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
    taskBreakdown?: { new: number; changes: number; inProgress: number } | null;
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
    taskBreakdown: extras?.taskBreakdown ?? null,
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
  /**
   * Скільки задач НА ЛЮДИНІ зараз (нові + правки + в роботі).
   *
   * Підпис свідомо НЕ «у роботі»: так зветься колонка канбану, у якій лежить
   * лише `in_progress`. Через збіг назв число 9 читалось як «9 карток у тій
   * колонці», хоча там була одна — решта чекала в «Нових» і «Правках».
   */
  activeTasks?: number | null;
  /** Розбивка, щоб число пояснювало себе, а не змушувало здогадуватись. */
  taskBreakdown?: { new: number; changes: number; inProgress: number } | null;
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
    <div className={cn("mt-2.5 rounded-lg border px-2.5 py-2", toneBadgeClass[tone])}>
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
  // undefined = ще вантажиться, null = завантажили і рядка немає.
  // Розрізнення важливе: на undefined тримаємо бульбашку зачиненою (ready),
  // щоб вона не відкривалась порожньою і не доростала — не «стрибала».
  const [fetchedLastSeen, setFetchedLastSeen] = React.useState<string | null | undefined>(undefined);
  const requestedRef = React.useRef<string | null>(null);

  // Тягнемо лише коли поверхня підпису не дала й людина не онлайн.
  const needsLastSeen = !person.lastSeenLabel && !person.online;
  const handleEnter = React.useCallback(() => {
    if (!needsLastSeen) return;
    if (requestedRef.current === person.userId) return;
    requestedRef.current = person.userId;
    void loadLastSeenAt(person.userId).then((value) => setFetchedLastSeen(value));
  }, [needsLastSeen, person.userId]);

  const ready = !needsLastSeen || fetchedLastSeen !== undefined;
  const lastSeenValue = person.online
    ? "Зараз онлайн"
    : (person.lastSeenLabel ?? (fetchedLastSeen ? formatLastSeenAgo(fetchedLastSeen) : null));
  const lastSeenExact = fetchedLastSeen ? formatLastSeenExact(fetchedLastSeen) : undefined;
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
        <div className="mt-2.5 rounded-lg border px-2.5 py-2 text-2xs font-semibold tone-neutral">
          Співпрацю завершено
        </div>
      ) : (
        <StatusBlock absence={person.absence} pending={person.pendingAbsence} />
      )}

      {person.birthdayToday ? (
        <div className={cn("mt-2 rounded-lg border px-2.5 py-1.5 text-2xs font-semibold", toneBadgeClass.festive)}>
          Сьогодні день народження
        </div>
      ) : null}

      {typeof person.activeTasks === "number" || lastSeenValue ? (
        <div className="mt-2.5 space-y-1 text-2xs text-muted-foreground">
          {typeof person.activeTasks === "number" ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <span>Активних задач</span>
                <span className="font-medium tabular-nums text-foreground">{person.activeTasks}</span>
              </div>
              {person.taskBreakdown && person.activeTasks > 0 ? (
                <div className="mt-0.5 text-3xs text-muted-foreground/80">
                  {[
                    person.taskBreakdown.new > 0 ? `нових ${person.taskBreakdown.new}` : null,
                    person.taskBreakdown.changes > 0 ? `правок ${person.taskBreakdown.changes}` : null,
                    person.taskBreakdown.inProgress > 0 ? `у роботі ${person.taskBreakdown.inProgress}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
            </div>
          ) : null}
          {lastSeenValue ? (
            <div className="flex items-center justify-between gap-3">
              <span>У мережі</span>
              <span className="font-medium text-foreground" title={lastSeenExact}>
                {lastSeenValue}
              </span>
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
    <HoverTip label={card} side={side} contentClassName="max-w-none rounded-xl p-3" ready={ready}>
      {/* Запит стартує на вході курсора, а не на відкритті бульбашки: так
          картка відкривається вже ПОВНОЮ (HoverTip чекає ready). */}
      <span className="inline-flex" onMouseEnter={handleEnter} onFocusCapture={handleEnter}>
        {children}
      </span>
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
