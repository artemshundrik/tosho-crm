import type { SupabaseClient } from "@supabase/supabase-js";
import type { InlineKeyboard } from "./_telegram";
import { kyivDateKey } from "./_teamAssistant";
import {
  ABSENCE_KIND_LABELS,
  formatAbsenceShort,
  humanizeAbsenceInsertError,
  notifySubmittedAbsence,
  type SubmittedAbsenceRow,
} from "./_lib/absenceSubmit";

// Оформлення відсутності прямо в Telegram (docs/TELEGRAM_NOTIFICATIONS_DESIGN.md).
//
// Навіщо: хвора людина лежить із телефоном, а не сидить у CRM — «хворію до
// п'ятниці» боту і все. Весь флоу живе в ОДНОМУ повідомленні (кнопки редагують
// його, а не плодять стрічку), стану на сервері немає: усе потрібне їде в
// callback_data.
//
// Запис іде через tosho.bot_submit_absence — RPC, що перевтілюється в
// користувача, тож RLS-межі дат і річна квота лікарняних працюють точно як у
// CRM (scripts/team-absences-bot-rpc.sql). Сповіщення — тим самим кодом, що й
// HTTP-подання (_lib/absenceSubmit.ts).

export type AbsenceBotKind = "vacation" | "day_off" | "sick_leave" | "wfh";

const BOT_KINDS = new Set<AbsenceBotKind>(["vacation", "day_off", "sick_leave", "wfh"]);

const KIND_EMOJI: Record<AbsenceBotKind, string> = {
  vacation: "🏖",
  day_off: "🌤",
  sick_leave: "🤒",
  wfh: "🏠",
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isAbsenceBotKind(value: string): value is AbsenceBotKind {
  return BOT_KINDS.has(value as AbsenceBotKind);
}

function label(kind: AbsenceBotKind) {
  return ABSENCE_KIND_LABELS[kind] ?? "Відсутність";
}

function rangeLabel(start: string, end: string) {
  return start === end ? formatAbsenceShort(start) : `${formatAbsenceShort(start)} – ${formatAbsenceShort(end)}`;
}

function daysLabel(days: number | null, kind: AbsenceBotKind) {
  if (typeof days !== "number") return null;
  return `${days} ${kind === "vacation" ? "кал" : "роб"}. дн.`;
}

/* ------------------------------- Екрани ------------------------------- */

export function kindMenuScreen(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      "📝 <b>Оформити відсутність</b>",
      "",
      "🤒 Лікарняний — фіксується одразу, без погодження",
      "🏖 Відпустка · 🌤 Day-off · 🏠 З дому — заявка на рішення CEO",
      "",
      "Можна одразу текстом:",
      "<code>лікарняний 05.08–08.08</code>",
      "<code>з дому 06.08</code>",
      "<code>відпустка 12.08–19.08</code>",
    ].join("\n"),
    keyboard: [
      [
        { text: "🤒 Лікарняний", callback_data: "abs:k:sick_leave" },
        { text: "🌤 Day-off", callback_data: "abs:k:day_off" },
      ],
      [
        { text: "🏖 Відпустка", callback_data: "abs:k:vacation" },
        { text: "🏠 З дому", callback_data: "abs:k:wfh" },
      ],
      [{ text: "🏝 Хто відсутній сьогодні", callback_data: "qa:who_is_absent" }],
    ],
  };
}

/**
 * Пресети дат під тип. Специфікація їде в callback_data («0:0» — сьогодні,
 * «0:eow» — до неділі включно): стану на сервері немає взагалі.
 */
