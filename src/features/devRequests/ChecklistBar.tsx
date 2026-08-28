import { Clock, Rocket } from "lucide-react";

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
  partlyShipped = false,
  papercut = false,
  className,
}: {
  items: ChecklistItem[];
  /** Код уже поїхав, а хвіст лишився — див. isPartlyShipped. */
  partlyShipped?: boolean;
  /**
   * Накопичувач дрібниць. У нього інше питання: не «скільки зроблено», а
   * «скільки лишилось розгребти» — полиця напряму не буває доробленою.
   *
   * Через це дошка й «Черга» показували різні числа про ту саму картку: тут
   * «1/1», там «0». Обидва були праві й разом читались як суперечність.
   */
  papercut?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;
  const progress = checklistProgress(items);

  /*
   * Накопичувач, у якому нема чого розгрібати, не показує НІЧОГО.
   *
   * Спершу тут стояв підпис «полиця порожня», але він муляв рівно так само, як
   * і нуль: око чіпляється за напис, а сказати йому нічого — робити тут не
   * треба. Картка лишається як полиця напряму, мовчазна доти, доки в неї не
   * покладуть першу дрібницю (рішення Артема 28.08.2026).
   */
  if (papercut && progress.total - progress.done === 0) return null;
  const share = (count: number) => `${(count / progress.total) * 100}%`;

  const stuckLabel = progress.stuckDays > 0
    ? progress.stuckWho
      ? `чекає ${progress.stuckWho} · ${progress.stuckDays} дн`
      : `чекає ${progress.stuckDays} дн`
    : null;

  return (
    // flex-wrap: на вузькій колонці смуга, «частина в проді» й «чекає N дн» в
    // один рядок не влазять — без переносу останній чіп просто зрізається краєм
    // картки, і зникає рівно те, заради чого підпис і малюють.
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
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
      <span
        className="shrink-0 text-2xs tabular-nums text-muted-foreground"
        title={
          papercut
            ? `Лишилось розгребти: ${progress.total - progress.done} з ${progress.total}`
            : undefined
        }
      >
        {papercut
          ? `лишилось ${progress.total - progress.done}`
          : `${progress.done}/${progress.total}`}
      </span>
      {partlyShipped ? (
        // Пояснює, чому картка стоїть у «Готово локально» замість «Викочено»:
        // деплой її не забрав СВІДОМО, бо хвіст відкритий. Без цього підпису
        // вона читається як така, що от-от поїде.
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-tone-soft px-2 py-0.5 text-2xs font-medium text-accent-tone-foreground">
          <Rocket className="h-3 w-3" />
          частина в проді
        </span>
      ) : null}
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
