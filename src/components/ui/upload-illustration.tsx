import * as React from "react";

import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Жива піктограма завантаження файлу: пунктирне коло крутиться, аркуш дихає,
 * стрілка ходить угору-вниз.
 *
 * ЗВІДКИ. Перемальовано з KokonutUI (`file-upload`, MIT, kokonutui.com,
 * автор @dorianbaffier) — перший елемент, узятий звідти. Головне, що з'ясувала
 * розвідка: рух в оригіналі НЕ на motion, а на SMIL — власні теги `<animate>`
 * усередині SVG. Тому ілюстрація не коштує жодної залежності й жодного
 * рендера React: браузер крутить її сам, поза деревом.
 *
 * ЧОМУ БЕЗ СИНЬОГО. В оригіналі акцент — `blue-500`/`blue-100`. У нас синій
 * зайнятий: `info` — це СТАТУСНИЙ тон, і пофарбувати ним прикрасу означало б
 * розмити таксономію (див. коментар про палітру в tailwind.config.js). Тому
 * малюємо `currentColor` — колір задає той, хто ставить, як і в решти наших
 * піктограм.
 *
 * ЧОМУ РУХ ВИМИКАЄТЬСЯ В JS, А НЕ В CSS. `prefers-reduced-motion` у нас
 * гаситься медіазапитом в index.css, але SMIL звідти не дістати: CSS керує
 * властивістю `animation`, а тут анімують теги SVG. Тому теги просто не
 * рендеряться — лишається та сама картинка, нерухома.
 */
export function UploadIllustration({ className }: { className?: string }) {
  // Одноразовий знімок при монтуванні: та сама механіка, що в канбані.
  // Переключення настройки посеред перетягування файлу — не той випадок,
  // заради якого варто тримати підписку на matchMedia.
  const [still] = React.useState(prefersReducedMotion);

  return (
    <svg
      aria-hidden="true"
      className={cn("h-12 w-12", className)}
      fill="none"
      focusable="false"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Пунктирне коло — межа «сюди». Один оберт на хвилину: помітно, що
          живе, але не тягне на себе увагу. */}
      <circle className="stroke-border" cx="50" cy="50" r="45" strokeDasharray="4 4" strokeWidth="2">
        {still ? null : (
          <animateTransform
            attributeName="transform"
            dur="60s"
            from="0 50 50"
            repeatCount="indefinite"
            to="360 50 50"
            type="rotate"
          />
        )}
      </circle>

      {/* Аркуш. Морф `d` на два піксели вниз і назад — те саме «дихання»,
          що в оригіналі. */}
      <path
        d="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z"
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth="2"
      >
        {still ? null : (
          <animate
            attributeName="d"
            dur="2s"
            repeatCount="indefinite"
            values="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z;M30 38H70C75 38 75 43 75 43V68C75 73 70 73 70 73H30C25 73 25 68 25 68V43C25 38 30 38 30 38Z;M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z"
          />
        )}
      </path>

      {/* Язичок теки над аркушем — статичний, він тримає силует упізнаваним. */}
      <path
        d="M30 35C30 35 35 35 40 35C45 35 45 30 50 30C55 30 55 35 60 35C65 35 70 35 70 35"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* Стрілка вгору: саме вона й каже «завантаження», а не «файл». */}
      <g transform="translate(0 8)">
        <line stroke="currentColor" strokeLinecap="round" strokeWidth="2" x1="50" x2="50" y1="45" y2="60">
          {still ? null : (
            <animate attributeName="y2" dur="2s" repeatCount="indefinite" values="60;55;60" />
          )}
        </line>
        <polyline
          fill="none"
          points="42,52 50,45 58,52"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        >
          {still ? null : (
            <animate
              attributeName="points"
              dur="2s"
              repeatCount="indefinite"
              values="42,52 50,45 58,52;42,47 50,40 58,47;42,52 50,45 58,52"
            />
          )}
        </polyline>
      </g>
    </svg>
  );
}