export function presetMenuScreen(kind: AbsenceBotKind): { text: string; keyboard: InlineKeyboard } {
  const back = { text: "← Назад", callback_data: "abs:menu" };

  if (kind === "sick_leave") {
    return {
      text: [
        "🤒 <b>Лікарняний</b> — які дні?",
        "",
        "Фіксується одразу, команда отримає сповіщення.",
        "Інші дати — напиши: <code>лікарняний 05.08–08.08</code>",
      ].join("\n"),
      keyboard: [
        [
          { text: "Сьогодні", callback_data: "abs:s:sick_leave:0:0" },
          { text: "Сьогодні–завтра", callback_data: "abs:s:sick_leave:0:1" },
        ],
        [
          { text: "До кінця тижня", callback_data: "abs:s:sick_leave:0:eow" },
          { text: "Вчора–сьогодні", callback_data: "abs:s:sick_leave:-1:0" },
        ],
        [back],
      ],
    };
  }

  if (kind === "wfh") {
    return {
      text: [
        "🏠 <b>З дому</b> — які дні?",
        "",
        "Квоту не списує й норму не ріже. Заявка піде на погодження CEO.",
        "Інші дати — напиши: <code>з дому 06.08–08.08</code>",
      ].join("\n"),
      keyboard: [
        [
          { text: "Сьогодні", callback_data: "abs:s:wfh:0:0" },
          { text: "Завтра", callback_data: "abs:s:wfh:1:1" },
        ],
        [
          { text: "До кінця тижня", callback_data: "abs:s:wfh:0:eow" },
        ],
        [back],
      ],
    };
  }

  if (kind === "day_off") {
    return {
      text: [
        "🌤 <b>Day-off</b> — який день?",
        "",
        "Заявка піде на погодження CEO.",
        "Інша дата — напиши: <code>day-off 15.08</code>",
      ].join("\n"),
      keyboard: [
        [
          { text: "Завтра", callback_data: "abs:s:day_off:1:1" },
          { text: "Післязавтра", callback_data: "abs:s:day_off:2:2" },
        ],
        [back],
      ],
    };
  }

  return {
    text: [
      "🏖 <b>Відпустка</b>",
      "",
      "Напиши діапазон текстом: <code>відпустка 12.08–19.08</code>",
      "Заявка піде на погодження CEO, рішення прийде сюди.",
    ].join("\n"),
    keyboard: [[back]],
  };
}

/** «0:eow» → конкретні дати за Києвом. null — специфікація не розпарсилась. */
export function presetRange(
  spec: { a: string; b: string },
  now: Date
): { start: string; end: string } | null {
  const parseOffset = (raw: string): number | "eow" | null => {
    if (raw === "eow") return "eow";
    const n = Number(raw);
    return Number.isInteger(n) && Math.abs(n) <= 31 ? n : null;
  };
  const a = parseOffset(spec.a);
  const b = parseOffset(spec.b);
  if (a === null || b === null || a === "eow") return null;

  const start = kyivDateKey(now, a);
  if (b === "eow") {
    // До неділі включно: хвороба не знає вихідних, а робочі дні квота й так
    // рахує сама — субота-неділя їй байдужі.
    const dow = new Date(`${kyivDateKey(now)}T12:00:00Z`).getUTCDay(); // 0 = неділя
    const toSunday = (7 - dow) % 7;
    return { start, end: kyivDateKey(now, toSunday) };
  }
  const end = kyivDateKey(now, b);
  return end < start ? null : { start, end };
}

export function confirmScreen(
  kind: AbsenceBotKind,
  start: string,
  end: string,
  businessDays: number | null,
  /** Власник: погоджувати нікому, запис зафіксується одразу. */
  instant = false
): { text: string; keyboard: InlineKeyboard } {
  const days = daysLabel(businessDays, kind);
  return {
    text: [
      `${KIND_EMOJI[kind]} <b>${label(kind)} · ${rangeLabel(start, end)}</b>` + (days ? ` · ${days}` : ""),
      "",
      kind === "sick_leave" || instant
        ? "Зафіксується одразу — команда отримає сповіщення."
        : "Заявка піде на погодження CEO — рішення прийде сюди.",
    ].join("\n"),
    keyboard: [
      [
        { text: "✅ Підтвердити", callback_data: `abs:c:${kind}:${start}:${end}` },
        { text: "✖️ Скасувати", callback_data: "abs:x" },
      ],
    ],
  };
}

/* --------------------------- Текстова форма --------------------------- */

const KIND_PATTERNS: Array<[RegExp, AbsenceBotKind]> = [
  [/^(лікарнян|хворі|болі|sick)/i, "sick_leave"],
  [/^(day[\s-]?off|дей[\s-]?оф|відгул)/i, "day_off"],
  [/^(відпустк|vacation)/i, "vacation"],
  [/^(з\s?дому|вдома|дистанційн|віддалено|remote|wfh)/i, "wfh"],
];

export type ParsedAbsenceText = {
  kind: AbsenceBotKind;
  /** null — тип упізнали, а дат немає: показуємо пресети цього типу. */
  start: string | null;
  end: string | null;
};

/**
 * «лікарняний 05.08–08.08», «хворію до 08.08», «day-off 15.08» → чернетка.
 *
 * Спрацьовує ЛИШЕ коли текст ПОЧИНАЄТЬСЯ з ключового слова: «хто у відпустці?»
 * має піти асистенту (who_is_absent), а не у форму подання.
 */
