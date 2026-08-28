/**
 * Перетворення рядка довідника на дані картки людини для «Команди».
 *
 * ЧОМУ ОКРЕМО. Це чисте перетворення без стану, яке жило посеред JSX сторінки
 * на 2 400 рядків. Ратчет розміру (scripts/check-file-growth.mjs) зупинив пуш,
 * коли TeamPage виріс на один рядок, і його порада була правильною: не
 * піднімати стелю, а винести те, що не мусить жити всередині розмітки.
 *
 * Заодно тут видно всі рішення про підписи в одному місці, а не між тегами:
 * чому в неактивної людини присутність каже «Співпрацю завершено», а не «була
 * тоді-то», і чому точний час присутності їй не показуємо взагалі.
 */

import type { TeamMemberCardPerson } from "@/components/team/TeamMemberCard";
import { toAvatarAbsence } from "@/lib/absenceIndicator";
import { formatEmploymentDate, formatEmploymentDuration, type BirthdayInsight } from "@/lib/employment";
import { formatJobRole } from "@/lib/jobRoles";
import { formatLastSeenAgo, formatLastSeenExact } from "@/lib/lastSeen";
import { getInitialsFromName } from "@/lib/userName";

/** Рівно те, що потрібне картці, — не весь рядок довідника. */
export type TeamCardSource = {
  userId: string;
  label: string;
  email: string | null;
  phone: string;
  jobRole: string | null;
  avatarDisplayUrl: string | null;
  startDate: string;
  employmentStatus: string;
  online: boolean;
  inactive: boolean;
  lastSeenAt: string | null;
  birthdayInsight: BirthdayInsight | null;
  /**
   * Структурний тип, а не імпорт конкретного: `toAvatarAbsence` теж бере рівно
   * ці три поля, і на «Команді» сюди приходить `TodayAbsence` (з довідника), а
   * не повний `TeamAbsence` (із журналу). Вимагати повний означало б змушувати
   * сторінку добудовувати те, що картці не потрібне.
   */
  absenceToday: { kind: string; startDate?: string | null; endDate?: string | null } | null;
};

/**
 * Підпис присутності.
 *
 * Порожнє значення означає, що людина СПРАВДІ жодного разу не заходила (нема
 * рядка в user_presence), — так і кажемо. Туманне «давно» з'являлось усім, хто
 * випав із 30-хвилинного вікна, і нічого не пояснювало.
 */
function presenceText(lastSeenAt: string | null, online: boolean) {
  if (online) return "Зараз онлайн";
  if (!lastSeenAt) return "Візитів ще не було";
  return formatLastSeenAgo(lastSeenAt);
}

export function toTeamMemberCardPerson(member: TeamCardSource): TeamMemberCardPerson {
  return {
    userId: member.userId,
    name: member.label,
    roleLabel: formatJobRole(member.jobRole) || "Без ролі",
    avatarUrl: member.avatarDisplayUrl,
    initials: getInitialsFromName(member.label, member.email),
    email: member.email,
    phone: member.phone,
    online: member.online,
    inactive: member.inactive,
    probation: member.employmentStatus === "probation",
    tenureLabel: formatEmploymentDuration(member.startDate),
    startDateLabel: member.startDate ? formatEmploymentDate(member.startDate) : "",
    birthdayLabel: member.birthdayInsight?.dateLabel ?? null,
    birthdayDaysUntil: member.birthdayInsight?.daysUntil ?? null,
    // Людині, з якою співпрацю завершено, «остання присутність» не потрібна:
    // питання про неї вже не «коли була», а «чи працює» — і відповідь одна.
    presenceLabel: member.inactive
      ? "Співпрацю завершено"
      : presenceText(member.lastSeenAt, member.online),
    presenceExact: member.inactive ? null : formatLastSeenExact(member.lastSeenAt),
    absence: toAvatarAbsence(member.absenceToday),
    profileHref: `/team/${member.userId}`,
  };
}
