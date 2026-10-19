import { logRuntimeError } from "@/lib/runtimeErrorLogger";

/** Довше за це документ готується «повільно» — і про це лишається запис у журналі. */
export const SLOW_DOCUMENT_MS = 5_000;

const escapeText = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

/**
 * Вікно документа замовлення. Відкривається одразу в кліку, ще до будь-яких
 * запитів: браузер пускає спливне вікно лише кілька секунд після натискання.
 * Раніше CRM спершу чекала відмінювання ПІБ підписанта (холодна функція — до
 * 10 с) і лише тоді відкривала вікно, тож його блокувало або воно з'являлось
 * невідомо коли. Тепер вікно одразу каже «Готуємо…», а кожен етап засікається:
 * повільне відкриття потрапляє в журнал помилок з розкладкою за етапами.
 */
export function openDocumentWindow(label: string) {
  const startedAt = performance.now();
  let stageStartedAt = startedAt;
  const stages: Record<string, number> = {};
  const popup = window.open("", "_blank");
  if (popup) {
    try {
      popup.document.write(
        `<!doctype html><meta charset="utf-8"><title>${escapeText(label)}</title>` +
          `<p style="font:14px system-ui,sans-serif;color:#6b7280;padding:32px">Готуємо: ${escapeText(label)}…</p>`
      );
    } catch {
      // Розширення буває забороняє писати у вікно — тоді покажемо документ через blob у show().
    }
  }

  const mark = (stage: string) => {
    const now = performance.now();
    stages[stage] = Math.round(now - stageStartedAt);
    stageStartedAt = now;
  };

  const show = (html: string, context: { teamId: string | null | undefined; orderId: string }) => {
    if (!popup || popup.closed) return;
    mark("показ");
    let wrote = false;
    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      wrote = true;
    } catch {
      // Fallback for browsers/extensions that prevent document.write into a popup.
    }
    if (!wrote) {
      const objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }

    const totalMs = Math.round(performance.now() - startedAt);
    if (totalMs < SLOW_DOCUMENT_MS) return;
    const breakdown = Object.entries(stages)
      .map(([stage, ms]) => `${stage} ${(ms / 1000).toFixed(1)} с`)
      .join(", ");
    console.warn(`[документ] ${label}: ${(totalMs / 1000).toFixed(1)} с (${breakdown})`);
    void logRuntimeError({
      teamId: context.teamId,
      source: "slow_document",
      title: `${label} відкривався ${(totalMs / 1000).toFixed(1)} с: ${breakdown}`,
      href: `/orders/production/${context.orderId}`,
      metadata: { document: label, total_ms: totalMs, stages },
    }).catch(() => undefined);
  };

  return { blocked: !popup, mark, show, cancel: () => popup?.close() };
}
