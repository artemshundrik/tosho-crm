import { useState } from "react";

import { Check, Clock, Lock } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

/**
 * «Попросити дозвіл запустити без …» (REQ-322#p8). Причина обов'язкова: її
 * бачать двоє СЕО й головбух у сповіщенні, а рішення лишається в стрічці.
 */
function LaunchExceptionFooter({
  path,
  busy,
  onRequest,
}: {
  path: ReturnType<typeof buildLaunchPath>;
  busy: boolean;
  onRequest: (note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const exception = path.exception;
  const what = path.missing.join(", ");

  if (exception?.status === "pending") {
    return (
      <div className="flex items-center gap-1.5 border-t border-border/50 px-4 py-2.5 text-xs font-medium tone-text-info">
        <Clock className="h-3.5 w-3.5" />
        Попросили дозволу запустити без {what} — чекає рішення СЕО або головбуха
      </div>
    );
  }
  if (exception?.status === "approved") {
    return (
      <div className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tone-text-success font-medium">Запуск без {what || "умов"} дозволено</span>
        {exception.decisionNote ? ` · «${exception.decisionNote}»` : ""}
      </div>
    );
  }
  if (!path.blocker || path.missing.length === 0) return null;

  return (
    <div className="border-t border-border/50 px-4 py-2.5 text-xs">
      {exception?.status === "returned" ? (
        <div className="mb-1.5 tone-text-warning">Відмовили: {exception.decisionNote ?? "без коментаря"}</div>
      ) : null}
      {open ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            autoFocus
            aria-label="Чому запускаємо без умов"
            placeholder="Чому запускаємо зараз — напр.: постійний клієнт, оплата завтра, СП підпише в понеділок"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Скасувати
            </Button>
            <Button
              size="sm"
              disabled={!note.trim() || busy}
              onClick={async () => {
                if (await onRequest(note)) setOpen(false);
              }}
            >
              Попросити дозвіл
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Попросити дозвіл запустити без {what}
        </button>
      )}
    </div>
  );
}

export function OrderLaunchPathCard({
  record,
  termsSummary,
  onEditTerms,
  exceptionBusy,
  onRequestException,
}: {
  record: DerivedOrderRecord;
  /** «Оплата 70/30 · Виробництво 50 р.д. · Поставка FCA, Київ». */
  termsSummary: { label: string; value: string }[];
  onEditTerms: (() => void) | null;
  exceptionBusy: boolean;
  /** null — незбережений запис: просити дозвіл ще нема на чому. */
  onRequestException: ((note: string) => Promise<boolean>) | null;
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
      {onRequestException ? (
        <LaunchExceptionFooter path={path} busy={exceptionBusy} onRequest={onRequestException} />
      ) : null}
    </section>
  );
}
