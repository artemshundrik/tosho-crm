import * as React from "react";

import { ArrowRight, Copy, FileSpreadsheet, HelpCircle } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HoverTip } from "@/components/ui/hover-tip";

import { HoroshopGuideLink, SiteListingHoroshopSteps } from "./SiteListingHoroshopSteps";

/**
 * «Як це працює» в шапці блоку «На сайт» (REQ-311#p19): чотири кроки від
 * «Беремо» до товару на сайті. Кожен — схема з тими самими кнопками, що в
 * блоці, і підпис на рядок: Артем просив «красиво й зрозуміло» і без полотна.
 *
 * Перший раз відкривається само. Позначка — у localStorage цього браузера:
 * це зручність, а не стан, який мусить пережити все. Сховище недоступне
 * (приватне вікно) — вважаємо, що бачили: інакше вікно лізло б щоразу.
 */

const SEEN_KEY = "tosho:site-listing-guide-seen";

function wasSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Нема куди записати — наступного разу просто не відкриється само.
  }
}

/** Сіра смужка замість тексту на схемі. */
const Bar = ({ className }: { className: string }) => <span className={`block h-1.5 rounded-full ${className}`} />;

/** Площадка під схему: однакова висота, щоб підписи стояли в лінію. */
const Scene = ({ children }: { children: React.ReactNode }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none flex h-28 items-center justify-center rounded-lg bg-muted/40 px-3 select-none"
  >
    {children}
  </div>
);

const TILE_COLORS = ["#1f2a44", "#c8333a", "#f1efe8", "#e8b923"];

const STEPS: Array<{ key: string; title: string; caption: React.ReactNode; scene: React.ReactNode }> = [
  {
    key: "take",
    title: "Беремо",
    caption: "у «Нових»",
    scene: (
      <span className="flex w-full max-w-[260px] items-center gap-2 rounded-lg bg-card px-2 py-1.5 ring-1 ring-border/60">
        <span className="h-7 w-7 shrink-0 rounded-md bg-muted" />
        <span className="flex-1 space-y-1">
          <Bar className="w-20 bg-muted-foreground/30" />
          <Bar className="w-12 bg-muted-foreground/15" />
        </span>
        <Button size="xs" variant="primary" tabIndex={-1}>
          Беремо
        </Button>
      </span>
    ),
  },
  {
    key: "draft",
    title: "Чернетка",
    caption: "~20 с, перевірити",
    scene: (
      <span className="flex w-full max-w-[260px] flex-col gap-2 rounded-lg bg-card p-2 ring-1 ring-border/60">
        <span className="flex gap-1.5">
          {TILE_COLORS.map((color) => (
            <span
              key={color}
              className="h-8 flex-1 rounded-md ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
        <span className="flex items-center gap-1.5">
          <Bar className="w-24 bg-muted-foreground/30" />
          <Bar className="w-10 bg-muted-foreground/15" />
        </span>
      </span>
    ),
  },
  {
    key: "file",
    title: "Файл",
    caption: "зібрати, скопіювати посилання",
    scene: (
      <span className="flex items-center gap-2">
        <Button size="xs" variant="primary" tabIndex={-1}>
          <FileSpreadsheet aria-hidden="true" />
          Зібрати файл
        </Button>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-2xs text-muted-foreground ring-1 ring-border/60">
          …/site-listing.xlsx
          <Copy className="h-3 w-3" aria-hidden="true" />
        </span>
      </span>
    ),
  },
];

export function SiteListingGuide() {
  const [open, setOpen] = React.useState(() => !wasSeen());

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) markSeen();
  };

  return (
    <>
      <HoverTip label="Як це працює" asChild>
        <Button size="iconXs" variant="ghost" aria-label="Як це працює" onClick={() => setOpen(true)}>
          <HelpCircle aria-hidden="true" />
        </Button>
      </HoverTip>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dismissible aria-describedby={undefined} className="max-w-[720px]">
          <DialogTitle className="text-base">Як це працює</DialogTitle>
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
            <ol className="grid gap-3 sm:grid-cols-2">
              {STEPS.map((step, index) => (
                <li key={step.key} className="space-y-2">
                  <StepCaption index={index} title={step.title}>
                    {step.caption}
                  </StepCaption>
                  <Scene>{step.scene}</Scene>
                </li>
              ))}
              {/* Хорошоп — не схема, а самі кроки: площадка росте під них, а
                  номер і назва над нею, тож картки поруч не розлазяться. */}
              <li className="space-y-2">
                <StepCaption index={STEPS.length} title="Хорошоп">
                  імпорт прихованими
                </StepCaption>
                <div className="flex min-h-28 flex-col justify-center gap-2 rounded-lg bg-muted/40 px-3 py-3">
                  <SiteListingHoroshopSteps />
                  <HoroshopGuideLink className="ml-5" />
                </div>
              </li>
            </ol>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" onClick={() => onOpenChange(false)}>
              Зрозуміло
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StepCaption({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-0.5 text-xs">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-2xs font-semibold text-background">
        {index + 1}
      </span>
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-muted-foreground">· {children}</span>
    </p>
  );
}
