import * as React from "react";
import { Toaster } from "@/components/ui/sonner";

/**
 * Оболонка картки: світла й темна теми поруч, тим самим вмістом.
 * Темна — через клас `.dark`, як у застосунку; ніяких окремих токенів.
 *
 * Кожна тема — свій React-піддерево, тому стан (увімкнений чекбокс, вибраний
 * сегмент) у них незалежний: можна клацати в одній, а друга лишиться як є.
 */
export function Shell({ title, lede, children }: { title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 font-sans antialiased lg:grid-cols-2">
      <Pane theme="light" title={title} lede={lede}>
        {children}
      </Pane>
      <Pane theme="dark" title={title} lede={lede}>
        {children}
      </Pane>
    </div>
  );
}

function Pane({ theme, title, lede, children }: { theme: "light" | "dark"; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={theme === "dark" ? "dark bg-background text-foreground" : "bg-background text-foreground"}>
      <div className="px-7 pb-10 pt-7">
        <p className="mb-5 text-3xs uppercase tracking-[0.12em] text-muted-foreground">
          {theme === "dark" ? "Темна тема" : "Світла тема"} · справжні компоненти, усе клікається
        </p>
        <h1 className="text-lg font-semibold">{title}</h1>
        {lede ? <p className="mt-1 max-w-prose text-xs text-muted-foreground">{lede}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      <Toaster />
    </section>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mb-3 text-xs text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={"flex flex-wrap items-center gap-2 " + (className ?? "")}>{children}</div>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-3xs text-muted-foreground">{children}</p>;
}
