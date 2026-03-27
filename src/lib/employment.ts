function parseDateParts(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

export function parseDateOnly(value?: string | null) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function diffDays(from: Date, to: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / dayMs);
}

function pluralize(value: number, one: string, few: string, many: string) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatYears(value: number) {
  return `${value} ${pluralize(value, "рік", "роки", "років")}`;
}

function formatDays(value: number) {
  return `${value} ${pluralize(value, "день", "дні", "днів")}`;
}

export function formatEmploymentDate(value?: string | null) {
  const parsed = parseDateOnly(value);
  if (!parsed) return "Не вказано";
  return parsed.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatEmploymentDuration(startDate?: string | null, now = new Date()) {
  const start = parseDateOnly(startDate);
  if (!start) return "";

  const today = startOfLocalDay(now);
  const startDay = startOfLocalDay(start);
  const totalDays = diffDays(startDay, today);

  if (totalDays < 0) {
    return `Початок через ${formatDays(Math.abs(totalDays))}`;
  }

  let years = today.getFullYear() - startDay.getFullYear();
  const anniversary = new Date(startDay);
  anniversary.setFullYear(startDay.getFullYear() + years);
  if (anniversary.getTime() > today.getTime()) {
    years -= 1;
    anniversary.setFullYear(startDay.getFullYear() + years);
  }

  const remainingDays = diffDays(anniversary, today);

  if (years <= 0) {
    return formatDays(totalDays);
  }

  if (remainingDays <= 0) {
    return formatYears(years);
  }

  return `${formatYears(years)} ${formatDays(remainingDays)}`;
}

export function getEmploymentDurationDays(startDate?: string | null, now = new Date()) {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  return diffDays(start, now);
}

export function addMonthsToDateOnly(value: string, months: number) {
  const parsed = parseDateOnly(value);
  if (!parsed) return "";
  const result = new Date(parsed);
  result.setMonth(result.getMonth() + months);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, "0");
  const day = String(result.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type BirthdayInsight = {
  dateLabel: string;
  daysUntil: number;
  ageTurning: number | null;
  label: string;
  caption: string;
};

export function getBirthdayInsight(birthDate?: string | null, now = new Date()): BirthdayInsight | null {
  const parsed = parseDateParts(birthDate);
  if (!parsed) return null;

  const today = startOfLocalDay(now);
  const currentYearBirthday = new Date(today.getFullYear(), parsed.month - 1, parsed.day, 12, 0, 0, 0);
  const nextBirthday =
    currentYearBirthday.getTime() >= today.getTime()
      ? currentYearBirthday
      : new Date(today.getFullYear() + 1, parsed.month - 1, parsed.day, 12, 0, 0, 0);

  const daysUntil = diffDays(today, nextBirthday);
  const ageTurning = nextBirthday.getFullYear() - parsed.year;
  const dateLabel = nextBirthday.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  });

  if (daysUntil === 0) {
    return {
      dateLabel,
      daysUntil,
      ageTurning,
      label: "Сьогодні",
      caption: ageTurning > 0 ? `${ageTurning} років` : "День народження",
    };
  }

  return {
    dateLabel,
    daysUntil,
    ageTurning,
    label: `Через ${formatDays(daysUntil)}`,
    caption: ageTurning > 0 ? `${dateLabel} • ${ageTurning} років` : dateLabel,
  };
}

export type WorkAnniversaryInsight = {
  dateLabel: string;
  daysUntil: number;
  years: number;
  label: string;
  caption: string;
};

export function getWorkAnniversaryInsight(
  startDate?: string | null,
  now = new Date()
): WorkAnniversaryInsight | null {
  const start = parseDateOnly(startDate);
  if (!start) return null;

  const today = startOfLocalDay(now);
  const yearsWorked = Math.max(0, today.getFullYear() - start.getFullYear());
  let anniversary = new Date(start);
  anniversary.setFullYear(start.getFullYear() + yearsWorked);

  let nextYears = yearsWorked;
  if (anniversary.getTime() < today.getTime()) {
    nextYears += 1;
    anniversary = new Date(start);
    anniversary.setFullYear(start.getFullYear() + nextYears);
  }

  if (nextYears <= 0) nextYears = 1;
  const daysUntil = diffDays(today, anniversary);
  const dateLabel = anniversary.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (daysUntil === 0) {
    return {
      dateLabel,
      daysUntil,
      years: nextYears,
      label: `Сьогодні ${formatYears(nextYears)}`,
      caption: dateLabel,
    };
  }

  return {
    dateLabel,
    daysUntil,
    years: nextYears,
    label: `До ${formatYears(nextYears)}`,
    caption: `Через ${formatDays(daysUntil)} • ${dateLabel}`,
  };
}

export type ProbationSummary = {
  daysLeft: number;
  progress: number;
  status: "upcoming" | "active" | "completed";
  statusLabel: string;
  caption: string;
  endLabel: string;
};

export type EmploymentStatus = "probation" | "active" | "inactive" | "rejected";

export function normalizeEmploymentStatus(
  value?: string | null,
  probationEndDate?: string | null
): EmploymentStatus {
  if (value === "rejected") return "rejected";
  if (value === "inactive") return "inactive";
  if (value === "probation") return "probation";
  if (value === "active") return "active";
  return probationEndDate ? "probation" : "active";
}

export function getEmploymentStatusLabel(status: EmploymentStatus) {
  if (status === "rejected") return "Не прийнято";
  if (status === "inactive") return "Співпрацю завершено";
  if (status === "probation") return "Випробувальний";
  return "Працює";
}

export function isProbationReviewDue(
  employmentStatus?: string | null,
  probationEndDate?: string | null,
  now = new Date()
) {
  if (normalizeEmploymentStatus(employmentStatus, probationEndDate) !== "probation") return false;
  const end = parseDateOnly(probationEndDate);
  if (!end) return false;
  return startOfLocalDay(end).getTime() <= startOfLocalDay(now).getTime();
}

export function getProbationSummary(
  startDate?: string | null,
  probationEndDate?: string | null,
  now = new Date()
): ProbationSummary | null {
  const end = parseDateOnly(probationEndDate);
  if (!end) return null;

  const endLabel = formatEmploymentDate(probationEndDate);
  const today = startOfLocalDay(now);
  const start = parseDateOnly(startDate) ?? end;
  const safeStart = start.getTime() <= end.getTime() ? start : end;
  const totalDays = Math.max(diffDays(safeStart, end), 1);

  if (today.getTime() < safeStart.getTime()) {
    const daysUntilStart = diffDays(today, safeStart);
    return {
      daysLeft: diffDays(today, end),
      progress: 0,
      status: "upcoming",
      statusLabel: "Ще не стартував",
      caption: `Старт через ${formatDays(daysUntilStart)}`,
      endLabel,
    };
  }

  if (today.getTime() > end.getTime()) {
    return {
      daysLeft: diffDays(today, end),
      progress: 100,
      status: "completed",
      statusLabel: "Завершено",
      caption: `Завершився ${endLabel}`,
      endLabel,
    };
  }

  const elapsedDays = diffDays(safeStart, today);
  const daysLeft = diffDays(today, end);
  return {
    daysLeft,
    progress: Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100))),
    status: "active",
    statusLabel: "Триває",
    caption: `До завершення ${formatDays(daysLeft)}`,
    endLabel,
  };
}
