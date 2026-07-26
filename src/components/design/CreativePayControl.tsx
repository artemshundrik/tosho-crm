import { useEffect, useState } from "react";
import { BadgeDollarSign, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { creativePayout } from "@/lib/designerPayrollMath";

/**
 * Оплата креативу — кнопка в шапці дизайн-задачі (тільки для типу «Креатив»).
 *
 * Модель: docs/DESIGNER_PAYROLL_DESIGN.md
 * Ставить менеджер: платний/безкоштовний + вартість проєкту. Дизайнер отримає
 * відсоток від цієї суми, але **тільки після переведення задачі в «Затверджено»** —
 * тому в прев'ю пишемо «отримає після затвердження», а не «отримав».
 *
 * Сам відсоток і ставки лишаються в закритих payroll-таблицях; сюди він
 * приходить пропсом (менеджер бачить лише результат для цієї задачі).
 */

const formatUah = (value: number) => `${Math.round(value).toLocaleString("uk-UA")} ₴`;

export function CreativePayControl({
  paid,
  projectCost,
  creativePercent,
  minCreativeCost,
  disabled,
  saving,
  onSave,
}: {
  paid: boolean;
  projectCost: number | null;
  /** null — умови ще не завантажені (немає дефолтів); прев'ю тоді не показуємо. */
  creativePercent: number | null;
  minCreativeCost: number | null;
  disabled?: boolean;
  saving?: boolean;
  onSave: (next: { paid: boolean; projectCost: number | null }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draftPaid, setDraftPaid] = useState(paid);
  const [draftCost, setDraftCost] = useState(projectCost ? String(projectCost) : "");

  // Синхронізуємо чернетку, коли задача оновилась ззовні (інший користувач).
  useEffect(() => {
    if (open) return;
    setDraftPaid(paid);
    setDraftCost(projectCost ? String(projectCost) : "");
  }, [open, paid, projectCost]);

  const parsedCost = Number(draftCost.replace(/\s/g, "").replace(",", "."));
  const costValid = Number.isFinite(parsedCost) && parsedCost > 0;
  const belowMin = costValid && minCreativeCost != null && parsedCost < minCreativeCost;
  const payout = costValid && creativePercent != null ? creativePayout(parsedCost, creativePercent) : null;

  const submit = async () => {
    if (draftPaid && !costValid) return;
    await onSave({ paid: draftPaid, projectCost: draftPaid ? parsedCost : null });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2.5 text-xs",
            paid && "border-success-soft-border bg-success-soft text-success-foreground"
          )}
          disabled={disabled}
        >
          <BadgeDollarSign className="h-3.5 w-3.5" />
          {paid && projectCost ? `Платний · ${formatUah(projectCost)}` : "Безкоштовний"}
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        <div className="text-sm font-semibold text-foreground">Оплата креативу</div>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          Дизайнер отримає відсоток від вартості після переведення задачі в «Затверджено».
        </p>

        <div className="mt-3 flex gap-1.5">
          <Button
            type="button"
            variant={draftPaid ? "outline" : "primary"}
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => setDraftPaid(false)}
          >
            {!draftPaid ? <Check className="h-3.5 w-3.5" /> : null}
            Безкоштовний
          </Button>
          <Button
            type="button"
            variant={draftPaid ? "primary" : "outline"}
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => setDraftPaid(true)}
          >
            {draftPaid ? <Check className="h-3.5 w-3.5" /> : null}
            Платний
          </Button>
        </div>

        {draftPaid ? (
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Вартість проєкту, ₴</Label>
            <Input
              value={draftCost}
              onChange={(event) => setDraftCost(event.target.value)}
              inputMode="numeric"
              placeholder={minCreativeCost ? String(minCreativeCost) : "4500"}
              className="h-9"
              autoFocus
            />
            {belowMin ? (
              <p className="text-2xs text-warning-foreground">
                Менше за мінімум {formatUah(minCreativeCost!)} — перевірте суму.
              </p>
            ) : null}
            {payout != null ? (
              <p className="text-2xs text-muted-foreground">
                Дизайнер отримає <span className="font-semibold text-foreground">{formatUah(payout)}</span> ({creativePercent}%)
                після затвердження.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-2xs text-muted-foreground">
            Безкоштовний креатив зараховується в норму візуалів, але грошей не додає.
          </p>
        )}

        <Button
          type="button"
          size="sm"
          className="mt-3 h-8 w-full text-xs"
          disabled={saving || (draftPaid && !costValid)}
          onClick={() => void submit()}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Зберегти
        </Button>
      </PopoverContent>
    </Popover>
  );
}
