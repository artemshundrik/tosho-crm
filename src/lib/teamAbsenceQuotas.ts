import { supabase } from "@/lib/supabaseClient";
import {
  countQuotaDaysInYear,
  DEFAULT_ABSENCE_QUOTAS,
  type QuotaAbsenceKind,
} from "@/lib/teamAbsenceCalendar";
import { isQuotaAbsenceKind, type TeamAbsence } from "@/lib/teamAbsences";

/**
 * Річні квоти відсутностей і залишки — шар доступу до даних.
 * Чиста математика робочого календаря живе в teamAbsenceCalendar.ts.
 *
 * ПРИВАТНІСТЬ: залишки бачить сама людина + owner/CEO. Гейт стоїть у БД —
 * RPC `team_absence_balances` не-адміну повертає рівно один рядок (свій),
 * тож фронт голого select по квотах не робить.
 */

export type AbsenceQuotaBucket = {
  quota: number;
  /** Робочі дні з ПОГОДЖЕНИХ записів за рік. */
  used: number;
  /** Робочі дні з запитів, що ще на погодженні (у БД квоту не списали). */
  pending: number;
  /** quota − used, не менше нуля. Pending тут НЕ віднімається. */
  remaining: number;
};

export type AbsenceBalance = Record<QuotaAbsenceKind, AbsenceQuotaBucket> & {
  userId: string;
};

export type AbsenceQuotaRow = {
  userId: string;
  year: number;
  vacationDays: number;
  dayOffDays: number;
  sickDays: number;
};

function emptyBucket(quota: number): AbsenceQuotaBucket {
  return { quota, used: 0, pending: 0, remaining: quota };
}

/** Дефолтний баланс для людини, якої немає у відповіді RPC. */
export function fallbackBalance(userId: string): AbsenceBalance {
  return {
    userId,
    vacation: emptyBucket(DEFAULT_ABSENCE_QUOTAS.vacation),
    day_off: emptyBucket(DEFAULT_ABSENCE_QUOTAS.day_off),
    sick_leave: emptyBucket(DEFAULT_ABSENCE_QUOTAS.sick_leave),
  };
}

/** Виняткові дні календаря за період. Порожня мапа = звичайні пн–пт. */
/**
 * Винятки робочого календаря + назви свят.
 *
 * Назви живуть в окремій мапі навмисно: уся математика (isBusinessDay,
 * countQuotaDaysInYear) працює з `Map<день, boolean>` і не має знати про
 * підписи, а UI без підписів показував би 24 серпня точно як суботу.
 */
export type WorkdayCalendar = {
  /** день → чи робочий. Це те, що їсть математика. */
  exceptions: Map<string, boolean>;
  /**
   * день → назва свята. Будь-який виняток із підписом, робочий він чи ні.
   *
   * Раніше сюди потрапляли лише НЕробочі: «свято» і «вихідний» вважались одним
   * і тим самим. Але буває робоче свято — 24 серпня 2026 команда працює, а
   * привітати з Днем Незалежності все одно треба. Чи вихідний це, каже
   * `exceptions`, і тільки він; тут лежить ім'я, а не режим дня.
   */
  holidayNames: Map<string, string>;
};

export async function loadWorkdayExceptions(params: {
  workspaceId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (exclusive)
}): Promise<WorkdayCalendar> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("ua_workday_exceptions")
    .select("day,is_workday,note")
    .eq("workspace_id", params.workspaceId)
    .gte("day", params.from)
    .lt("day", params.to);

  if (error) throw error;

  const exceptions = new Map<string, boolean>();
  const holidayNames = new Map<string, string>();
  (data ?? []).forEach((row) => {
    exceptions.set(row.day, row.is_workday);
    const note = (row.note as string | null)?.trim();
    // Підписаний виняток — це свято, незалежно від того, працюємо ми того дня
    // чи ні. Режим дня лишається в `exceptions`.
    if (note) holidayNames.set(row.day, note);
  });
  return { exceptions, holidayNames };
}

export type HolidayRow = { dateKey: string; name: string; isWorkday: boolean };

/**
 * Список свят року для редактора: усі підписані винятки.
 *
 * Фільтр «лише неробочі» тут був, поки свято й вихідний означали одне й те
 * саме. Робоче свято (24 серпня 2026) при такому фільтрі просто зникало зі
 * списку — і виглядало так, ніби його хтось видалив.
 */
export async function listHolidays(params: {
  workspaceId: string;
  year: number;
}): Promise<HolidayRow[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("ua_workday_exceptions")
    .select("day,is_workday,note")
    .eq("workspace_id", params.workspaceId)
    .gte("day", `${params.year}-01-01`)
    .lte("day", `${params.year}-12-31`)
    .order("day", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as Array<{ day: string; is_workday: boolean; note: string | null }>)
    .filter((row) => (row.note ?? "").trim().length > 0)
    .map((row) => ({
      dateKey: row.day,
      name: row.note?.trim() || "Свято",
      isWorkday: row.is_workday,
    }));
}

