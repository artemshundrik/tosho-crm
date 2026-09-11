import { FileSpreadsheet, Package, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuoteKindValue } from "@/features/quotes/quote-wizard/quoteWizardKinds";

/**
 * Дії над складом прорахунку: додати товар, додати поліграфію, узяти з ексельки.
 *
 * ЧОМУ ДВІ КНОПКИ, А НЕ ПЕРЕМИКАЧ У ВІКНІ (Артем, 11.09.2026). Вікно додавання
 * позицій відкривалось у режимі, взятому з типу прорахунку, і вибору режиму в
 * ньому не було взагалі: у товарний прорахунок поліграфію додати було
 * НЕМОЖЛИВО, хоч замовник часто бере і мерч, і щоденники одним листом. Вибір
 * зроблено тут, до відкриття, — і вікно одразу відкривається правильним, а не
 * пропонує перемкнути себе зсередини.
 *
 * ЧОМУ ПІКТОГРАМИ РЕЧЕЙ, А НЕ ПЛЮСИ. Два однакові плюси поруч відрізнялись
 * тільки підписом, і око читало підпис. Коробка й принтер — ті самі дві
 * піктограми, якими вікно створення прорахунку питає «що рахуємо»
 * (`quoteWizardKinds.ts`), тож мова одна від першого екрана до останнього.
 */
export function QuoteAddItemsActions({
  disabled,
  lockedHint,
  onAdd,
  onImport,
}: {
  disabled: boolean;
  lockedHint: string | null;
  onAdd: (kind: QuoteKindValue) => void;
  onImport: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        title={lockedHint ?? undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdd("merch");
        }}
        className="h-10 gap-2 rounded-xl"
      >
        <Package className="h-4 w-4" />
        Додати товар
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        title={lockedHint ?? "Щоденники, календарі, брошури — те, що виробляємо самі"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdd("print");
        }}
        className="h-10 gap-2 rounded-xl"
      >
        <Printer className="h-4 w-4" />
        Додати поліграфію
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        title={lockedHint ?? "Excel від клієнта → позиції з тиражами. Ціни вписуються тут, у прорахунку"}
        onClick={onImport}
        className="h-10 gap-2 rounded-xl"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Імпорт з файлу
      </Button>
    </div>
  );
}
