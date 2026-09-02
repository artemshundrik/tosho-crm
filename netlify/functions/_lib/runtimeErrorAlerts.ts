import {
  groupRuntimeErrors,
  runtimeErrorSignature,
  type RuntimeErrorGroup,
  type RuntimeErrorLike,
} from "../../../src/lib/runtimeErrorSignature";
import {
  findReleaseBefore,
  formatReleaseAttribution,
  type ReleaseLike,
} from "../../../src/lib/releaseAttribution";

/**
 * Що саме вважати приводом написати в Telegram.
 *
 * Журнал помилок збирався з березня й накопичив 1274 записи, на які ніхто
 * жодного разу не подивився. Вкладка в /dev/health це полагодила лише
 * наполовину: щоб її відкрити, треба спершу здогадатись, що там щось є.
 *
 * Правило одне й просте: пишемо про ПЕРШУ появу помилки. Не про кожне
 * падіння, не про відомі — інакше повторюється історія системних алертів,
 * де сигнал, що горить постійно, перестають читати.
 *
 * Другий привід — коли відома помилка раптом зачепила багато людей: одна
 * людина з дивною вкладкою це не подія, четверо за годину — подія.
 */

/** Скільки людей за вікно робить відому помилку вартою окремої згадки. */
export const MASS_PEOPLE_THRESHOLD = 3;

/** Скільки помилок показуємо в повідомленні, щоб воно лишалось читабельним. */
const MAX_LISTED = 5;

export type RuntimeErrorAlert = {
  kind: "new" | "mass";
  group: RuntimeErrorGroup;
};

export type BuildAlertsInput = {
  /** Записи за вікно спостереження (зазвичай остання година з запасом). */
  recent: RuntimeErrorLike[];
  /**
   * Сигнатури, що вже траплялись РАНІШЕ за вікно. Саме вони відрізняють
   * «нову помилку» від «тієї самої, що й учора».
   */
  knownSignatures: Iterable<string>;
};

export function buildRuntimeErrorAlerts({ recent, knownSignatures }: BuildAlertsInput): RuntimeErrorAlert[] {
  const known = new Set(knownSignatures);
  const groups = groupRuntimeErrors(recent);
  const alerts: RuntimeErrorAlert[] = [];

  for (const group of groups) {
    if (!known.has(group.signature)) {
      alerts.push({ kind: "new", group });
      continue;
    }
    if (group.people.length >= MASS_PEOPLE_THRESHOLD) {
      alerts.push({ kind: "mass", group });
    }
  }

  // Нові — першими: вони вимагають дії, масові радше вимагають уваги.
  return alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "new" ? -1 : 1;
    return b.group.count - a.group.count;
  });
}

/**
 * Відбиток набору для дедупу. Склад важливий, порядок — ні: якщо за годину
 * нічого не змінилось, повторно не пишемо.
 */
export function alertsFingerprint(alerts: RuntimeErrorAlert[]): string {
  return alerts
    .map((alert) => `${alert.kind}:${alert.group.signature}`)
    .sort()
    .join("|");
}

/** Сигнатури з довільного набору рядків — для «що вже траплялось раніше». */
export function signaturesOf(rows: RuntimeErrorLike[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const message = typeof metadata.message === "string" ? metadata.message.trim() : "";
    out.add(runtimeErrorSignature(message || "Без повідомлення"));
  }
  return out;
}

/**
 * Реліз поруч дописується лише до НОВИХ помилок і лише коли їх небагато.
 *
 * У «масових» перша поява була давно, і найближче викочування до неї нічого не
 * пояснює. А в довгому списку рядок на кожен пункт перетворив би повідомлення
 * на полотно — тож коли нових більше за одну, реліз показуємо тільки в тих,
 * що вміщаються в перелік.
 */
export function formatRuntimeErrorAlert(
  alerts: RuntimeErrorAlert[],
  options: {
    appUrl: string;
    escape: (value: string) => string;
    /** Релізи за останню добу. Порожньо — рядок про реліз просто не з'явиться. */
    releases?: ReleaseLike[];
  }
): string {
  const { appUrl, escape } = options;
  const releases = options.releases ?? [];
  const newOnes = alerts.filter((a) => a.kind === "new");
  const mass = alerts.filter((a) => a.kind === "mass");

  const title =
    newOnes.length > 0
      ? newOnes.length === 1
        ? "<b>🐞 Нова помилка в браузері</b>"
        : `<b>🐞 Нові помилки в браузері: ${newOnes.length}</b>`
      : "<b>🐞 Помилка зачепила кількох людей</b>";

  const lines: string[] = [title, ""];

  for (const alert of alerts.slice(0, MAX_LISTED)) {
    const { group } = alert;
    lines.push(`• ${escape(group.message.slice(0, 160))}`);
    const facts: string[] = [];
    facts.push(group.count === 1 ? "1 раз" : `${group.count} разів`);
    if (group.people.length > 0) facts.push(group.people.slice(0, 3).join(", "));
    if (group.routes.length > 0) facts.push(group.routes.slice(0, 2).join(", "));
    lines.push(`  ${escape(facts.join(" · "))}`);

    // Збіг у часі не робить реліз причиною — формулювання каже «почалось
    // після», а не «через». Це привід глянути діф першим, не вирок.
    if (alert.kind === "new" && releases.length > 0) {
      const attributed = findReleaseBefore(group.firstAt, releases);
      lines.push(`  ${escape(formatReleaseAttribution(attributed))}`);
    }
  }

  const hidden = alerts.length - MAX_LISTED;
  if (hidden > 0) lines.push("", `…і ще ${hidden}`);
  if (mass.length > 0 && newOnes.length > 0) {
    lines.push("", `Із них уже відомих, але масових: ${mass.length}`);
  }

  lines.push("", `${appUrl}/dev/health`);
  return lines.join("\n");
}
