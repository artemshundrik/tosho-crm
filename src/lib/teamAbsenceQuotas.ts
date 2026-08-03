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
 * ПРИВАТНІСТЬ: залишки бачить сама людина + owner/SEO. Гейт стоїть у БД —
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
export async function loadWorkdayExceptions(params: {
  workspaceId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (exclusive)
}): Promise<Map<string, boolean>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("ua_workday_exceptions")
    .select("day,is_workday")
    .eq("workspace_id", params.workspaceId)
    .gte("day", params.from)
    .lt("day", params.to);

  if (error) throw error;

  const map = new Map<string, boolean>();
  (data ?? []).forEach((row) => {
    map.set(row.day, row.is_workday);
  });
  return map;
}

/**
 * Баланси команди за рік. Скільки рядків повернеться — вирішує БД:
 * звичайний співробітник отримає лише свій, owner/SEO — усі.
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

/** Записати квоти людині на рік. Owner/SEO only (гейт — RLS). */
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
