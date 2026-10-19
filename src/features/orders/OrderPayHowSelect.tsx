import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { DEFAULT_ORDER_EXECUTOR, executorBadge } from "./orderExecutor";
import type { OrderLegalEntityOption } from "./orderLegalEntityQueries";
import { PAY_HOW_INVOICE_PREFIX, PAY_HOW_WITHOUT_DOCUMENTS } from "./paymentRules";

const GROUP_LABEL = "px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground";

/**
 * «Як платить» (REQ-322#p17): юрособа, від якої йде рахунок, або спосіб без
 * документів — одним вибором. Значення перекладає fromPayHowValue.
 */
export function OrderPayHowSelect({
  id,
  value,
  onChange,
  legalEntityOptions,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  legalEntityOptions: OrderLegalEntityOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Оберіть, як платить" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className={GROUP_LABEL}>За рахунком</SelectLabel>
          {legalEntityOptions.length > 0 ? (
            legalEntityOptions.map((option) => (
              <SelectItem key={option.row.id} value={`${PAY_HOW_INVOICE_PREFIX}${option.row.id}`}>
                {executorBadge(option.executor)}
              </SelectItem>
            ))
          ) : (
            // Довідник юросіб не прочитався — рахунок іде від ТОВ.
            <SelectItem value={PAY_HOW_INVOICE_PREFIX}>{executorBadge(DEFAULT_ORDER_EXECUTOR)}</SelectItem>
          )}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className={GROUP_LABEL}>Без документів</SelectLabel>
          {PAY_HOW_WITHOUT_DOCUMENTS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
