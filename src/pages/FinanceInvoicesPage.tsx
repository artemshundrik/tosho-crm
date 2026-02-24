import { PageHeader } from "@/components/app/headers/PageHeader";
import { Card } from "@/components/ui/card";
import { ReceiptText } from "lucide-react";

export default function FinanceInvoicesPage() {
  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20 md:pb-0 space-y-6">
      <PageHeader
        title="Рахунки"
        subtitle="Список рахунків, статуси оплат та контроль фінансових зобовʼязань."
        icon={<ReceiptText className="h-5 w-5" />}
      />
      <Card className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
        Модуль рахунків готується до релізу.
      </Card>
    </div>
  );
}
