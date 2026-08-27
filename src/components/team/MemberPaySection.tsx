import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { loadPayDefaults, loadPayRates, type DesignerPayDefaults, type DesignerPayRate } from "@/lib/designerPayroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CONTROL_BASE } from "@/components/ui/controlStyles";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

/**
 * Вкладка «Оплата» в картці співробітника (тільки owner/CEO).
 *
 * Модель: docs/DESIGNER_PAYROLL_DESIGN.md
 *
 * Свідомі рішення:
 *  · Ставка НЕ редагується заднім числом. Нова ставка — це новий рядок із
 *    `effective_from` = 1 число наступного місяця (стандартна HR-практика:
 *    поточний місяць уже частково відпрацьований). Тому форма не «зберігає
 *    зміни», а «призначає нову ставку з дати».
 *  · Історія лишається видимою — видно, коли і на що змінювали.
 *  · Заплановану ставку (дата в майбутньому) МОЖНА скасувати, минулу й чинну —
 *    ні. Заплановане ще нікого не стосується: воно не лягло в жодну виплату й
 *    існує лише як намір, тож помилку в намірі треба вміти прибрати. Минуле й
 *    чинне вже пораховані у виплатах, і видалення переписало б історію грошей.
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

/**
 * Ставка діє строго з 1 числа місяця.
 *
 * Це не побажання інтерфейсу, а CHECK у базі (employee_pay_rates_first_of_month):
 * зарплата рахується помісячно, і дата всередині місяця розірвала б розрахунок.
 * Раніше форма дозволяла обрати будь-який день — база відбивала запис, а
 * користувач бачив «Перевірте права доступу» й ішов шукати неіснуючу проблему
 * з доступами. Тепер день підтягується до 1 числа обраного місяця.
 */
/**
 * Людське пояснення відмови бази.
 *
 * НАВІЩО. Раніше будь-який збій — порушення CHECK, обрив мережі, справжня
 * відмова RLS — ставав одним рядком «Перевірте права доступу». Саме він
 * відправив СЕО шукати неіснуючу проблему з доступами, хоча база відбивала
 * запис через дату всередині місяця. Повідомлення, яке ВГАДУЄ причину, гірше
 * за те, яке чесно каже, чого не знає.
 */
const describeWriteError = (error: unknown, fallback: string) => {
  const code = (error as { code?: string } | null)?.code;
  // 23514 — check_violation, 42501 — RLS не пустила.
  if (code === "23514") return "База відхилила ставку: діяти вона може лише з 1 числа місяця.";
  if (code === "42501") return "Бракує прав на зміну ставок — це може робити власник або СЕО.";
  return fallback;
};