/** Додати або перейменувати святковий день. Пише лише owner/admin/CEO (RLS). */
export async function upsertHoliday(params: {
  workspaceId: string;
  dateKey: string;
  name: string;
  updatedBy: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("ua_workday_exceptions")
    .upsert(
      {
        workspace_id: params.workspaceId,
        day: params.dateKey,
        is_workday: false,
        note: params.name.trim().slice(0, 200) || "Свято",
        updated_by: params.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,day" }
    );
  if (error) throw error;
}

export async function deleteHoliday(params: { workspaceId: string; dateKey: string }): Promise<void> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("ua_workday_exceptions")
    .delete()
    .eq("workspace_id", params.workspaceId)
    .eq("day", params.dateKey)
    .select("day");

  if (error) throw error;
  // .select() навмисно: delete без нього мовчить, коли RLS не дала рядка, і
  // UI показав би «видалено» на дні, який лишився в календарі.
  if (!data || data.length === 0) {
    throw new Error("День не знайдено або немає прав");
  }
}

/** Найближчі свята від дати — для блоку «Події» і сповіщень. */
export function upcomingHolidays(
  holidayNames: Map<string, string>,
  fromDateKey: string,
  limit = 3
): Array<{ dateKey: string; name: string }> {
  return Array.from(holidayNames.entries())
    .filter(([dateKey]) => dateKey >= fromDateKey)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([dateKey, name]) => ({ dateKey, name }));
}

/** Свята всередині діапазону — щоб пояснити, чому дні не списались. */
export function holidaysInRange(
  holidayNames: Map<string, string>,
  startKey: string,
  endKey: string
): Array<{ dateKey: string; name: string }> {
  if (!startKey || !endKey || endKey < startKey) return [];
  return Array.from(holidayNames.entries())
    .filter(([dateKey]) => dateKey >= startKey && dateKey <= endKey)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, name]) => ({ dateKey, name }));
}

/**
 * Баланси команди за рік. Скільки рядків повернеться — вирішує БД:
 * звичайний співробітник отримає лише свій, owner/CEO — усі.
 *
 * `pending` рахується на клієнті з переданих записів: у БД квоту списують
 * тільки погоджені, але людині треба бачити, що запит уже «з'їсть» дні.
 */
export async function loadAbsenceBalances(params: {
  year: number;
  pendingAbsences?: TeamAbsence[];
  exceptions?: Map<string, boolean>;
}): Promise<Map<string, AbsenceBalance>> {
  const { data, error } = await supabase
    .schema("tosho")
    .rpc("team_absence_balances", { p_year: params.year });

  if (error) throw error;

  const balances = new Map<string, AbsenceBalance>();
  (data ?? []).forEach((row) => {
    balances.set(row.user_id, {
      userId: row.user_id,
      vacation: {
        quota: row.vacation_quota,
        used: row.vacation_used,
        pending: 0,
        remaining: Math.max(0, row.vacation_quota - row.vacation_used),
      },
      day_off: {
        quota: row.day_off_quota,
        used: row.day_off_used,
        pending: 0,
        remaining: Math.max(0, row.day_off_quota - row.day_off_used),
      },
      sick_leave: {
        quota: row.sick_quota,
        used: row.sick_used,
        pending: 0,
        remaining: Math.max(0, row.sick_quota - row.sick_used),
      },
    });
  });

  (params.pendingAbsences ?? []).forEach((absence) => {
    if (absence.status !== "pending" || !isQuotaAbsenceKind(absence.kind)) return;
    const balance = balances.get(absence.userId);
    if (!balance) return; // чужий баланс нам не віддали — і не треба
    // Одиниця залежить від типу: відпустка календарними, решта робочими.
    balance[absence.kind].pending += countQuotaDaysInYear(
      absence.kind,
      absence,
      params.year,
      params.exceptions
    );
  });

  return balances;
}

/** Явно задані квоти за рік. Кого немає в списку — той на дефолтах. */
export async function listAbsenceQuotas(params: {
  workspaceId: string;
  year: number;
}): Promise<AbsenceQuotaRow[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absence_quotas")
    .select("user_id,year,vacation_days,day_off_days,sick_days")
    .eq("workspace_id", params.workspaceId)
    .eq("year", params.year);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    year: row.year,
    vacationDays: row.vacation_days,
    dayOffDays: row.day_off_days,
    sickDays: row.sick_days,
  }));
}

/** Записати квоти людині на рік. Owner/CEO only (гейт — RLS). */
export async function saveAbsenceQuota(params: {
  workspaceId: string;
  userId: string;
  year: number;
  vacationDays: number;
  dayOffDays: number;
  sickDays: number;
  updatedBy: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("team_absence_quotas")
    .upsert(
      {
        workspace_id: params.workspaceId,
        user_id: params.userId,
        year: params.year,
        vacation_days: params.vacationDays,
        day_off_days: params.dayOffDays,
        sick_days: params.sickDays,
        updated_by: params.updatedBy,
      },
      { onConflict: "workspace_id,user_id,year" }
    );

  if (error) throw error;
}
