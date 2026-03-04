import { useMemo } from "react";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { Card } from "@/components/ui/card";
import { ReceiptText } from "lucide-react";

export default function FinanceInvoicesPage() {
  const invoicesHeaderActions = useMemo(() => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 lg:px-6">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <ReceiptText className="h-4 w-4 text-muted-foreground" />
        Рахунки
      </div>
      <div className="text-sm text-muted-foreground">Модуль у підготовці</div>
    </div>
  ), []);

  usePageHeaderActions(invoicesHeaderActions, [invoicesHeaderActions]);

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20 md:pb-0 space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
        Модуль рахунків готується до релізу.
      </Card>
    </div>
  );
}
