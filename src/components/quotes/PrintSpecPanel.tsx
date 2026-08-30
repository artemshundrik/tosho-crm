import * as React from "react";
import { Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrintSpecFields } from "@/components/quotes/PrintSpecFields";
import {
  createEmptyPrintSpecValues,
  formatPrintSpecSummary,
  getPrintSpecPreset,
  isPrintSpecFilled,
  parsePrintSpecValues,
  type PrintSpecMetadata,
  type PrintSpecValues,
} from "@/lib/printSpec";

/**
 * Параметри виробу для описових видів поліграфії на картці прорахунку.
 *
 * ЧОМУ САМЕ ТУТ, А НЕ У ВІКНІ СТВОРЕННЯ: заповнює це не той, хто заводить
 * прорахунок, а той, хто його рахує — «спосіб друку не обовʼязково для
 * менеджерів, ми самі з Оленою вибираємо від формату і тиражу». Менеджер при
 * створенні вибирає лише вид виробу й тираж.
 *
 * ЧОМУ ПОРОЖНІЙ СТАН — НЕ ПОМИЛКА: між створенням прорахунку й прорахунком
 * параметрів іще немає, і це нормальний робочий стан. Тому тут заклик заповнити,
 * а не попередження.
 *
 * Компонент сам вирішує, чи йому бути: вид без опису полів — і він не малює
 * нічого. Саме тому його можна безпечно поставити одним рядком на спільну
 * сторінку, яку бачать усі.
 */

export type PrintSpecPanelProps = {
  quoteItemId: string;
  /** `catalog_models.metadata.specPreset` вибраної моделі. */
  presetKey?: string | null;
  /** Що вже збережено в `quote_items.metadata.printSpec`. */
  saved?: PrintSpecMetadata | null;
  canEdit: boolean;
  onSaved: () => void;
};

export function PrintSpecPanel({ quoteItemId, presetKey, saved, canEdit, onSaved }: PrintSpecPanelProps) {
  const preset = React.useMemo(() => getPrintSpecPreset(saved?.presetKey ?? presetKey), [presetKey, saved?.presetKey]);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<PrintSpecValues>({});
  const [saving, setSaving] = React.useState(false);

  const savedValues = React.useMemo(
    () => (preset ? parsePrintSpecValues(preset, saved?.values ?? null) : {}),
    [preset, saved?.values]
  );

  const summary = React.useMemo(
    () => (preset && isPrintSpecFilled(preset, savedValues) ? formatPrintSpecSummary(preset, savedValues) : []),
    [preset, savedValues]
  );

  if (!preset) return null;

  const openEditor = () => {
    setDraft(isPrintSpecFilled(preset, savedValues) ? savedValues : createEmptyPrintSpecValues(preset));
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Метадані читаємо перед записом, а не беремо зі стану сторінки: у тому ж
      // обʼєкті живуть sku й варіант каталогу, і запис усього обʼєкта зі старого
      // знімка затер би чужу правку (так уже одного разу зникла аватарка в профілі).
      const { data, error: readError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("metadata")
        .eq("id", quoteItemId)
        .maybeSingle();
      if (readError) throw readError;

      const current = (data?.metadata ?? {}) as Record<string, unknown>;
      const nextMetadata = {
        ...current,
        printSpec: { presetKey: preset.key, values: draft },
      };

      const { error: writeError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .update({ metadata: nextMetadata })
        .eq("id", quoteItemId);
      if (writeError) throw writeError;

      toast.success("Параметри виробу збережено");
      setOpen(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти параметри виробу");
    } finally {
      setSaving(false);
    }
  };

  const filled = summary.length > 0;

  return (
    <div className="mt-4 rounded-xl border border-border/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span>Параметри виробу</span>
          <span className="text-xs font-normal text-muted-foreground">{preset.label}</span>
        </div>
        {canEdit ? (
          <Button variant={filled ? "ghost" : "primary"} size="sm" onClick={openEditor}>
            {filled ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : null}
            {filled ? "Змінити" : "Заповнити"}
          </Button>
        ) : null}
      </div>

      {filled ? (
        <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {summary.map((line) => {
            const separator = line.indexOf(": ");
            const label = separator < 0 ? line : line.slice(0, separator);
            const value = separator < 0 ? "" : line.slice(separator + 2);
            return (
              <div key={line} className="grid grid-cols-[minmax(96px,0.9fr)_minmax(0,1.1fr)] gap-3 text-sm">
                <div className="min-w-0 text-muted-foreground">{label}</div>
                <div className="min-w-0 font-semibold leading-snug text-foreground">{value}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">
          Параметри ще не заповнені{canEdit ? "" : " — їх заповнює той, хто прораховує"}.
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => (saving ? null : setOpen(next))}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preset.label}</DialogTitle>
            <DialogDescription>
              Параметри виробу для прорахунку. Обмежень немає — якщо потрібного варіанта немає в списку, вибирайте
              «Інше» і пишіть текстом.
            </DialogDescription>
          </DialogHeader>

          <PrintSpecFields preset={preset} values={draft} onChange={setDraft} disabled={saving} />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
