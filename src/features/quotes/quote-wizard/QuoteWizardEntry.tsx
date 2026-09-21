import * as React from "react";
import { ModalMount, useModalMount } from "@/components/ui/modal-mount";
import { useCompanyPricingRates } from "@/lib/companyPricingRates";
import { getManagerRateForUser } from "@/lib/managerRate";
import { defaultMarkupRateFor, resolveQuoteDealType } from "@/lib/quoteDealType";
import { createQuote } from "@/lib/toshoApi";

import type { QuoteDealType } from "@/lib/quoteDealType";
import { QuoteWizardDialog } from "./QuoteWizardDialog";
import {
  createEmptyQuoteWizardHeader,
  getQuoteWizardHeaderIssue,
  QuoteWizardHeader,
  type QuoteWizardHeaderValue,
} from "./QuoteWizardHeader";
import type { QuoteKindValue } from "./quoteWizardKinds";

/**
 * Вікно створення прорахунку — ЄДИНИЙ вхід (REQ-134 → REQ-237 → REQ-299).
 *
 * ЩО ВОНО ЛІКУЄ. Імпорт ексельки колись жив кнопкою ВСЕРЕДИНІ вже створеного
 * прорахунку — тобто способом його доробити. Задум був інший: імпорт має бути
 * ВХОДОМ, одним зі способів прорахунок створити. Тепер входів три — руками,
 * з файлу, за посиланням — і всі на одному екрані.
 *
 * ЧОМУ ТЕПЕР БЕЗ ВЛАСНОЇ КНОПКИ. Півтора місяця воно стояло ПОРУЧ із робочим
 * шляхом, кнопкою «Тестовий прорахунок» із бейджем «beta», щоб не чіпати
 * менеджерів, поки візард не визріє. 21.09.2026 візард став робочим шляхом:
 * кнопки «Новий прорахунок» на сторінці прорахунків ведуть сюди, а пакетний
 * білдер виходить з ужитку. Тож вікно більше не носить кнопку із собою —
 * сторінка відкриває його сама, звідки їй треба (а таких місць чотири).
 *
 * ПОРЯДОК СТВОРЕННЯ — ГОЛОВНЕ ТУТ. Прорахунок зʼявляється в базі рівно тоді,
 * коли людина натиснула «Створити» під чернетками. До того моменту закрите
 * вікно не лишає по собі нічого.
 */
export function QuoteWizardMount({
  mount,
  teamId,
  currentUserId,
  onCreated,
}: {
  /** Монтування вікна, яким володіє сторінка: вона ж його й відкриває. */
  mount: ReturnType<typeof useModalMount>;
  teamId: string;
  currentUserId?: string | null;
  /** Прорахунок створено — сторінка вирішує, куди вести далі. */
  onCreated: (quoteId: string) => void;
}) {
  const [header, setHeader] = React.useState<QuoteWizardHeaderValue>(() =>
    createEmptyQuoteWizardHeader(currentUserId ?? "")
  );
  const companyRates = useCompanyPricingRates(currentUserId);
  const [managerRate, setManagerRate] = React.useState(0);
  const createdQuoteRef = React.useRef<string | null>(null);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) return;
      // Менеджер підставлений собою — у дев'яти випадках з десяти прорахунок
      // веде той, хто його й заводить.
      setHeader(createEmptyQuoteWizardHeader(currentUserId ?? ""));
      createdQuoteRef.current = null;
    },
    [currentUserId]
  );

  // Ставка менеджера персональна, тож її доводиться питати базу — але не в мить
  // збереження, а поки людина заповнює вікно.
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const rate = await getManagerRateForUser(header.managerId || currentUserId);
      if (alive) setManagerRate(rate);
    })();
    return () => {
      alive = false;
    };
  }, [currentUserId, header.managerId]);

  const headerIssue = getQuoteWizardHeaderIssue(header);

  /**
   * Прорахунок створюється тут — після чернеток, із шапки. Тиражі писатиме
   * вже сам запис позицій, тож ані товару, ані тиражу тут не треба: саме тому
   * це `createQuote`, а не мутація білдера.
   */
  const prepareQuote = React.useCallback(
    async (kind: QuoteKindValue, dealType: QuoteDealType | null) => {
      if (createdQuoteRef.current) return createdQuoteRef.current;
      const issue = getQuoteWizardHeaderIssue(header);
      if (issue) throw new Error(issue);

      const created = await createQuote({
        teamId,
        // Ліда в `customer_id` не пишуть — там зовнішній ключ на замовників;
        // ім'я лишається в `customer_name`, а назва прорахунку бере його на
        // себе. Рівно так само це робить білдер.
        customerId: header.partyType === "customer" ? header.partyId : null,
        title: header.partyType === "lead" ? header.partyLabel || null : null,
        customerName: header.partyLabel || null,
        customerLogoUrl: header.partyLogoUrl,
        quoteType: kind,
        // Тип угоди задає накрутку й дно. Без нього прорахунок лягав на дефолт
        // бази «standard» — тобто мовчки ставав стандартним виробничим, хоч
        // менеджер міг створювати тендер (REQ-182#p25).
        dealType,
        currency: header.currency,
        assignedTo: header.managerId || null,
        deadlineAt: header.deadlineAt || null,
      });
      createdQuoteRef.current = created.id;
      return created.id;
    },
    [header, teamId]
  );

  // Шкала типу угоди діє лише на поліграфії; на решті лишається стара
  // підстановка 40 % — та сама, що ставить білдер.
  const runDefaultsFor = React.useCallback(
    (kind: QuoteKindValue) => ({
      markupRate: defaultMarkupRateFor(resolveQuoteDealType(kind, null)),
      managerRate,
      fixedCostRate: companyRates.fixedCostRate,
      vatRate: companyRates.vatRate,
    }),
    [companyRates.fixedCostRate, companyRates.vatRate, managerRate]
  );

  return (
    <ModalMount ref={mount.ref} onOpenChange={handleOpenChange}>
      {(open, setOpen) => (
        <QuoteWizardDialog
          open={open}
          onOpenChange={setOpen}
          teamId={teamId}
          header={(nudgeSignal) => (
            <QuoteWizardHeader
              teamId={teamId}
              currentUserId={currentUserId}
              value={header}
              onChange={setHeader}
              nudgeSignal={nudgeSignal}
              layout="column"
          />
          )}
          headerIssue={headerIssue}
          runDefaultsFor={runDefaultsFor}
          onPrepareQuote={prepareQuote}
          onCreated={onCreated}
          />
      )}
    </ModalMount>
  );
}
