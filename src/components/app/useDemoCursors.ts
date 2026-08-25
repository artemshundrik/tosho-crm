import { useEffect, useState } from "react";

import type { LiveCursor } from "@/components/app/live-cursors";

/**
 * ПРИВИДИ — щоб подивитись на курсори колег, коли колег поруч немає (REQ-163).
 *
 * НАВІЩО ОКРЕМИЙ ФАЙЛ. Це показ, а не робота: він вмикається рядком в адресі
 * (`?cursors=demo`) і не має жодного стосунку до справжньої присутності. Тримати
 * його поруч із бойовим кодом означало б рано чи пізно ввімкнути випадково.
 *
 * ЧОМУ РУХ САМЕ ТАКИЙ. Привид не їде по прямій і не крутиться безперервно: він
 * вибирає точку, доїжджає до неї сповільнюючись, стоїть секунду-другу й вибирає
 * наступну. Рівний механічний рух одразу видно як підробку, а на такому вже
 * можна чесно судити, як воно виглядатиме з живими людьми.
 *
 * Випадковість тут навмисно СВОЯ, а не Math.random: із власним лічильником показ
 * однаковий щоразу, і порівнювати варіанти вигляду можна на тому самому русі.
 */

const DEMO_PEOPLE = [
  { id: "demo-olena", name: "Олена К." },
  { id: "demo-maksym", name: "Максим В." },
  { id: "demo-iryna", name: "Ірина Л." },
  { id: "demo-bohdan", name: "Богдан П." },
];

/**
 * Скільки привид відпочиває на картці, перш ніж рушити далі.
 *
 * Довше, ніж у першому заході (0.7–2.2 с): люди не бігають по дошці без упину,
 * вони зупиняються почитати. З короткими паузами показ виглядав метушнею.
 */
const PAUSE_MIN_MS = 1800;
const PAUSE_MAX_MS = 5200;

/** Частка шляху, яку привид долає за кадр: менше — повільніше й плавніше. */
const EASE = 0.022;

/** Проста детермінована псевдовипадковість — щоб показ повторювався. */
function makeRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

type Ghost = LiveCursor & {
  targetX: number;
  targetY: number;
  restUntil: number;
};

export function useDemoCursors(enabled: boolean): LiveCursor[] {
  const [cursors, setCursors] = useState<LiveCursor[]>([]);

  useEffect(() => {
    if (!enabled) {
      setCursors([]);
      return;
    }

    const random = makeRandom(20260826);

    /**
     * ЦІЛІ — КАРТКИ, А НЕ ВИПАДКОВІ ТОЧКИ.
     *
     * Привид, що блукає порожнім місцем, нічого не показує: у справжній роботі
     * чужий курсор майже завжди стоїть НА чомусь — на картці, яку людина
     * читає. Тому ціль береться з реальних карток на екрані, і видно саме те,
     * що ми збираємось слати по мережі: не пікселі, а «дивлюсь на цю картку».
     *
     * Порожня дошка (усе відфільтровано, дані ще їдуть) — тоді випадкова точка:
     * показ має працювати завжди, а не лише коли пощастило.
     */
    const pickTarget = (): { x: number; y: number } => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-kanban-card='true']"))
        .map((card) => card.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.top > 60 && rect.bottom < window.innerHeight - 20);
      if (cards.length === 0) {
        return {
          x: 120 + random() * Math.max(240, window.innerWidth - 320),
          y: 120 + random() * Math.max(200, window.innerHeight - 260),
        };
      }
      const rect = cards[Math.floor(random() * cards.length)];
      // Не в центр: жива рука зупиняється де завгодно в межах картки.
      return {
        x: rect.left + rect.width * (0.2 + random() * 0.6),
        y: rect.top + rect.height * (0.2 + random() * 0.6),
      };
    };

    const ghosts: Ghost[] = DEMO_PEOPLE.map((person) => {
      const start = pickTarget();
      const target = pickTarget();
      return { ...person, x: start.x, y: start.y, targetX: target.x, targetY: target.y, restUntil: 0 };
    });

    let frame = 0;
    let stopped = false;

    /**
     * Оновлюємо стан не щокадру, а ~12 разів на секунду — рівно з тією
     * частотою, з якою по мережі приходили б справжні координати. Плавність
     * домальовує CSS-перехід у самому шарі курсорів, і це і є та економія, яку
     * ми збираємось робити по-справжньому.
     */
    const SEND_EVERY_MS = 90;
    let lastSent = 0;

    const step = (now: number) => {
      if (stopped) return;
      ghosts.forEach((ghost) => {
        if (now < ghost.restUntil) return;
        const dx = ghost.targetX - ghost.x;
        const dy = ghost.targetY - ghost.y;
        if (Math.hypot(dx, dy) < 6) {
          const next = pickTarget();
          ghost.targetX = next.x;
          ghost.targetY = next.y;
          ghost.restUntil = now + PAUSE_MIN_MS + random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
          return;
        }
        ghost.x += dx * EASE;
        ghost.y += dy * EASE;
      });

      if (now - lastSent >= SEND_EVERY_MS) {
        lastSent = now;
        setCursors(ghosts.map(({ id, name, x, y }) => ({ id, name, x: Math.round(x), y: Math.round(y) })));
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return cursors;
}
