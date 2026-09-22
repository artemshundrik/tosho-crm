import {
  offerSummaryText,
  OFFER_NEXT_STEP_TITLE,
  RUN_CHOICE_NOTE,
  type CommercialDocument,
} from "./document";

/**
 * Кінцівка КП у прев'ю набору — рівно те, що поїде в документі.
 *
 * ЧИСЛА ТУТ БІЛЬШЕ НЕМАЄ (REQ-296, дірка REQ-267#p2). Було «Загальна сума» з
 * межами по тиражах, і воно складало позиції, які замовник обирає одну з одної:
 * на TS-0926-0029 виходило 80–120 тис. ₴ там, де реальна вилка 34–85 тис.
 * Менше число замість більшого нічого не полагодило б — поки вибору немає,
 * ЖОДНА сума не правдива, тому в документі стоїть пояснення, а не цифра.
 *
 * РАМКИ ТЕЖ НЕМАЄ (REQ-307). У документі кінцівка стоїть під лінією, без картки:
 * у рамці вона важила стільки ж, скільки товар, і читалась як ще одна позиція.
 * Прев'ю повторює це, інакше воно знову почне розходитись із тим, що друкується.
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ. Розмітка прев'ю живе в `QuotesPage` — сторінці на вісім
 * тисяч рядків із власною стелею розміру. Цей блок не читає зі сторінки нічого,
 * крім готового `doc`, тож тримати його всередині нема за що; заразом тексти не
 * є копією — вони поруч, у `document.ts`.
 */

export function CommercialPreviewSummary({ doc }: { doc: CommercialDocument }) {
  const hasRunChoice = doc.sections.some((section) =>
    section.items.some((item) => item.runs.length > 1)
  );

  return (
    <div className="space-y-1 border-t border-border/60 pt-3">
      {hasRunChoice ? (
        <p className="pb-2 text-2xs text-muted-foreground">{RUN_CHOICE_NOTE}</p>
      ) : null}
      <div className="text-sm font-semibold">{OFFER_NEXT_STEP_TITLE}</div>
      <p className="text-xs text-muted-foreground">{offerSummaryText(doc)}</p>
    </div>
  );
}
