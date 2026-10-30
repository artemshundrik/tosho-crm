import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addQuoteItemsToOrder } from "@/features/orders/orderAppendQueries";
import type { OrderCreationDraft } from "@/features/orders/orderRecords";
import { formatCurrency } from "@/features/quotes/quote-details/config";
import { createOrderFromQuote, fetchOrderCreationDraft } from "@/features/quotes/quote-details/queries";
import { cn } from "@/lib/utils";

const NEW_ORDER = "new";

/**
 * «Створити замовлення» з картки прорахунку. З REQ-344 (власник, 30.10.2026) тут
 * же вибір, куди покласти позиції: окреме замовлення або наявне замовлення того ж
 * замовника — тоді рахунок і СП будуть одні на кілька прорахунків. Позиції, що вже
 * пішли в замовлення, видно, але не обрати: той самий товар двічі не продаємо.
 */
export function QuoteCreateOrderDialog({
  open,
  onOpenChange,
  teamId,
  quoteId,
  userId,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  quoteId: string;
  userId: string | null | undefined;
  currency: string | null | undefined;
}) {
  const [draft, setDraft] = useState<OrderCreationDraft | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(NEW_ORDER);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft(null);
    setTarget(NEW_ORDER);
    void fetchOrderCreationDraft(teamId, quoteId, userId).then((prepared) => {
      if (cancelled) return;
      if (prepared.ok) {
        setDraft(prepared.data);
        setSelectedIds(
          prepared.data.selectableItems
            .map((item) => item.quoteItemId ?? item.id)
            .filter((id) => Boolean(id) && !prepared.data.orderedItemNumbers[id])
        );
      } else {
        setSelectedIds([]);
        setError(prepared.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, teamId, quoteId, userId]);

  const toggleItem = (quoteItemId: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, quoteItemId])) : prev.filter((id) => id !== quoteItemId)));
  };

  const handleSubmit = async () => {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    const input = { teamId, quoteId, selectedQuoteItemIds: selectedIds, userId };
    const result =
      target === NEW_ORDER ? await createOrderFromQuote(input) : await addQuoteItemsToOrder({ ...input, orderId: target });
    if (result.ok) {
      toast.success(target === NEW_ORDER ? "Замовлення створено" : "Позиції додано до замовлення");
      window.location.assign(`/orders/production/${result.data.id}`);
    } else {
      setError(result.message);
    }
    setSubmitting(false);
  };

  const targetOrderNumber = draft?.appendTargets.find((entry) => entry.id === target)?.orderNumber;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Створити замовлення</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-sm text-muted-foreground">Готуємо дані для замовлення...</div>
        ) : draft ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="text-sm font-semibold text-foreground">{draft.quoteNumber}</div>
              <div className="mt-1 text-sm text-muted-foreground">{draft.readiness.customerName}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Що має бути готово</div>
              <div className="space-y-2">
                {draft.readiness.readinessSteps.map((step) => (
                  <div key={step.label} className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2">
                    <Checkbox checked={step.done} disabled />
                    <div className="text-sm text-foreground">{step.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {draft.appendTargets.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Куди</div>
                <div className="space-y-2" role="radiogroup" aria-label="Куди покласти позиції">
                  {[
                    { id: NEW_ORDER, title: "Нове замовлення", hint: "Окремий рахунок і СП" },
                    ...draft.appendTargets.map((entry) => ({
                      id: entry.id,
                      title: `Додати до ${entry.orderNumber}`,
                      hint: `${entry.itemCount} поз. · ${formatCurrency(entry.total, currency)} — один рахунок на все`,
                    })),
                  ].map((option) => {
                    const active = target === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTarget(option.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          active ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            active ? "border-primary" : "border-muted-foreground/50"
                          )}
                        >
                          {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{option.title}</span>
                          <span className="block text-xs text-muted-foreground">{option.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Позиції, що підуть у замовлення</div>
              <div className="space-y-2">
                {draft.selectableItems.map((item) => {
                  const itemId = item.quoteItemId ?? item.id;
                  const orderedIn = draft.orderedItemNumbers[itemId];
                  const checked = !orderedIn && selectedIds.includes(itemId);
                  return (
                    <label
                      key={itemId}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2",
                        orderedIn ? "opacity-60" : "cursor-pointer"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={Boolean(orderedIn)}
                        onCheckedChange={(value) => toggleItem(itemId, Boolean(value))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {orderedIn
                            ? `Уже в замовленні ${orderedIn}`
                            : `${item.qty} ${item.unit} × ${formatCurrency(item.unitPrice, currency)} = ${formatCurrency(item.lineTotal, currency)}`}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {draft.readiness.blockers.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Замовлення можна створити лише коли всі пункти вище мають галочку. Ще треба зробити:{" "}
                {draft.readiness.blockers.join(", ")}.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="py-6 text-sm text-muted-foreground">{error ?? "Не вдалося підготувати замовлення."}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Скасувати
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !draft || draft.readiness.blockers.length > 0 || selectedIds.length === 0}
          >
            {submitting
              ? "Зберігаємо..."
              : target === NEW_ORDER
                ? "Створити замовлення"
                : `Додати до ${targetOrderNumber ?? "замовлення"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
