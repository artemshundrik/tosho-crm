import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { NumberInput } from "@/components/ui/number-input";
import { CurrencyAmountInput } from "@/features/quotes/components/CurrencyAmountInput";
import { insertQuoteItemRow, persistQuoteRuns } from "@/features/quotes/quote-details/queries";
import { MODEL_PRICE_VAT_LABEL, type QuoteRunModelPriceVat } from "@/lib/quoteRuns";
import { supabase } from "@/lib/supabaseClient";
import type { QuoteRun } from "@/lib/toshoApi";
import { cn } from "@/lib/utils";
import { pluralWordUk } from "@/lib/lastSeen";

import {
  buildImportItemPayload,
  buildImportRunPayloads,
  findDraftsNeedingModelPriceVat,
  toDraftItems,
  type QuoteImportRunDefaults,
} from "./mapping";
import { buildSheetDump } from "./sheetDump";
import {
  QUOTE_IMPORT_ACCEPT,
  QUOTE_IMPORT_MAX_FILE_BYTES,
  isSupportedImportFile,
  readWorkbookSheets,
} from "./readWorkbook";
import type { QuoteImportDraftItem, QuoteImportFlag, QuoteImportParseResponse } from "./types";

/**
 * Імпорт позицій прорахунку з ексельки (REQ-233, docs/QUOTE_IMPORT_DESIGN.md).
 *
 * ПРЕВ'Ю — ОБОВ'ЯЗКОВИЙ КРОК, і це не ввічливість. Вхідні дані брудні (ціни
 * текстом, діапазони тиражу, альтернативи в сусідніх рядках), а тиражі в CRM
 * автозберігаються: мовчазний запис зіпсував би прорахунок швидше, ніж його
 * встигли б відкрити. Тому людина бачить усе, що піде в базу, і знімає зайве
 * галочкою.
 *
 * Файл читається В БРАУЗЕРІ, на сервер їде текстовий дамп. Запис роблять
 * НАЯВНІ мутації картки під RLS користувача — привілейованих записів тут немає.
 */

const FLAG_LABELS: Record<QuoteImportFlag, string> = {
  price_missing: "без ціни",
  ask_supplier: "спитати підрядника",
  quantity_range: "діапазон → два тиражі",
  alternative: "альтернатива",
};

type Stage = "pick" | "parsing" | "preview" | "saving";

