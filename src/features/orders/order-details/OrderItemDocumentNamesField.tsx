import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { itemDocumentName } from "@/features/orders/orderItemDocumentNames";
import { saveOrderItemDocumentNames } from "@/features/orders/orderItemDocumentNamesQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

/**
 * «Назва в документах» на кожну позицію (REQ-322#p38): менеджер задає у вкладці
 * «Позиції», бухгалтер виправляє в запиті рахунку. Одна назва на рахунок, СП і
 * акт — у BAS номенклатура має збігатись у всіх документах.
 */
export function OrderItemDocumentNamesField({
  record,
  teamId,
  onSaved,
}: {
  record: DerivedOrderRecord;
  teamId: string | null | undefined;
  onSaved: (names: Map<string, string | null>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const valueOf = (item: DerivedOrderRecord["items"][number]) => drafts[item.id] ?? itemDocumentName(item);
  const changed = record.items.filter((item) => drafts[item.id] !== undefined && valueOf(item).trim() !== itemDocumentName(item));
  // Замовлення з прорахунку без власних позицій у базі — назву нікуди записати.
  const editable = record.source === "stored" && Boolean(teamId);

  if (record.items.length === 0) return null;

  const save = async () => {
    if (!teamId || changed.length === 0) return;
    setSaving(true);
    try {
      const saved = await saveOrderItemDocumentNames(
        teamId,
        changed.map((item) => ({ itemId: item.id, name: item.name, value: valueOf(item) }))
      );
      onSaved(saved);
      setDrafts({});
      toast.success("Назви в документах збережено");
    } catch {
      toast.error("Не вдалося зберегти назви в документах");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-foreground">Назва в документах</div>
        <p className="text-xs text-muted-foreground">
          Так позиція стоятиме в рахунку, СП і акті — як номенклатура в BAS, напр. «Ніж з логотипом».
        </p>
      </div>
      {record.items.map((item, index) => (
        <div key={item.id} className="grid gap-1">
          <label htmlFor={`item-document-name-${item.id}`} className="truncate text-xs text-muted-foreground">
            {index + 1}. {item.name}
          </label>
          <Input
            id={`item-document-name-${item.id}`}
            value={valueOf(item)}
            disabled={!editable || saving}
            onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
          />
        </div>
      ))}
      {changed.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDrafts({})} disabled={saving}>
            Скасувати
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Збереження..." : "Зберегти назви"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
