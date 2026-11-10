import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SpecificationItemTextsState } from "@/features/orders/order-details/useSpecificationItemTexts";
import {
  parseSpecTemplate,
  PRINTABLE_SPEC_TEMPLATES,
  SPEC_TEMPLATE_LABELS,
  specTemplateWarning,
} from "@/features/orders/specTemplate";

const DESCRIPTIONS = {
  merch: "Шаблон № 31: позиція одним абзацом",
  print: "Позиція рядками за частинами виробу",
  design: "Роботи й послуги: одиниці, оплата 100%, передання файлів",
} as const;

/**
 * «Вид специфікації» (REQ-358) — у вікні параметрів СП. CRM підказує вид за
 * позиціями; менеджер може змінити. Змішане замовлення лише попереджаємо:
 * Влад просить окремі СП, а розділити позиції можна при створенні замовлень.
 */
export function SpecificationTemplateField({ state }: { state: SpecificationItemTextsState }) {
  const { template, setTemplate, texts, loading } = state;
  const warning = specTemplateWarning(texts, template);
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <Label htmlFor="spec-template">Вид специфікації</Label>
      <Select
        value={template}
        disabled={loading}
        onValueChange={(value) => {
          const next = parseSpecTemplate(value);
          if (next) setTemplate(next);
        }}
      >
        <SelectTrigger id="spec-template">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRINTABLE_SPEC_TEMPLATES.map((key) => (
            <SelectItem key={key} value={key} description={DESCRIPTIONS[key as keyof typeof DESCRIPTIONS]}>
              {SPEC_TEMPLATE_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {warning ? (
        <p className="text-xs tone-text-warning">{warning}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Підказано за позиціями; від виду залежить текст СП.</p>
      )}
    </div>
  );
}
