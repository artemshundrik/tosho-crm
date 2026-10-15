import { useState } from "react";
import { toast } from "sonner";

import { ExternalLink, Receipt } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { getClosingDocumentRef } from "@/features/orders/orderLaunchPath";
import { setOrderClosingDocumentNumber } from "@/features/orders/orderLegalEntityQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { localTodayIso } from "@/features/orders/paymentRules";

type ClosingDocumentPatch = Partial<Pick<DerivedOrderRecord, "actNumber" | "actDate" | "waybillNumber" | "waybillDate">>;

const COPY = {
  act: {
    title: (number: string) => `Акт № ${number}`,
    empty: "Замовлення закривається актом",
    hint: "Випишіть акт у BAS і внесіть його номер — він піде в друк акта.",
    placeholder: "напр. ОУ-0000007",
    confirm: "Акт виписано",
    saved: (number: string) => `Акт № ${number} внесено`,
    cleared: "Номер акта прибрано",
  },
  waybill: {
    title: (number: string) => `ВН № ${number}`,
    empty: "Замовлення закривається видатковою накладною",
    hint: "Випишіть ВН у BAS і внесіть її номер і дату — від дати рахується відтермінування доплати.",
    placeholder: "напр. РН-0000012",
    confirm: "ВН виписано",
    saved: (number: string) => `ВН № ${number} внесено`,
    cleared: "Номер ВН прибрано",
  },
} as const;

/**
 * Номер закривального документа з BAS (REQ-322#p3, p5). Акт і ВН нумерує BAS,
 * як і рахунок: бухгалтер виписує документ там і вносить сюди номер і дату.
 * Номер акта друкується в акті; від дати ВН чи акта рахується відтермінування.
 */
export function OrderClosingDocumentDeskCard({
  record,
  teamId,
  onSaved,
  onPreview,
}: {
  record: DerivedOrderRecord;
  teamId: string;
  onSaved: (patch: ClosingDocumentPatch) => void;
  /** Друк є лише в акта: ВН друкує BAS. */
  onPreview: (() => void) | null;
}) {
  const doc = getClosingDocumentRef(record);
  const copy = COPY[doc.kind];
  const [number, setNumber] = useState(doc.number ?? "");
  const [date, setDate] = useState(doc.date ?? localTodayIso());
  const [busy, setBusy] = useState(false);
  const unchanged = number.trim() === (doc.number ?? "") && date === (doc.date ?? date);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await setOrderClosingDocumentNumber({ teamId, orderId: record.id, kind: doc.kind, number, date });
      onSaved(
        doc.kind === "act"
          ? { actNumber: saved.number, actDate: saved.date }
          : { waybillNumber: saved.number, waybillDate: saved.date }
      );
      toast.success(saved.number ? copy.saved(saved.number) : copy.cleared);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти номер документа.");
    } finally {
      setBusy(false);
    }
  };

  const fieldId = `${doc.kind}-number`;
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-label={`Номер: ${doc.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {doc.number ? copy.title(doc.number) : copy.empty}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{doc.number ? "Номер можна виправити." : copy.hint}</div>
          </div>
        </div>
        {onPreview ? (
          <Button size="sm" variant="ghost" className="gap-1 px-2 text-xs" onClick={onPreview}>
            <ExternalLink className="h-3.5 w-3.5" />
            Переглянути акт
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid w-full gap-1 sm:w-40">
          <Label htmlFor={fieldId} className="text-xs">
            Номер з BAS
          </Label>
          <Input id={fieldId} value={number} onChange={(event) => setNumber(event.target.value)} placeholder={copy.placeholder} />
        </div>
        <div className="grid w-full gap-1 sm:w-40">
          <Label htmlFor={`${fieldId}-date`} className="text-xs">
            Дата
          </Label>
          <DateInput id={`${fieldId}-date`} value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <Button
          size="sm"
          className="w-full sm:ml-auto sm:w-auto"
          disabled={busy || unchanged || (!number.trim() && !doc.number)}
          onClick={() => void save()}
        >
          {doc.number ? "Зберегти" : copy.confirm}
        </Button>
      </div>
    </section>
  );
}
