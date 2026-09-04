import { cn } from "@/lib/utils";

import type { DesignComposerImprint } from "./designComposerImprint";

/**
 * Нанесення пігулками «метод · місце» (REQ-157, варіант А з чотирьох на канві).
 *
 * ЧОМУ САМЕ ПІГУЛКИ Й САМЕ ТУТ. Пари стають на місце, яке звільнила плашка
 * «типу задачі» в рядку назви: картка не росте, а піксели дістаються тому, що
 * дизайнеру справді треба знати — чим і де друкуємо. Три інші варіанти (окрема
 * смуга під шапкою, плитки над ТЗ, нанесення на пігулці товару) відхилено:
 * перші два додають ярус на КОЖНІЙ картці заради 15 % позицій із двома парами,
 * третій відправляє дизайнера шукати «де друкувати» вище картки задачі.
 *
 * КАПСУ ТУТ НЕМАЄ НАВМИСНО. На вкладці «Товари» нанесення показувалось плашкою
 * «ВИШИВКА · Місце не вказано · 100×30 мм», і саме її прибрали (REQ-175#p36):
 * український текст капсом на 10–11 px читається найважче з усього на сторінці.
 *
 * РОЗМІР ЇДЕ ХВОСТОМ ДО МІСЦЯ, а не окремою пігулкою: у нових позиціях його
 * взагалі не питають (він у ТЗ), а в давніх він є, і мовчки його втратити не
 * можна. Хвіст обрізається, повний рядок лишається в `title`.
 */
export function QuoteImprintBadges({
  imprint,
  className,
}: {
  imprint: DesignComposerImprint[];
  className?: string;
}) {
  return (
    <>
      {imprint.map((line, index) => {
        const place = line.place?.trim() || null;
        return (
          <span
            key={`${line.method}-${index}`}
            title={[line.method, place ?? "місце не вказане", line.size].filter(Boolean).join(" · ")}
            className={cn(
              "inline-flex h-[22px] max-w-[240px] shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-2xs",
              className
            )}
          >
            <span className="font-semibold text-foreground">{line.method}</span>
            <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-border" aria-hidden />
            {/*
              МІСЦЕ СТОЇТЬ ЗАВЖДИ, навіть коли його немає. Перший заїзд показував
              лише те, що є, — і на позиції без місця, але з розміром бейдж читався
              як «Термотрансфер · 100×100 мм», тобто розмір видавав себе за місце
              (побачено в прев'ю). Тепер незаповнене місце питає, а розмір іде за ним.
            */}
            <span className="truncate">
              <span className={place ? "text-muted-foreground" : "text-muted-foreground/70"}>
                {place ?? "місце?"}
              </span>
              {line.size ? <span className="text-muted-foreground"> · {line.size}</span> : null}
            </span>
          </span>
        );
      })}
    </>
  );
}
