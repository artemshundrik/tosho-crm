import * as React from "react";
import { FlaskConical } from "lucide-react";

import {
  QuoteKindPickerDialog,
  type QuoteKindValue,
  type QuoteWizardChoice,
} from "@/components/quotes/QuoteKindPickerDialog";
import { Button } from "@/components/ui/button";
import { ModalMount, useModalMount } from "@/components/ui/modal-mount";
import { QuoteImportDialog } from "@/features/quotes/quote-import/QuoteImportDialog";
import { useCompanyPricingRates } from "@/lib/companyPricingRates";
import { getManagerRateForUser } from "@/lib/managerRate";
import { defaultMarkupRateFor, resolveQuoteDealType } from "@/lib/quoteDealType";
import { createQuote } from "@/lib/toshoApi";

import {
  createEmptyQuoteWizardHeader,
  getQuoteWizardHeaderIssue,
  QuoteWizardHeader,
  type QuoteWizardHeaderValue,
} from "./QuoteWizardHeader";

/**
 * Тестовий візард створення прорахунку (REQ-134).
 *
 * ЩО ВІН ЛІКУЄ. Імпорт ексельки поїхав кнопкою ВСЕРЕДИНІ вже створеного
 * прорахунку — тобто способом його доробити. Задум був інший: імпорт має бути
 * ВХОДОМ, одним зі способів прорахунок створити. Звідси шлях
 * «що рахуємо → звідки позиції → шапка й файл → прев'ю → і аж тоді картка».
 *
 * ЧОМУ ОКРЕМА КНОПКА. Полігон: робочий шлях менеджерів не чіпаємо, поки
 * візард не визріє. Кнопка «Імпорт з файлу» в картці прорахунку теж лишається.
 *
 * ПОРЯДОК СТВОРЕННЯ — ГОЛОВНЕ ТУТ. Прорахунок з'являється в базі рівно тоді,
 * коли людина натиснула «Створити» на прев'ю. До того моменту закрите вікно не
 * лишає по собі нічого. Створювати наперед було б простіше (білдерна мутація
 * вміє це одним викликом), але кожне «передумав» лишало б порожній прорахунок
 * — рівно та хвороба, від якої візард і йде.
 */

export function TestQuoteWizardButton({
  className,
  teamId,
  currentUserId,
  onManual,
  onCreated,
}: {
  className?: string;
  teamId: string;
  currentUserId?: string | null;
  /** Шлях «руками»: далі працює звичайний білдер сторінки. */
  onManual: (kind: QuoteKindValue) => void;
  /** Прорахунок створено — сторінка вирішує, куди вести далі. */
  onCreated: (quoteId: string) => void;
}) {
  const picker = useModalMount();
  const [importOpen, setImportOpen] = React.useState(false);
  const [header, setHeader] = React.useState<QuoteWizardHeaderValue>(() =>
    createEmptyQuoteWizardHeader(currentUserId ?? "")
  );
  const companyRates = useCompanyPricingRates(currentUserId);
  const createdQuoteRef = React.useRef<string | null>(null);

  const handlePick = React.useCallback(
    (choice: QuoteWizardChoice) => {
      picker.close();
      if (choice.source === "manual") {
        onManual(choice.kind);
        return;
      }
      // Менеджер підставлений собою — у дев'яти випадках з десяти прорахунок
      // веде той, хто його й заводить.
      setHeader(createEmptyQuoteWizardHeader(currentUserId ?? ""));
      createdQuoteRef.current = null;
      setImportOpen(true);
    },
    [currentUserId, onManual, picker]
  );

  const headerIssue = getQuoteWizardHeaderIssue(header);

  /**
   * Прорахунок створюється тут — після прев'ю, з шапки, зібраної на кроці 3.
   * Тиражі писатиме вже сам імпорт, тож ані товару, ані тиражу тут не треба:
   * саме тому це `createQuote`, а не мутація білдера.
   */
  const prepareQuote = React.useCallback(async () => {
    if (createdQuoteRef.current) return createdQuoteRef.current;
    const issue = getQuoteWizardHeaderIssue(header);
    if (issue) throw new Error(issue);

    const created = await createQuote({
      teamId,
      // Ліда в `customer_id` не пишуть — там зовнішній ключ на замовників;
      // ім'я лишається в `customer_name`, а назва прорахунку бере його на себе.
      // Рівно так само це робить білдер.
      customerId: header.partyType === "customer" ? header.partyId : null,
      title: header.partyType === "lead" ? header.partyLabel || null : null,
      customerName: header.partyLabel || null,
      customerLogoUrl: header.partyLogoUrl,
      quoteType: "merch",
      currency: header.currency,
      assignedTo: header.managerId || null,
      deadlineAt: header.deadlineAt || null,
    });
    createdQuoteRef.current = created.id;
    return created.id;
  }, [header, teamId]);

  const [runDefaults, setRunDefaults] = React.useState({
    markupRate: defaultMarkupRateFor(resolveQuoteDealType("merch", null)),
    managerRate: 0,
    fixedCostRate: companyRates.fixedCostRate,
    vatRate: companyRates.vatRate,
  });

  // Ставка менеджера персональна, тож її доводиться питати базу — але не в мить
  // збереження, а поки людина дивиться прев'ю.
  React.useEffect(() => {
    if (!importOpen) return;
    let alive = true;
    void (async () => {
      const managerRate = await getManagerRateForUser(header.managerId || currentUserId);
      if (!alive) return;
      setRunDefaults({
        // На мерчі шкала типу угоди не діє — лишається стара підстановка 40 %,
        // рівно та сама, що її ставить білдер.
        markupRate: defaultMarkupRateFor(resolveQuoteDealType("merch", null)),
        managerRate,
        fixedCostRate: companyRates.fixedCostRate,
        vatRate: companyRates.vatRate,
      });
    })();
    return () => {
      alive = false;
    };
  }, [companyRates.fixedCostRate, companyRates.vatRate, currentUserId, header.managerId, importOpen]);

  return (
    <>
      <Button onClick={picker.open} variant="outline" className={className}>
        <FlaskConical className="h-4 w-4" />
        Тестовий прорахунок
      </Button>

      <ModalMount ref={picker.ref}>
        {(open, setOpen) => (
          <QuoteKindPickerDialog open={open} onOpenChange={setOpen} onPick={handlePick} />
        )}
      </ModalMount>

      {importOpen ? (
        <QuoteImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          quoteId={null}
          teamId={teamId}
          title="Новий прорахунок з ексельки"
          description="Спершу шапка, потім файл. Прорахунок з'явиться лише після того, як ви подивитесь прев'ю й натиснете «Створити»."
          nextPosition={1}
          runDefaults={runDefaults}
          canPick={!headerIssue}
          pickBlockedHint={headerIssue ?? undefined}
          header={
            <QuoteWizardHeader
              teamId={teamId}
              currentUserId={currentUserId}
              value={header}
              onChange={setHeader}
            />
          }
          onPrepareQuote={prepareQuote}
          onImported={(itemIds, quoteId, ok) => {
            // Тільки на успіху: на невдачі людина має лишитись у вікні й
            // побачити, ЩО саме не записалось, — а не поїхати на картку з
            // бадьорим тостом. Саме так я й помилився першого разу.
            if (!ok || itemIds.length === 0) return;
            onCreated(quoteId);
          }}
        />
      ) : null}
    </>
  );
}
