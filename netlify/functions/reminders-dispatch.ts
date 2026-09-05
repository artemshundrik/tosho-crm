// Один POST замість трьох: усі нагадування «за розкладом» в одній інвокації.
//
// НАВІЩО. Джоб `reminders-minute` будив три функції ТРЬОМА окремими
// net.http_post — і кожен з них Netlify рахував окремою інвокацією. При
// розкладі */5 це 288 тіків × 3 = 864 виклики на добу. Роботи в них при цьому
// майже немає: за тиждень усі три разом доставили вісім сповіщень (нагадування
// заводить людина руками, і більшість тіків не знаходить нічого). Тобто ми
// платили за три холодні старти щоп'ять хвилин, щоб тричі на тиждень когось
// штовхнути.
//
// Диспетчер викликає ті самі обробники ВСЕРЕДИНІ одного процесу. Логіка
// нагадувань не змінилась ні на рядок — змінилось лише те, що за неї тепер
// платимо один раз замість трьох: 864 → 288 викликів на добу.
//
// ЧОМУ allSettled, А НЕ all. Три окремі POST-и мали одну неочевидну чесноту:
// падіння одного не чіпало двох інших. `Promise.all` цю властивість забрав би —
// перша ж помилка вбила б решту. allSettled її повертає: кожен обробник живе
// своїм життям, а зведення нижче показує, хто саме впав.
//
// ЧОМУ ЦЕ НЕ ДІРКА В АВТЕНТИФІКАЦІЇ. Подія передається обробникам як є, тож
// кожен з них ще раз проганяє свій assertCronAuthorized. Гейт спрацьовує двічі,
// а не жодного разу: без правильного x-cron-key диспетчер відповідає 401 і до
// обробників не доходить.
import { assertCronAuthorized } from "./_cronAuth";
import { handler as contractorReminders } from "./contractor-reminders";
import { handler as customerLeadReminders } from "./customer-lead-reminders";
import { handler as quoteDeadlineReminders } from "./quote-deadline-reminders";

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

type JobResult = {
  job: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
};

const JOBS: ReadonlyArray<readonly [string, (event: HttpEvent) => Promise<unknown>]> = [
  ["customer-lead-reminders", customerLeadReminders],
  ["quote-deadline-reminders", quoteDeadlineReminders],
  ["contractor-reminders", contractorReminders],
];

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

/**
 * Обробник повертає {statusCode, body} — те саме, що віддав би Netlify.
 * Нас цікавить лише, чи не 2xx: обробник, який мовчки повернув 500, сьогодні
 * ніде не видно (pg_cron рахує джоб успішним, щойно net.http_post поставив
 * запит у чергу), тож витягуємо код сюди, у зведення.
 */
function readStatus(value: unknown): number | undefined {
  if (typeof value === "object" && value && "statusCode" in value) {
    const status = (value as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") return status;
  }
  return undefined;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const settled = await Promise.allSettled(JOBS.map(([, run]) => run(event)));

  const results: JobResult[] = settled.map((outcome, index) => {
    const job = JOBS[index][0];
    if (outcome.status === "rejected") {
      return { job, ok: false, error: errorMessage(outcome.reason) };
    }
    const statusCode = readStatus(outcome.value);
    return {
      job,
      ok: statusCode === undefined || (statusCode >= 200 && statusCode < 300),
      statusCode,
    };
  });

  const failed = results.filter((result) => !result.ok);

  // 200 навіть коли частина впала: pg_cron однаково не дивиться на код
  // відповіді, а перетворювати часткову невдачу на суцільну 500 означало б
  // приховати, що двоє з трьох відпрацювали. Хто саме впав — видно в results.
  return jsonResponse(200, {
    success: failed.length === 0,
    ran: results.length,
    failed: failed.length,
    results,
  });
};
