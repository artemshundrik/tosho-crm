import { offerSummaryText, RUN_CHOICE_NOTE, type CommercialDocument } from "./document";

/**
 * Смуга підсумку в прев'ю КП — рівно те, що поїде в документі.
 *
 * ЧИСЛА ТУТ БІЛЬШЕ НЕМАЄ (REQ-296, дірка REQ-267#p2). Було «Загальна сума» з
 * межами по тиражах, і воно складало позиції, які замовник обирає одну з одної:
 * на TS-0926-0029 виходило 80–120 тис. ₴ там, де реальна вилка 34–85 тис.
 * Менше число замість більшого нічого не полагодило б — поки вибору немає,
 * ЖОДНА сума не правдива, тому в документі стоїть пояснення, а не цифра.
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
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <div className="text-sm font-semibold">Підсумок</div>
      <p className="text-xs text-muted-foreground">{offerSummaryText(doc)}</p>
      {hasRunChoice ? <p className="text-xs text-muted-foreground">{RUN_CHOICE_NOTE}</p> : null}
    </div>
  );
}
