import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AlertTriangle, FileSignature, Loader2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import {
  CUSTOMER_CONTRACT_ACCEPT,
  CUSTOMER_CONTRACT_MAX_BYTES,
  recognizeCustomerContract,
  saveCustomerContract,
  type RecognizedContract,
} from "@/features/orders/customerContractsQueries";
import { SIGNATURE_VIA_LABELS, type SignatureVia } from "@/features/orders/orderApprovals";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { canManageOrderDocuments } from "@/lib/permissions";

const SIGN_OPTIONS: SignatureVia[] = ["vchasno", "paper", "medoc"];

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

type Form = { number: string; date: string; validUntil: string; autoProlongation: boolean; signedVia: SignatureVia };

const EMPTY_FORM: Form = { number: "", date: "", validUntil: "", autoProlongation: false, signedVia: "vchasno" };

/**
 * «Внести договір» (REQ-322#p39): договір, підписаний поза CRM, бухгалтер кидає
 * файлом. CRM розпізнає номер, дату й термін і підставляє у поля; бухгалтер
 * звіряє з файлом і зберігає. Договір лягає на замовника й нашу юрособу цього
 * замовлення — далі його успадковують усі замовлення без власного договору.
 *
 * Кнопки немає, якщо людина не вносить договори (p41) або договір уже підписано.
 */
export function CustomerContractEntry({
  record,
  teamId,
  onSaved,
  className,
}: {
  record: DerivedOrderRecord;
  teamId: string | null | undefined;
  onSaved: () => void;
  className?: string;
}) {
  const { accessRole, jobRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState<RecognizedContract | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  if (!teamId || !record.customerId || record.contractSignedAt) return null;
  if (!canManageOrderDocuments(accessRole, jobRole)) return null;

  const reset = () => {
    setFile(null);
    setRecognized(null);
    setForm(EMPTY_FORM);
  };

  const pickFile = async (files: File[]) => {
    const next = files[0];
    if (!next) return;
    if (next.size > CUSTOMER_CONTRACT_MAX_BYTES) {
      toast.error("Файл більший за 4 МБ — стисніть PDF або зробіть фото менше.");
      return;
    }
    setFile(next);
    setRecognized(null);
    setRecognizing(true);
    try {
      const result = await recognizeCustomerContract(next);
      setRecognized(result);
      setForm((current) => ({
        ...current,
        number: result.number ?? current.number,
        date: result.date ?? current.date,
        validUntil: result.validUntil ?? current.validUntil,
        autoProlongation: result.autoProlongation ?? current.autoProlongation,
      }));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Розпізнати не вдалося — впишіть поля самі.");
    } finally {
      setRecognizing(false);
    }
  };

  const save = async () => {
    if (!file || !form.number.trim() || !form.date || !record.customerId) return;
    setSaving(true);
    try {
      await saveCustomerContract(teamId, {
        customerId: record.customerId,
        ourLegalEntityId: record.ourLegalEntityId,
        number: form.number,
        date: form.date,
        validUntil: form.validUntil || null,
        autoProlongation: form.autoProlongation,
        signedVia: form.signedVia,
        file,
      });
      toast.success(`Договір № ${form.number.trim()} внесено — рахунок і СП тепер беруть його`);
      setOpen(false);
      reset();
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти договір.");
    } finally {
      setSaving(false);
    }
  };

  // Договір іншого замовника в цьому вікні — найімовірніша помилка: файл узяли не той.
  const otherCustomer =
    digits(recognized?.customerCode) && digits(record.customerTaxId)
      ? digits(recognized?.customerCode) !== digits(record.customerTaxId)
      : false;
  const expired = Boolean(form.validUntil && !form.autoProlongation && form.validUntil < new Date().toISOString().slice(0, 10));

  return (
    <>
      <Button size="sm" variant="outline" className={className ?? "gap-1 px-2.5 text-xs"} onClick={() => setOpen(true)}>
        <FileSignature className="h-3.5 w-3.5" />
        Внести підписаний договір
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Договір, підписаний поза CRM</DialogTitle>
            <DialogDescription>
              {record.customerName} · від {record.executor.shortName}. Номер, дату й термін CRM підставить із файлу —
              звірте їх перед збереженням.
            </DialogDescription>
          </DialogHeader>

          <FileDropZone
            size="row"
            label="Файл договору"
            title={file ? file.name : "Перетягніть або клікніть для вибору"}
            hint="PDF або фото, до 4 МБ"
            accept={CUSTOMER_CONTRACT_ACCEPT}
            busy={recognizing}
            disabled={saving}
            onFiles={(files) => void pickFile(files)}
          />

          {recognizing ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Розпізнаю номер, дату й термін…
            </div>
          ) : null}

          {otherCustomer || expired || (recognized?.warnings.length ?? 0) > 0 ? (
            <div className="tone-warning-subtle space-y-0.5 rounded-md border px-3 py-2 text-xs">
              {otherCustomer ? (
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 tone-text-warning" />
                  У договорі інший код замовника: {recognized?.customerCode}
                  {recognized?.customerName ? ` (${recognized.customerName})` : ""}
                </div>
              ) : null}
              {expired ? <div>Термін договору минув — рахунок на ньому не виписати.</div> : null}
              {recognized?.warnings.map((line) => <div key={line}>{line}</div>)}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="customer-contract-number" className="text-xs">
                Номер договору
              </Label>
              <Input
                id="customer-contract-number"
                value={form.number}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="customer-contract-date" className="text-xs">
                Дата договору
              </Label>
              <DateInput
                id="customer-contract-date"
                value={form.date}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="customer-contract-valid-until" className="text-xs">
                Діє до
              </Label>
              <DateInput
                id="customer-contract-valid-until"
                value={form.validUntil}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium">Підписано</span>
              <div className="flex flex-wrap gap-1.5">
                {SIGN_OPTIONS.map((via) => (
                  <Button
                    key={via}
                    type="button"
                    size="xs"
                    variant={form.signedVia === via ? "primary" : "outline"}
                    aria-pressed={form.signedVia === via}
                    disabled={saving}
                    onClick={() => setForm((current) => ({ ...current, signedVia: via }))}
                  >
                    {SIGNATURE_VIA_LABELS[via]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <label htmlFor="customer-contract-prolongation" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="customer-contract-prolongation"
              checked={form.autoProlongation}
              disabled={saving}
              onCheckedChange={(value) => setForm((current) => ({ ...current, autoProlongation: value === true }))}
            />
            Автопролонгація
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              Скасувати
            </Button>
            <Button
              type="button"
              disabled={!file || !form.number.trim() || !form.date || recognizing || saving}
              onClick={() => void save()}
            >
              {saving ? "Збереження..." : "Зберегти договір"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
