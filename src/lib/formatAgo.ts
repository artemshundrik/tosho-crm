import { pluralWordUk } from "@/lib/lastSeen";

/**
 * «2 години тому», «5 днів тому», «26 червня». Порожньо або не дата — null.
 *
 * Досі жило в IntegrationCard; сторінці «Постачальники» потрібне те саме, і
 * друга копія розійшлась би з першою на першій же правці відмінків.
 * `now` приймається параметром, щоб тести не залежали від годинника.
 */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} ${pluralWordUk(minutes, "хвилину", "хвилини", "хвилин")} тому`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${pluralWordUk(hours, "годину", "години", "годин")} тому`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${pluralWordUk(days, "день", "дні", "днів")} тому`;
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}
