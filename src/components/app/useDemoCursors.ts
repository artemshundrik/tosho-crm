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

/** Скільки привид відпочиває на місці, перш ніж рушити далі. */
const PAUSE_MIN_MS = 700;
const PAUSE_MAX_MS = 2200;

/** Частка шляху, яку привид долає за кадр: менше — повільніше й плавніше. */
const EASE = 0.055;

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
    const pickX = () => 120 + random() * Math.max(240, window.innerWidth - 320);
    const pickY = () => 120 + random() * Math.max(200, window.innerHeight - 260);

    const ghosts: Ghost[] = DEMO_PEOPLE.map((person) => {
      const x = pickX();
      const y = pickY();
      return { ...person, x, y, targetX: pickX(), targetY: pickY(), restUntil: 0 };
    });

    let frame = 0;
    let stopped = false;

    /**
     * Оновлюємо стан не щокадру, а ~12 разів на секунду — рівно з тією
     * частотою, з якою по мережі приходили б справжні координати. Плавність
     * домальовує CSS-перехід у самому шарі курсорів, і це і є та економія, яку
     * ми збираємось робити по-справжньому.
     */
    const SEND_EVERY_MS = 80;
    let lastSent = 0;

    const step = (now: number) => {
      if (stopped) return;
      ghosts.forEach((ghost) => {
        if (now < ghost.restUntil) return;
        const dx = ghost.targetX - ghost.x;
        const dy = ghost.targetY - ghost.y;
        if (Math.hypot(dx, dy) < 6) {
          ghost.targetX = pickX();
          ghost.targetY = pickY();
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
