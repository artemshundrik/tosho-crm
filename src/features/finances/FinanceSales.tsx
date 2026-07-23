import * as React from "react";
import { FileText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { FinanceStickyBar } from "./FinanceMonthBar";
import { FinanceInvoices } from "./FinanceInvoices";
import { FinancePayments } from "./FinancePayments";

type FinanceSalesProps = {
  teamId: string | null;
  userId: string | null;
  canSeeSensitive: boolean;
};

export function FinanceSales({ teamId, userId, canSeeSensitive }: FinanceSalesProps) {
  const [tab, setTab] = React.useState<"invoices" | "payments">("invoices");

  return (
    <div className="space-y-4">
      {/* Липкий бар (спільний із рештою розділів Фінансів): перемикач підрозділів
          лишається на екрані під час скролу довгих списків. */}
      <FinanceStickyBar>
        <div className={cn("inline-flex", SEGMENTED_GROUP_SM)}>
          <button
            type="button"
            className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5")}
            data-state={tab === "invoices" ? "active" : "inactive"}
            onClick={() => setTab("invoices")}
          >
            <FileText className="h-3.5 w-3.5" /> Рахунки
          </button>
          <button
            type="button"
            className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5")}
            data-state={tab === "payments" ? "active" : "inactive"}
            onClick={() => setTab("payments")}
          >
            <Wallet className="h-3.5 w-3.5" /> Оплати
          </button>
        </div>
      </FinanceStickyBar>

      {tab === "invoices" ? (
        <FinanceInvoices teamId={teamId} userId={userId} />
      ) : (
        <FinancePayments teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
      )}
    </div>
  );
}
