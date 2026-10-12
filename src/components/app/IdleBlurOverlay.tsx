import { useCallback, useEffect, useState } from "react";
import { EyeOff } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Розмитий екран, коли людина відійшла (REQ-331#p4).
 *
 * ЩО РОБИТЬ. Після 10 хв без руху мишки, клавіатури, прокрутки чи дотику CRM
 * ховається під сильне розмиття з кнопкою «Продовжити працювати в CRM» — щоб
 * дані з відкритої вкладки не читав той, хто проходить повз стіл.
 *
 * ЧОГО НЕ РОБИТЬ, І ЦЕ НАВМИСНО. Не виходить із системи й не скидає стан: усе
 * введене лишається під розмиттям. На облік часу не впливає — той рахує рух
 * незалежно (useWorkspacePresenceState → record_activity_minute), і поріг у
 * 10 хв там той самий, тож «перерва» у ранковому звіті й розмиття збігаються.
 *
 * ЧОМУ ЗНІМАЄТЬСЯ ЛИШЕ КНОПКОЮ, а не першим рухом мишки: так домовились із
 * власником — інакше будь-хто, хто торкнувся мишки, бачить екран.
 *
 * КІЛЬКА ВКЛАДОК. Остання активність спільна через localStorage: працюєш в
 * одній вкладці — сусідня, видима на другому моніторі, не розмивається.
 *
 * ТЕЛЕФОН — без розмиття. Його блокує сама система, а CRM на телефоні
 * відкривають на хвилину, і після кожної паузи впиратись у кнопку — шум.
 */

export const IDLE_BLUR_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 20_000;
/** Писати в localStorage на кожен pointermove — зайве; спільна позначка грубіша. */
const SHARE_EVERY_MS = 15_000;
const STORAGE_KEY = "tosho:last-input-at";
const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Приватний режим чи заблоковане сховище: працюємо в межах однієї вкладки.
  }
}

function isFinePointer(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;
}

export function useIdleBlur(idleMs = IDLE_BLUR_MS): { locked: boolean; unlock: () => void } {
  const [locked, setLocked] = useState(false);
  const [enabled] = useState(isFinePointer);

  useEffect(() => {
    if (!enabled) return;
    let lastInput = Date.now();
    let lastShared = 0;

    const onInput = () => {
      lastInput = Date.now();
      if (lastInput - lastShared >= SHARE_EVERY_MS) {
        lastShared = lastInput;
        writeShared(lastInput);
      }
    };

    const evaluate = () => {
      if (document.visibilityState !== "visible") return;
      const last = Math.max(lastInput, readShared());
      if (Date.now() - last >= idleMs) setLocked(true);
    };

    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });
    window.addEventListener("scroll", onInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", evaluate);
    const id = window.setInterval(evaluate, CHECK_EVERY_MS);
    writeShared(lastInput);

    return () => {
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput);
      window.removeEventListener("scroll", onInput, { capture: true });
      document.removeEventListener("visibilitychange", evaluate);
      window.clearInterval(id);
    };
  }, [enabled, idleMs]);

  const unlock = useCallback(() => {
    writeShared(Date.now());
    setLocked(false);
  }, []);

  return { locked, unlock };
}

export function IdleBlurOverlay() {
  const { locked, unlock } = useIdleBlur();

  return (
    <Dialog open={locked}>
      <DialogContent
        hideClose
        isDirty={false}
        overlayClassName="bg-background/70 backdrop-blur-3xl"
        className="max-w-sm items-center gap-3 text-center sm:p-6"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          // Кнопка у фокусі — повернувся, натиснув Enter, працюєш.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>("button")?.focus();
        }}
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <EyeOff className="h-5 w-5" aria-hidden />
        </span>
        <DialogTitle className="text-lg">CRM приховано</DialogTitle>
        <DialogDescription>
          10 хвилин не було руху — екран сховано від сторонніх очей. Усе, що ви робили, на місці.
        </DialogDescription>
        <Button className="mt-1 w-full" onClick={unlock}>
          Продовжити працювати в CRM
        </Button>
      </DialogContent>
    </Dialog>
  );
}