export function parseAbsenceText(raw: string, now: Date): ParsedAbsenceText | null {
  const text = raw.trim();
  const matched = KIND_PATTERNS.find(([pattern]) => pattern.test(text));
  if (!matched) return null;
  const kind = matched[1];

  const dateRe = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/g;
  const todayKey = kyivDateKey(now);
  const currentYear = Number(todayKey.slice(0, 4));

  const found: string[] = [];
  let firstIndex = -1;
  for (const m of text.matchAll(dateRe)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    let year = m[3] ? Number(m[3]) : currentYear;
    if (year < 100) year += 2000;
    let key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Без року «05.01» у грудні означає січень наступного — не торішній день.
    if (!m[3] && key < kyivDateKey(now, -45)) {
      key = `${year + 1}-${key.slice(5)}`;
    }
    if (firstIndex < 0) firstIndex = m.index ?? -1;
    found.push(key);
    if (found.length >= 2) break;
  }

  if (found.length === 0) {
    // Питання, а не подання: «лікарняний у Олени?» має піти асистенту.
    // Ознаки питання — знак питання або довга фраза без жодної дати.
    if (/\?/.test(text) || text.split(/\s+/).length > 3) return null;
    // «хворію» / «з дому» без дат — найчастіший кейс «сьогодні».
    if (kind === "sick_leave" || kind === "wfh") return { kind, start: todayKey, end: todayKey };
    return { kind, start: null, end: null };
  }

  if (found.length === 1) {
    // «до 08.08» — від сьогодні; просто дата — один день.
    const before = firstIndex >= 0 ? text.slice(0, firstIndex) : "";
    const openEnded = /(^|\s)до\s*$/i.test(before.trimEnd() + " ") || /\bдо\s*[\d]/i.test(text);
    const start = openEnded ? todayKey : found[0];
    const end = found[0];
    return end < start ? { kind, start: end, end: start } : { kind, start, end };
  }

  const [a, b] = found;
  return a <= b ? { kind, start: a, end: b } : { kind, start: b, end: a };
}

/* ------------------------------ Подання ------------------------------- */

/** Скільки днів квоти з'їсть діапазон — одиниця залежить від типу. */
export async function countQuotaDaysForUser(
  admin: SupabaseClient,
  workspaceId: string | null,
  kind: AbsenceBotKind,
  start: string,
  end: string
): Promise<number | null> {
  if (!workspaceId) return null;
  const { data } = await admin.schema("tosho").rpc("count_absence_quota_days", {
    _workspace: workspaceId,
    _kind: kind,
    _from: start,
    _to: end,
  });
  return typeof data === "number" ? data : null;
}

export type BotSubmitResult = { ok: boolean; text: string };

/**
 * Власне подання: RPC-перевтілення + ті самі сповіщення, що й у HTTP-шляху.
 * Відмови БД (квота, межі дат) повертаються людським текстом заявнику.
 */
export async function submitAbsenceFromBot(params: {
  admin: SupabaseClient;
  userId: string;
  kind: AbsenceBotKind;
  start: string;
  end: string;
}): Promise<BotSubmitResult> {
  const { admin, userId, kind, start, end } = params;

  if (!DATE_KEY.test(start) || !DATE_KEY.test(end) || end < start) {
    return { ok: false, text: "⚠️ Невірний діапазон дат — спробуй ще раз." };
  }

  const { data, error } = await admin.schema("tosho").rpc("bot_submit_absence", {
    p_user_id: userId,
    p_kind: kind,
    p_start: start,
    p_end: end,
    p_comment: null,
  });

  if (error || !data) {
    return {
      ok: false,
      text: `⚠️ Не вийшло: ${humanizeAbsenceInsertError(error ?? { message: null })}`,
    };
  }

  const absence = data as SubmittedAbsenceRow;
  const { businessDays, deferred } = await notifySubmittedAbsence(admin, {
    absence,
    comment: null,
    actorId: userId,
  });

  const days = daysLabel(businessDays, kind);
  const range = rangeLabel(absence.start_date, absence.end_date);

  if (absence.status === "approved") {
    return {
      ok: true,
      text: [
        `✅ <b>${label(kind)} зафіксовано</b> · ${range}` + (days ? ` · ${days}` : ""),
        "",
        // Уночі розсилку свідомо відкладено до ранку — кажемо це прямо, щоб
        // людина не думала, що сповіщення загубилось.
        deferred ? "Команда побачить зранку. Одужуй 💙" : "Команда отримала сповіщення. Одужуй 💙",
      ].join("\n"),
    };
  }
  return {
    ok: true,
    text: [
      `📨 <b>Заявку надіслано</b> · ${label(kind).toLowerCase()} ${range}` + (days ? ` · ${days}` : ""),
      "",
      deferred
        ? "CEO побачить її зранку — рішення прийде сюди."
        : "CEO отримає сповіщення — рішення прийде сюди.",
    ].join("\n"),
  };
}
