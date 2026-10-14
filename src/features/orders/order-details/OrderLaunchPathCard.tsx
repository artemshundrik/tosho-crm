import { Check, Lock } from "@/components/icons/appIcons";
import { buildLaunchPath, type LaunchStep } from "@/features/orders/orderLaunchPath";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";

/**
 * «Шлях до запуску»: лише умови свого способу оплати (макет Main / Cash на
 * канві REQ-322). Унизу — умови замовлення одним рядком і «Змінити умови».
 */
function StepMark({ state }: { state: LaunchStep["state"] }) {
  if (state === "done") {
    return (
      <span className="tone-success inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
        <Check className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="tone-warning inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2">
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/50" />;
}

const STATE_LABEL: Record<LaunchStep["state"], string> = {
  done: "зроблено",
  current: "зараз",
  todo: "далі",
  locked: "закрито",
};

export function OrderLaunchPathCard({
  record,
  termsSummary,
  onEditTerms,
}: {
  record: DerivedOrderRecord;
  /** «Оплата 70/30 · Виробництво 50 р.д. · Поставка FCA, Київ». */
  termsSummary: { label: string; value: string }[];
  onEditTerms: (() => void) | null;
}) {
  const path = buildLaunchPath(record);

  return (
    <section className="rounded-xl border border-border/60 bg-card" aria-labelledby="order-launch-path-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground">Шлях до запуску</div>
          <h2 id="order-launch-path-heading" className="mt-0.5 text-sm font-semibold text-foreground">
            {path.heading}
          </h2>
        </div>
        {path.blocker ? (
          <span className="tone-warning rounded-md border px-2 py-0.5 text-xs font-semibold">{path.blocker}</span>
        ) : null}
      </div>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {path.steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              "flex flex-col gap-1 px-4 py-3",
              index > 0 && "border-t border-border/40 sm:border-l sm:border-t-0",
              step.state === "current" && "tone-warning-subtle"
            )}
          >
            <div className="flex items-center gap-2">
              <StepMark state={step.state} />
              <span className="text-sm font-semibold text-foreground">{step.title}</span>
              <span className="sr-only">— {STATE_LABEL[step.state]}</span>
            </div>
            <span className="text-xs text-muted-foreground">{step.note}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/50 bg-muted/20 px-4 py-2.5 text-xs">
        {termsSummary.map((item) => (
          <span key={item.label}>
            <span className="text-muted-foreground">{item.label} </span>
            <span className="font-semibold text-foreground">{item.value}</span>
          </span>
        ))}
        {onEditTerms ? (
          <button
            type="button"
            onClick={onEditTerms}
            className="ml-auto font-medium text-primary underline-offset-4 hover:underline"
          >
            Змінити умови
          </button>
        ) : null}
      </div>
    </section>
  );
}
