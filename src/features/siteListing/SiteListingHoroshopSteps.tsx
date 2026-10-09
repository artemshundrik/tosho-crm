import * as React from "react";

import { ExternalLink, Info } from "@/components/icons/appIcons";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";

/**
 * Що натиснути в Хорошопі з файлом імпорту (REQ-311#p19). Одне на результат
 * «Зібрати файл» і вікно «Як це працює».
 *
 * Рядок — лише дія, назви кнопок Хорошопа — плашками. Подробиці з пробної
 * пачки — на наведенні: кожна там коштувала окремого кола (колонки фото
 * Хорошоп сам не ставить ніколи; «Відсутні товари» з будь-чим, крім «Нічого
 * не робити», зачепить увесь каталог), але читати їх щоразу — полотно.
 */

/**
 * Те саме для контент-менеджерки, у якої CRM може не бути: окрема сторінка
 * без входу, зі схемами екранів Хорошопа (public/guides/horoshop-import.html).
 */
export const HOROSHOP_GUIDE_PATH = "/guides/horoshop-import.html";

export function HoroshopGuideLink({ className }: { className?: string }) {
  return (
    <a
      href={HOROSHOP_GUIDE_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline",
        className
      )}
    >
      Для контент-менеджера
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

const Ui = ({ children }: { children: React.ReactNode }) => (
  <span className="whitespace-nowrap rounded bg-muted px-1 py-px font-medium text-foreground">{children}</span>
);

const STEPS: Array<{ key: string; text: React.ReactNode; more?: string }> = [
  {
    key: "open",
    text: (
      <>
        <Ui>Товари → Імпорт</Ui>, вставити посилання
      </>
    ),
  },
  {
    key: "photos",
    text: (
      <>
        Над фото — <Ui>Фото</Ui> і <Ui>Галерея</Ui>
      </>
    ),
    more: "Хорошоп сам ці колонки не ставить ніколи. Заодно звірити, що «Название модификации (UA)» стала на своє поле.",
  },
  {
    key: "operations",
    text: (
      <>
        Існуючі — <Ui>Не оновлювати</Ui>, відсутні — <Ui>Нічого не робити</Ui>
      </>
    ),
    more: "За замовчуванням стоїть «Оновити» (у першій пробі пункт звався «Пропустити»). «Відсутні товари» з будь-чим іншим зачепить увесь каталог. «Фотографии» — байдуже, товари нові.",
  },
  {
    key: "publish",
    text: (
      <>
        Вичитати й увімкнути <Ui>Відображати</Ui> всім кольорам
      </>
    ),
    more: "Поки кольори приховані, у «Виберіть колір» на сторінці видно лише колір самої сторінки — це не поломка.",
  },
];

export function SiteListingHoroshopSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("space-y-1.5 text-xs text-foreground", className)}>
      {STEPS.map((step, index) => (
        <li key={step.key} className="flex items-start gap-2">
          <span className="mt-px w-3 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 leading-5">
            {step.text}
            {step.more ? (
              <HoverTip label={step.more} contentClassName="max-w-[280px]">
                <Info
                  className="ml-1 inline h-3.5 w-3.5 cursor-help align-[-3px] text-muted-foreground"
                  aria-label={step.more}
                />
              </HoverTip>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
