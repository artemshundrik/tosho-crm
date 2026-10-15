import { useState } from "react";
import { toast } from "sonner";

import { ExternalLink, Receipt } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { setOrderActNumber } from "@/features/orders/orderLegalEntityQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Номер акта з BAS (REQ-322#p3). Акт нумерує BAS, як і рахунок: бухгалтер
 * виписує його там і вносить сюди номер і дату — тоді вони друкуються в акті.
 * Внесений номер можна виправити тут же.
 */
export function OrderActDeskCard({
  record,
  teamId,
  onSaved,
  onPreview,
}: {
  record: DerivedOrderRecord;
  teamId: string;
  onSaved: (patch: { actNumber: string | null; actDate: string | null }) => void;
  onPreview: () => void;
}) {
  const [number, setNumber] = useState(record.actNumber ?? "");
  const [date, setDate] = useState(record.actDate ?? todayIso());
  const [busy, setBusy] = useState(false);
  const unchanged = number.trim() === (record.actNumber ?? "") && date === (record.actDate ?? date);

  const save = async () => {
    setBusy(true);
    try {
      const patch = await setOrderActNumber({ teamId, orderId: record.id, number, date });
      onSaved(patch);
      toast.success(patch.actNumber ? `Акт № ${patch.actNumber} внесено` : "Номер акта прибрано");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти номер акта.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-label="Номер акта">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {record.actNumber ? `Акт № ${record.actNumber}` : "Замовлення закривається актом"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {record.actNumber ? "Номер можна виправити." : "Випишіть акт у BAS і внесіть його номер — він піде в друк акта."}
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="gap-1 px-2 text-xs" onClick={onPreview}>
          <ExternalLink className="h-3.5 w-3.5" />
          Переглянути акт
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid w-full gap-1 sm:w-40">
          <Label htmlFor="act-number" className="text-xs">
            Номер з BAS
          </Label>
          <Input id="act-number" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="напр. ОУ-0000007" />
        </div>
        <div className="grid w-full gap-1 sm:w-40">
          <Label htmlFor="act-date" className="text-xs">
            Дата
          </Label>
          <DateInput id="act-date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <Button size="sm" className="w-full sm:ml-auto sm:w-auto" disabled={busy || unchanged || (!number.trim() && !record.actNumber)} onClick={() => void save()}>
          {record.actNumber ? "Зберегти" : "Акт виписано"}
        </Button>
      </div>
    </section>
  );
}
