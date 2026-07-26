import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { loadPayDefaults, loadPayRates, type DesignerPayDefaults, type DesignerPayRate } from "@/lib/designerPayroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CONTROL_BASE } from "@/components/ui/controlStyles";

/**
 * Вкладка «Оплата» в картці співробітника (тільки owner/SEO).
 *
 * Модель: docs/DESIGNER_PAYROLL_DESIGN.md
 *
 * Свідомі рішення:
 *  · Ставка НЕ редагується заднім числом. Нова ставка — це новий рядок із
 *    `effective_from` = 1 число наступного місяця (стандартна HR-практика:
 *    поточний місяць уже частково відпрацьований). Тому форма не «зберігає
 *    зміни», а «призначає нову ставку з дати».
 *  · Історія лишається видимою — видно, коли і на що змінювали.
 *  · Дизайнер-специфічні поля (норма візуалів, ставка понад норму) показуємо
 *    лише дизайнерам: для менеджера вони порожні й лише плутали б.
 */

const nextMonthFirstDay = () => {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

const formatUah = (value: number) => `${Math.round(value).toLocaleString("uk-UA")} ₴`;

export function MemberPaySection({
  workspaceId,
  userId,
  memberName,
  isDesigner,
  canEdit,
}: {
  workspaceId: string | null;
  userId: string;
  memberName: string;
  isDesigner: boolean;
  canEdit: boolean;
}) {
  const { userId: currentUserId } = useAuth();
  const [rates, setRates] = useState<DesignerPayRate[]>([]);
  const [defaults, setDefaults] = useState<DesignerPayDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseRate, setBaseRate] = useState("");
  const [visualNorm, setVisualNorm] = useState("");
  const [overNormRate, setOverNormRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthFirstDay);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [nextRates, nextDefaults] = await Promise.all([
        loadPayRates(workspaceId, userId),
        loadPayDefaults(workspaceId),
      ]);
      setRates(nextRates);
      setDefaults(nextDefaults);
    } catch (loadError) {
      console.warn("Failed to load pay rates", loadError);
      setError("Не вдалося завантажити ставки");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Чинна зараз ставка — найпізніша з тих, що вже набрали чинності.
  const todayIso = new Date().toISOString().slice(0, 10);
  const current = useMemo(
    () => rates.filter((rate) => rate.effectiveFrom <= todayIso)[0] ?? null,
    [rates, todayIso]
  );
  const scheduled = useMemo(
    () => rates.filter((rate) => rate.effectiveFrom > todayIso).slice().reverse(),
    [rates, todayIso]
  );

  const submit = async () => {
    if (!workspaceId || !canEdit) return;
    const base = Number(baseRate.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(base) || base < 0) {
      setError("Вкажіть коректну ставку");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        workspace_id: workspaceId,
        user_id: userId,
        base_month_rate: base,
        effective_from: effectiveFrom,
        created_by: currentUserId,
        // Порожнє поле = «беремо командний дефолт», а не нуль.
        visual_norm: isDesigner && visualNorm.trim() ? Number(visualNorm) : null,
        over_norm_rate: isDesigner && overNormRate.trim() ? Number(overNormRate) : null,
      };
      const { error: upsertError } = await supabase
        .schema("tosho")
        .from("employee_pay_rates" as never)
        .upsert(payload as never, { onConflict: "workspace_id,user_id,effective_from" });
      if (upsertError) throw upsertError;
      setBaseRate("");
      setVisualNorm("");
      setOverNormRate("");
      await reload();
    } catch (saveError) {
      console.warn("Failed to save pay rate", saveError);
      setError("Не вдалося зберегти ставку. Перевірте права доступу.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background/70 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Завантажуємо ставки…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Чинна ставка</span>
        </div>
        {current ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-foreground">{formatUah(current.baseMonthRate)}</span>
            <span className="text-xs text-muted-foreground">на місяць, до оподаткування</span>
            <span className="w-full text-xs text-muted-foreground">діє з {formatDate(current.effectiveFrom)}</span>
            {isDesigner && defaults ? (
              <span className="w-full text-xs text-muted-foreground">
                Норма візуалів: {current.visualNorm ?? defaults.visualNorm}
                {current.visualNorm == null ? " (командна)" : " (індивідуальна)"} · понад норму{" "}
                {current.overNormRate ?? defaults.overNormRate} ₴/візуал
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Ставку ще не призначено — {memberName} не входить у систему оплати, і віджет заробітку не показується.
          </div>
        )}

        {scheduled.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1 rounded-[var(--radius)] border border-info-soft-border bg-info-soft/40 px-3 py-2">
            {scheduled.map((rate) => (
              <div key={rate.effectiveFrom} className="flex items-center gap-2 text-xs text-info-foreground">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Заплановано {formatUah(rate.baseMonthRate)} з {formatDate(rate.effectiveFrom)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
          <div className="mb-1 text-sm font-semibold text-foreground">Призначити нову ставку</div>
          <p className="mb-4 text-xs text-muted-foreground">
            Ставка не змінюється заднім числом: нова діє з обраної дати, стара лишається в історії.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Базова ставка, ₴/міс</Label>
              <Input
                value={baseRate}
                onChange={(event) => setBaseRate(event.target.value)}
                inputMode="numeric"
                placeholder={current ? String(current.baseMonthRate) : "40000"}
                className={cn(CONTROL_BASE, "h-11")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Діє з</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className={cn(CONTROL_BASE, "h-11")}
              />
              <p className="text-2xs text-muted-foreground">
                Зазвичай — 1 число наступного місяця (поточний уже частково відпрацьовано).
              </p>
            </div>

            {isDesigner ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Норма візуалів / міс</Label>
                  <Input
                    value={visualNorm}
                    onChange={(event) => setVisualNorm(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.visualNorm} (командна)` : "250"}
                    className={cn(CONTROL_BASE, "h-11")}
                  />
                  <p className="text-2xs text-muted-foreground">Порожньо — береться командна норма.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Понад норму, ₴/візуал</Label>
                  <Input
                    value={overNormRate}
                    onChange={(event) => setOverNormRate(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.overNormRate} (командна)` : "100"}
                    className={cn(CONTROL_BASE, "h-11")}
                  />
                </div>
              </>
            ) : null}
          </div>

          {error ? <div className="mt-3 text-xs text-danger-foreground">{error}</div> : null}

          <div className="mt-4 flex items-center gap-2">
            <Button type="button" onClick={submit} disabled={saving || !baseRate.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Призначити ставку
            </Button>
            {!isDesigner ? (
              <span className="text-2xs text-muted-foreground">
                Для не-дизайнерів рахується лише базова частина за робочими днями.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {rates.length > 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Історія ставок</div>
          <div className="flex flex-col divide-y divide-border/50">
            {rates.map((rate) => (
              <div key={rate.effectiveFrom} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-semibold tabular-nums text-foreground">{formatUah(rate.baseMonthRate)}</span>
                <span className="text-xs text-muted-foreground">з {formatDate(rate.effectiveFrom)}</span>
                {rate.effectiveFrom === current?.effectiveFrom ? (
                  <span className="ml-auto rounded-full border border-success-soft-border bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success-foreground">
                    чинна
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
