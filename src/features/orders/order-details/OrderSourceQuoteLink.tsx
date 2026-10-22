import { Link } from "react-router-dom";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

/**
 * «з TS-…» поруч із номером замовлення: замовлення має власний номер TO-…, а прорахунок,
 * з якого його зробили, лишається своїм номером. Клік веде в прорахунок.
 */
export const OrderSourceQuoteLink = ({ record }: { record: DerivedOrderRecord }) => {
  const sourceNumber = record.sourceQuoteNumber?.trim();
  if (!record.linkedQuoteId || !sourceNumber || sourceNumber === record.quoteNumber) return null;
  return (
    <Link
      to={`/orders/estimates/${record.linkedQuoteId}`}
      className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
    >
      з прорахунку {sourceNumber}
    </Link>
  );
};
