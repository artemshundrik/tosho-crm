import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { checklistProgress, type ChecklistItem } from "./checklist";

/**
 * Прогрес пунктів на КАРТЦІ — смуга з трьох кольорів плюс «зависло N днів».
 *
 * ЧОМУ ТРИ КОЛЬОРИ, А НЕ ОДНЕ ЧИСЛО. «3 з 9» однаково виглядає і тоді, коли
 * решта просто не почата, і тоді, коли половина тижнями чекає чужої відповіді.
 * Це різні стани роботи: у першому випадку бракує часу, у другому — людини, і
 * плутати їх означає щоразу відкривати картку, щоб зрозуміти, чому вона стоїть.
 *
 * «Зависло» рахується від найстарішого очікування само (checklistProgress) —
 * саме тому, що памʼятати про це нікому: задача зупиняється тихо, і помічають
 * це тоді, коли вже ніяково нагадувати.
 */
export function ChecklistBar({
  items,
  className,
}: {
  items: ChecklistItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const progress = checklistProgress(items);
  const share = (count: number) => `${(count / progress.total) * 100}%`;

  const stuckLabel = progress.stuckDays > 0
    ? progress.stuckWho
      ? `чекає ${progress.stuckWho} · ${progress.stuckDays} дн`
      : `чекає ${progress.stuckDays} дн`
    : null;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="inline-flex h-1.5 w-[70px] shrink-0 overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`Пунктів: ${progress.done} готово, ${progress.doing} в роботі, ${progress.waiting} чекає, ${progress.todo} не почато`}
      >
        <i className="block h-full bg-success-solid" style={{ width: share(progress.done) }} />
        {/* У тону `info` немає варіанта `solid` — беремо foreground. На смужці
            без тексту він читається так само, а заводити новий токен заради
            трьох пікселів було б дорожче, ніж сам ефект. */}
        <i className="block h-full bg-info-foreground" style={{ width: share(progress.doing) }} />
        <i className="block h-full bg-warning-solid" style={{ width: share(progress.waiting) }} />
      </span>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
      {stuckLabel ? (
        // Підпис лише про очікування: скільки зроблено, вже видно зі смуги, а
        // повторення тим самим кеглем поруч перетворює обидва числа на шум.
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning-foreground">
          <Clock className="h-3 w-3" />
          {stuckLabel}
        </span>
      ) : null}
    </span>
  );
}