const firstOfMonth = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 7)}-01` : iso);

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
  const [visualNormPerDay, setVisualNormPerDay] = useState("");
  const [layoutNormPerDay, setLayoutNormPerDay] = useState("");
  const [visualOverRate, setVisualOverRate] = useState("");
  const [layoutOverRate, setLayoutOverRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthFirstDay);
  const [pendingCancel, setPendingCancel] = useState<DesignerPayRate | null>(null);
  const [cancelling, setCancelling] = useState(false);

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
      // Порожнє поле = «беремо командний дефолт», а не нуль.
      const override = (value: string) => (isDesigner && value.trim() ? Number(value) : null);
      const payload: Record<string, unknown> = {
        workspace_id: workspaceId,
        user_id: userId,
        base_month_rate: base,
        effective_from: firstOfMonth(effectiveFrom),
        created_by: currentUserId,
        visual_norm_per_day: override(visualNormPerDay),
        layout_norm_per_day: override(layoutNormPerDay),
        visual_over_rate: override(visualOverRate),
        layout_over_rate: override(layoutOverRate),
      };
      const { error: upsertError } = await supabase
        .schema("tosho")
        .from("employee_pay_rates" as never)
        .upsert(payload as never, { onConflict: "workspace_id,user_id,effective_from" });
      if (upsertError) throw upsertError;
      setBaseRate("");
      setVisualNormPerDay("");
      setLayoutNormPerDay("");
      setVisualOverRate("");
      setLayoutOverRate("");
      await reload();
    } catch (saveError) {
      console.warn("Failed to save pay rate", saveError);
      setError(describeWriteError(saveError, "Не вдалося зберегти ставку. Спробуйте ще раз."));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Скасувати заплановану ставку.
   *
   * ЧОМУ ЦЕ НЕ «ВИДАЛЕННЯ ІСТОРІЇ». Прибрати можна лише рядок із датою в
   * майбутньому — той, що ще не набрав чинності. Без цього помилка спрацьовувала
   * сама: помилкові 30 000 ₴ з 1 вересня не було чим скасувати, і за п'ять днів
   * людині мовчки зрізало б зарплату. Дата в минулому чи сьогоднішня вже
   * порахована у виплатах — там єдиний правильний шлях лишається той самий:
   * нова ставка з новою датою.
   */
  const cancelScheduled = async (rate: DesignerPayRate) => {
    if (!workspaceId || !canEdit) return;
    // Захист на випадок, якщо вкладка провисіла до дати набрання чинності.
    if (rate.effectiveFrom <= todayIso) {
      setError("Ця ставка вже набрала чинності — її не скасувати, признач нову з новою датою.");
      setPendingCancel(null);
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      // .select() тут не заради даних, а заради доказу: delete без нього мовчить
      // однаково і коли рядок зник, і коли його не пустила RLS.
      const { data: removed, error: deleteError } = await supabase
        .schema("tosho")
        .from("employee_pay_rates" as never)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("effective_from", rate.effectiveFrom)
        .select("effective_from");
      if (deleteError) throw deleteError;
      if (!removed || removed.length === 0) {
        setError("Ставку не скасовано — схоже, бракує прав. Онови сторінку й спробуй ще раз.");
        return;
      }
      setPendingCancel(null);
      await reload();
    } catch (cancelError) {
      console.warn("Failed to cancel scheduled pay rate", cancelError);
      setError(describeWriteError(cancelError, "Не вдалося скасувати заплановану ставку. Спробуйте ще раз."));
    } finally {
      setCancelling(false);
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
                Норма на робочий день: {current.visualNormPerDay ?? defaults.visualNormPerDay} візуалів ·{" "}
                {current.layoutNormPerDay ?? defaults.layoutNormPerDay} макетів
                {current.visualNormPerDay == null && current.layoutNormPerDay == null
                  ? " (командна)"
                  : " (індивідуальна)"}
                . Понад норму: {current.visualOverRate ?? defaults.visualOverRate} ₴/візуал ·{" "}
                {current.layoutOverRate ?? defaults.layoutOverRate} ₴/макет
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
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setPendingCancel(rate)}
                    className="ml-auto shrink-0 font-medium text-info-foreground underline decoration-info-foreground/40 underline-offset-2 hover:decoration-info-foreground"
                  >
                    Скасувати
                  </button>
                ) : null}
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
            Якщо обрати дату, на яку ставка вже є, вона перезапишеться.
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
              <DateInput
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(firstOfMonth(event.target.value))}
                className={cn(CONTROL_BASE, "h-11")}
              />
              <p className="text-2xs text-muted-foreground">
                Тільки 1 число місяця — будь-який інший день підтягнеться до нього. Зазвичай беруть
                наступний місяць: поточний уже частково відпрацьовано.
              </p>
            </div>

            {isDesigner ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Норма візуалів / день</Label>
                  <Input
                    value={visualNormPerDay}
                    onChange={(event) => setVisualNormPerDay(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.visualNormPerDay} (командна)` : "8"}
                    className={cn(CONTROL_BASE, "h-11")}
                  />
                  <p className="text-2xs text-muted-foreground">
                    Порожньо — береться командна норма. Множиться на робочі дні місяця за вирахуванням
                    відпустки й лікарняних.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Норма макетів / день</Label>
                  <Input
                    value={layoutNormPerDay}
                    onChange={(event) => setLayoutNormPerDay(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.layoutNormPerDay} (командна)` : "5"}
                    className={cn(CONTROL_BASE, "h-11")}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Понад норму, ₴/візуал</Label>
                  <Input
                    value={visualOverRate}
                    onChange={(event) => setVisualOverRate(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.visualOverRate} (командна)` : "100"}
                    className={cn(CONTROL_BASE, "h-11")}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Понад норму, ₴/макет</Label>
                  <Input
                    value={layoutOverRate}
                    onChange={(event) => setLayoutOverRate(event.target.value)}
                    inputMode="numeric"
                    placeholder={defaults ? `${defaults.layoutOverRate} (командна)` : "200"}
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
                ) : rate.effectiveFrom > todayIso ? (
                  <span className="ml-auto rounded-full border border-info-soft-border bg-info-soft px-2 py-0.5 text-3xs font-semibold text-info-foreground">
                    заплановано
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
        title="Скасувати заплановану ставку?"
        description={
          pendingCancel
            ? `${formatUah(pendingCancel.baseMonthRate)} з ${formatDate(pendingCancel.effectiveFrom)} для ${memberName} не набере чинності. Чинна ставка не зміниться.`
            : null
        }
        confirmLabel="Скасувати ставку"
        cancelLabel="Залишити"
        loading={cancelling}
        onConfirm={() => {
          if (pendingCancel) void cancelScheduled(pendingCancel);
        }}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      />
    </div>
  );
}
