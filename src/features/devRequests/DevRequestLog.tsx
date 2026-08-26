import { Send } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { themeLook } from "./themeRegistry";
import { KIND_ICONS, KIND_TONE, type DevRequest, type RequestKind } from "./types";

/**
 * «Щоденник» — усе, що поїхало в прод, за днями.
 *
 * НАВІЩО ОКРЕМИЙ ВИГЛЯД. Замір 26.08.2026: 70 карток зі 103 викочені того ж
 * дня, коли заведені, і 59 закрились одним комітом. Дві третини дошки — не
 * черга, а слід зробленого: він стояв колонкою «Викочено» поруч із тим, що
 * справді треба вирішувати, і забирав увагу щодня, хоч рішень не потребує. Тут
 * він читається як журнал, а дошка худне на сотню карток.
 *
 * ЧОМУ ЦЕ НЕ ХОВАЄ ІСТОРІЮ. Сюди потрапляє лише статус `released`, а він
 * ставиться фактом деплою й лише тоді, коли в чекліста не лишилось відкритих
 * пунктів (гейт у scripts/lib/devRequestReleases.mjs). Картка з живим хвостом
 * лишається на дошці в «Готово локально» з підписом «частина в проді», скільки
 * б її шматків не поїхало. Перевірено запитом до прода 27.08.2026: викочених із
 * незакритим чеклістом — нуль.
 *
 * КНОПКА «У ЧАТ» — головна причина, чому вигляд узагалі з'явився. Малювання
 * картки для Telegram було написане давно (releaseCardImage.ts), але дістатись
 * до нього можна було лише через меню «⋯» на викоченій картці: спершу згадай,
 * що воно є, потім знайди картку серед ста трьох. Тут воно на кожному рядку.
 */

/** Київський день викочування — за ним групуємо і його ж підписуємо. */
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kiev",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_LABEL = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kiev",
  day: "numeric",
  month: "long",
});

type LogDay = { key: string; label: string; requests: DevRequest[] };

/**
 * Що саме зробили за день — тими словами, якими це побачать у чаті.
 *
 * Це ті самі підписи, що RELEASE_BADGE_LABELS у картці для Telegram
 * (releaseCardImage.ts): «виправлено» для поломки, «покращено» для незручності,
 * «додано» для нової можливості. Один словник на два місця тримати не можна —
 * там вони з великої літери й у називному, тут малою й у переліку, — але
 * СЛОВА мають збігатись, інакше день у щоденнику й картка в чаті розкажуть про
 * ту саму роботу по-різному.
 */
const DAY_SUMMARY_LABELS: Record<RequestKind, string> = {
  bug: "виправлено",
  friction: "покращено",
  feature: "додано",
};

function daySummary(requests: DevRequest[]): string {
  const counts = new Map<RequestKind, number>();
  for (const request of requests) {
    counts.set(request.kind, (counts.get(request.kind) ?? 0) + 1);
  }
  // Порядок сталий — за словником, а не за появою: інакше підпис дня
  // переставлявся б від дня до дня без причини.
  return (Object.keys(DAY_SUMMARY_LABELS) as RequestKind[])
    .filter((kind) => counts.has(kind))
    .map((kind) => `${counts.get(kind)} ${DAY_SUMMARY_LABELS[kind]}`)
    .join(" · ");
}

/**
 * Розкладка по днях.
 *
 * Дата береться з `releasedAt`, а не з `createdAt`: питання цього вигляду —
 * «що поїхало в прод і коли», і день заведення на нього не відповідає. Картка
 * без дати релізу сюди не потрапляє взагалі — краще не показати рядок, ніж
 * поставити його під вигаданим числом.
 */
export function groupByReleaseDay(requests: DevRequest[]): LogDay[] {
  const days = new Map<string, LogDay>();

  for (const request of requests) {
    const raw = request.releasedAt;
    if (!raw) continue;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) continue;

    const key = DAY_KEY.format(parsed);
    const day = days.get(key);
    if (day) {
      day.requests.push(request);
    } else {
      days.set(key, { key, label: DAY_LABEL.format(parsed), requests: [request] });
    }
  }

  // Дні — найновіші вгорі; усередині дня теж, щоб останнє викочене було першим
  // рядком, який бачить око. Номер як другий ключ тримає порядок сталим, коли
  // кілька карток поїхали одним деплоєм і час у них до секунди однаковий.
  return [...days.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((day) => ({
      ...day,
      requests: [...day.requests].sort((a, b) => {
        const diff = new Date(b.releasedAt ?? 0).getTime() - new Date(a.releasedAt ?? 0).getTime();
        return diff !== 0 ? diff : b.number - a.number;
      }),
    }));
}

export function DevRequestLog({
  requests,
  onSelect,
  onCopyCard,
}: {
  requests: DevRequest[];
  onSelect: (request: DevRequest) => void;
  /** Відкрити вікно картки для чату. Немає — кнопки теж немає. */
  onCopyCard?: (request: DevRequest) => void;
}) {
  const days = useMemo(() => groupByReleaseDay(requests), [requests]);

  if (days.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Тут з'являтиметься все, що поїхало в прод. Статус «Викочено» ставить деплой, руками його не проставляють.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.key} aria-label={`Викочено ${day.label}`}>
          <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {day.label}
            <span className="font-mono tabular-nums text-muted-foreground/70">
              {day.requests.length}
            </span>
            {/* Підсумок дня — щоб «що я зробив у вівторок» читалось із заголовка,
                не перебираючи рядки. Регістр нижній: це фраза, а не мітка. */}
            <span className="normal-case tracking-normal text-muted-foreground/70">
              {daySummary(day.requests)}
            </span>
          </h3>

          <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {day.requests.map((request) => {
              const look = themeLook(request.theme);
              const ThemeIcon = look?.icon;
              const KindIcon = KIND_ICONS[request.kind];
              return (
                <li key={request.id}>
                  {/*
                   * Рядок — кнопка, а не div з onClick: інакше в нього не
                   * потрапити з клавіатури, і жодного стану фокуса не буде.
                   */}
                  <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <button
                      type="button"
                      onClick={() => onSelect(request)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    >
                      {/* Дві іконки, і кожна про своє: ЩО це була за робота
                          (тип) і ДО ЧОГО вона належала (напрям). Тип є завжди,
                          напрям — ні, тож місце під нього тримаємо порожнім, аби
                          назви не стрибали вліво-вправо від рядка до рядка. */}
                      <KindIcon
                        className={cn("h-4 w-4 shrink-0", toneTextClass[KIND_TONE[request.kind]])}
                        aria-hidden
                      />
                      {ThemeIcon ? (
                        <ThemeIcon
                          className={cn("h-4 w-4 shrink-0", look ? toneTextClass[look.tone] : null)}
                          aria-hidden
                        />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="truncate text-sm font-medium">{request.title}</span>
                    </button>

                    <HoverCopyText
                      value={request.label}
                      textClassName="hidden font-mono text-2xs font-semibold tracking-wide text-muted-foreground sm:inline"
                      successMessage="Номер запиту скопійовано"
                      copyLabel="Скопіювати номер запиту"
                    />

                    {onCopyCard ? (
                      /*
                       * Кнопка ЗАВЖДИ в розмітці, а не з'являється на наведенні:
                       * на телефоні наведення не існує, а з клавіатури до
                       * прихованої кнопки не дійти. Тому вона просто тихіша,
                       * поки на рядок не навели й не сфокусувались.
                       */
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onCopyCard(request)}
                        aria-label={`Зробити картку для чату: ${request.title}`}
                        className="shrink-0 gap-1.5 opacity-70 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">У чат</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