export function QuoteImportDialog({
  open,
  onOpenChange,
  quoteId,
  teamId,
  currency,
  nextPosition,
  runDefaults,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  teamId: string;
  currency: string | null | undefined;
  /** Наступна вільна позиція в прорахунку — щоб імпорт не сів на чужі номери. */
  nextPosition: number;
  runDefaults: QuoteImportRunDefaults;
  onImported: (itemIds: string[]) => void | Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<QuoteImportDraftItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStage("pick");
    setFileName("");
    setError(null);
    setWarnings([]);
    setDrafts([]);
    setSavedCount(0);
  }, []);

  const selected = useMemo(() => drafts.filter((draft) => draft.selected), [drafts]);
  const missingVat = useMemo(() => findDraftsNeedingModelPriceVat(drafts), [drafts]);

  const patchDraft = (key: string, patch: Partial<QuoteImportDraftItem>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  const patchRun = (
    itemKey: string,
    runKey: string,
    patch: Partial<QuoteImportDraftItem["runs"][number]>
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.key === itemKey
          ? { ...draft, runs: draft.runs.map((run) => (run.key === runKey ? { ...run, ...patch } : run)) }
          : draft
      )
    );
  };

  const handleFile = async (file: File) => {
    setError(null);
    setWarnings([]);
    if (!isSupportedImportFile(file.name)) {
      setError("Підтримуються лише xlsx, xls, xlsm і csv.");
      return;
    }
    if (file.size > QUOTE_IMPORT_MAX_FILE_BYTES) {
      setError("Файл більший за 12 МБ — це вже не запит клієнта. Заберіть зайві аркуші.");
      return;
    }

    setFileName(file.name);
    setStage("parsing");
    try {
      const sheets = await readWorkbookSheets(file);
      const dump = buildSheetDump(sheets);
      if (dump.rowCount === 0) {
        setError("У файлі немає жодного заповненого рядка.");
        setStage("pick");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");

      const response = await fetch("/.netlify/functions/quote-import-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId, fileName: file.name, sheetDump: dump.text }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (QuoteImportParseResponse & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || `Розшифровка не вдалася (${response.status}).`);
      }

      const parsedDrafts = toDraftItems(payload?.items ?? []);
      const parsedWarnings = [...(payload?.warnings ?? [])];
      if (dump.truncated) {
        parsedWarnings.unshift("Файл завеликий — розібрано лише його початок.");
      }
      if (parsedDrafts.length === 0) {
        setError("Модель не знайшла в файлі жодної позиції. Перевірте, чи це справді таблиця запиту.");
        setStage("pick");
        setWarnings(parsedWarnings);
        return;
      }

      setDrafts(parsedDrafts);
      setWarnings(parsedWarnings);
      setStage("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося прочитати файл.");
      setStage("pick");
    }
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    if (missingVat.length > 0) {
      toast.error("Вкажіть, з ПДВ вартість товару чи без — інакше тираж не збережеться.");
      return;
    }

    setStage("saving");
    setError(null);
    const importedAt = new Date().toISOString();
    const createdIds: string[] = [];
    const runPayloads: QuoteRun[] = [];

    for (const [index, draft] of selected.entries()) {
      const itemId = crypto.randomUUID();
      const payload = buildImportItemPayload({
        draft,
        itemId,
        teamId,
        quoteId,
        position: nextPosition + index,
        trace: { fileName, importedAt },
      });
      const inserted = await insertQuoteItemRow(payload);
      if (!inserted.ok) {
        setError(inserted.message);
        setStage("preview");
        if (createdIds.length > 0) await onImported(createdIds);
        return;
      }
      const rowId = ((inserted.data as { id?: string } | null)?.id ?? itemId) as string;
      createdIds.push(rowId);
      runPayloads.push(
        ...buildImportRunPayloads({ draft, quoteId, quoteItemId: rowId, defaults: runDefaults })
      );
    }

    // Тиражі — одним записом на весь імпорт: 25 окремих запитів на кожен клік
    // «Створити» це чверть хвилини очікування й 25 шансів упасти посередині.
    const savedRuns = await persistQuoteRuns(quoteId, runPayloads, []);
    if (!savedRuns.ok) {
      setError(savedRuns.message);
      setStage("preview");
      await onImported(createdIds);
      return;
    }

    setSavedCount(createdIds.length);
    await startResearch(quoteId, createdIds);
    await onImported(createdIds);
    toast.success(
      `Створено ${createdIds.length} ${pluralWordUk(createdIds.length, "позицію", "позиції", "позицій")}. Картинки й назви доїжджають фоном.`
    );
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && stage === "saving") return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl" isDirty={stage === "preview"}>
        <DialogHeader>
          <DialogTitle>Імпорт позицій з файлу</DialogTitle>
          <DialogDescription>
            Excel від клієнта → позиції з тиражами й цінами. Нічого не записується, поки ви не
            подивитесь прев'ю.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {stage === "pick" ? (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Перетягніть файл сюди</p>
              <p className="text-sm text-muted-foreground">xlsx, xls, xlsm або csv — до 12 МБ</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={QUOTE_IMPORT_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <Button type="button" variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Обрати файл
            </Button>
          </div>
        ) : null}

        {stage === "parsing" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <div>
              <p className="font-medium">Розшифровую…</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
        ) : null}

        {stage === "preview" || stage === "saving" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-muted-foreground">
                {fileName} · знайдено {drafts.length}{" "}
                {pluralWordUk(drafts.length, "позицію", "позиції", "позицій")}, обрано {selected.length}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={stage === "saving"}
                onClick={() =>
                  setDrafts((prev) => {
                    const allOn = prev.every((draft) => draft.selected);
                    return prev.map((draft) => ({ ...draft, selected: !allOn }));
                  })
                }
              >
                {drafts.every((draft) => draft.selected) ? "Зняти всі" : "Обрати всі"}
              </Button>
            </div>

            {warnings.length > 0 ? (
              <div className="rounded-xl border border-warning-soft-border bg-warning-soft px-3 py-2.5 text-sm text-warning-copy">
                <div className="font-medium">Що не вдалося розібрати</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.key}
                  className={cn(
                    "rounded-xl border border-border/60 p-3 transition-colors",
                    !draft.selected && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={draft.selected}
                      disabled={stage === "saving"}
                      aria-label={`Імпортувати «${draft.name}»`}
                      onCheckedChange={(checked) => patchDraft(draft.key, { selected: checked === true })}
                      className="mt-2"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={draft.name}
                        disabled={stage === "saving"}
                        aria-label="Назва позиції"
                        onChange={(event) => patchDraft(draft.key, { name: event.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                        {draft.sourceRows.length > 0 ? (
                          <span className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                            рядок {draft.sourceRows.join(", ")}
                          </span>
                        ) : null}
                        {draft.flags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full border border-warning-soft-border bg-warning-soft px-2 py-0.5 font-medium text-warning-copy"
                          >
                            {FLAG_LABELS[flag] ?? flag}
                          </span>
                        ))}
                        {draft.links.map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[220px] truncate rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground underline underline-offset-2"
                          >
                            {link.replace(/^https?:\/\//, "")}
                          </a>
                        ))}
                      </div>
                      {draft.comment || draft.notes ? (
                        <Input
                          value={draft.comment}
                          disabled={stage === "saving"}
                          aria-label="Коментар замовника"
                          placeholder={draft.notes ?? "Коментар замовника"}
                          onChange={(event) => patchDraft(draft.key, { comment: event.target.value })}
                        />
                      ) : null}

                      {draft.runs.map((run) => (
                        <div key={run.key} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Тираж</div>
                            <NumberInput
                              value={run.quantity}
                              min={1}
                              disabled={stage === "saving"}
                              aria-label="Кількість тиражу"
                              onValueChange={(next) => patchRun(draft.key, run.key, { quantity: Math.max(1, next ?? 1) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Вартість товару</div>
                            <CurrencyAmountInput
                              value={run.unitPriceModel}
                              min={0}
                              currency={currency ?? undefined}
                              disabled={stage === "saving"}
                              aria-label="Вартість товару за штуку"
                              onValueChange={(next) => patchRun(draft.key, run.key, { unitPriceModel: next ?? 0 })}
                            />
                          </div>
                          <div className="space-y-1">
                            {/* Та сама трійця станів, що й у картці тиражу (REQ-232):
                                поки не обрали, тираж не збережеться, і сказати про це
                                треба ТУТ, а не після невдалого запису. */}
                            <div className="text-xs text-muted-foreground">З ПДВ чи без</div>
                            <SegmentedGroup className={cn("inline-flex w-full", SEGMENTED_GROUP_SM)}>
                              {(["incl", "excl"] as QuoteRunModelPriceVat[]).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={stage === "saving"}
                                  className={cn(SEGMENTED_TRIGGER_SM, "whitespace-nowrap px-2")}
                                  data-state={run.modelPriceVat === value ? "active" : "inactive"}
                                  aria-label={`Вартість товару ${MODEL_PRICE_VAT_LABEL[value]}`}
                                  onClick={() => patchRun(draft.key, run.key, { modelPriceVat: value })}
                                >
                                  {MODEL_PRICE_VAT_LABEL[value]}
                                </button>
                              ))}
                            </SegmentedGroup>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Нанесення</div>
                            <CurrencyAmountInput
                              value={run.unitPricePrint}
                              min={0}
                              currency={currency ?? undefined}
                              disabled={stage === "saving"}
                              aria-label="Вартість нанесення за штуку"
                              onValueChange={(next) => patchRun(draft.key, run.key, { unitPricePrint: next ?? 0 })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stage === "preview" || stage === "saving" ? (
          <DialogFooter className="gap-2">
            {missingVat.length > 0 ? (
              <div className="mr-auto text-xs text-warning-copy">
                У {missingVat.length}{" "}
                {pluralWordUk(missingVat.length, "позиції", "позиціях", "позиціях")} не сказано, з
                ПДВ вартість товару чи без.
              </div>
            ) : null}
            <Button type="button" variant="ghost" disabled={stage === "saving"} onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              type="button"
              disabled={stage === "saving" || selected.length === 0 || missingVat.length > 0}
              onClick={() => void handleCreate()}
              className="gap-2"
            >
              {stage === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {stage === "saving"
                ? `Створюю… ${savedCount}/${selected.length}`
                : `Створити ${selected.length} ${pluralWordUk(selected.length, "позицію", "позиції", "позицій")}`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Фонове дослідження лінків. Помилка тут нічого не скасовує: позиції вже
 * створені, а картинка з назвою — приємний додаток, без якого прорахунок
 * робиться так само.
 */
async function startResearch(quoteId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    await fetch("/.netlify/functions/quote-import-research-background", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quoteId, itemIds }),
    });
  } catch {
    // Мовчки: користувач про цей запит не просив, і сказати йому нічого.
  }
}
