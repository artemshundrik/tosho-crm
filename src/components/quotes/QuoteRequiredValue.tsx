import { cn } from "@/lib/utils";

/**
 * Обовʼязкове поле шапки прорахунку — ЗНАЧЕННЯМ, а не похвалою (REQ-157#p2).
 *
 * У вікні редагування тут стояло зелене «Поле заповнено»: перевірити, ТОЙ
 * замовник обраний чи не той, було неможливо, — а незаданий дедлайн світився
 * червоним ще до того, як людина щось зробила. Тепер видно саме значення, а
 * червоним воно стає лише після невдалої спроби зберегти (`invalid`).
 *
 * Живе окремим модулем, бо `NewQuoteDialog` уже під ратчетом розміру.
 */
export function QuoteRequiredValue({
  label,
  value,
  emptyHint,
  invalid,
}: {
  label: string;
  /** Порожньо — значення ще не задане. */
  value: string | null;
  /** Що робити, коли порожньо: «Не обрано — оберіть у полі вгорі». */
  emptyHint: string;
  /** Уже тиснули «Зберегти», а поля немає. */
  invalid?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-sm",
          value
            ? "border-border/50 bg-muted/20 font-medium text-foreground"
            : invalid
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-border/50 bg-muted/20 text-muted-foreground"
        )}
      >
        {value || emptyHint}
      </div>
    </div>
  );
}
