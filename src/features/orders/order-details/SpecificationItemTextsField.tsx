import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SpecificationItemTextsState } from "@/features/orders/order-details/useSpecificationItemTexts";

/** Поле «Текст у СП» на кожну позицію — у модалці умов специфікації. */
export function SpecificationItemTextsField({ state }: { state: SpecificationItemTextsState }) {
  const { texts, loading, setText, resetText } = state;
  if (!loading && texts.length === 0) return null;
  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div>
        <div className="text-sm font-medium">Текст у СП</div>
        <p className="text-xs text-muted-foreground">
          Як позиція стоятиме в таблиці специфікації. Перший рядок — назва, вона друкується жирним.
        </p>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Збираю тексти позицій…</p> : null}
      {texts.map((entry, index) => {
        const id = `spec-item-text-${entry.itemId}`;
        const isDefault = entry.text.trim() === entry.defaultText.trim();
        return (
          <div key={entry.itemId} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id} className="truncate">
                {index + 1}. {entry.name}
              </Label>
              {!isDefault ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => resetText(entry.itemId)}>
                  Повернути типовий
                </Button>
              ) : null}
            </div>
            <Textarea
              id={id}
              value={entry.text}
              rows={Math.min(6, Math.max(3, entry.text.split("\n").length))}
              onChange={(event) => setText(entry.itemId, event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
