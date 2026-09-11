/**
 * Мальовані види поліграфії для рейки вибору (11.09.2026).
 *
 * ЧОМУ МАЛЮНОК, А НЕ ОДНА ПІКТОГРАМА ПРИНТЕРА: сім однакових принтерів
 * відрізняються лише підписом, і око читає підпис — а не вид. Річ, намальована
 * впізнавано (резинка й ляссе у щоденника, топер і три блоки у квартального,
 * трикутник хатинки), дає менеджеру вибрати не читаючи.
 *
 * ЧОМУ ЛІНІЄЮ, А НЕ КАРТИНКОЮ: фото немає й не буде — ці види ми виробляємо, а
 * не купуємо, тож у каталозі в них порожнє `image_url`. Лінія масштабується,
 * перефарбовується під вибраний стан і важить нуль байтів.
 *
 * Ключ — `metadata.specPreset` моделі. Невідомий вид отримує загальний аркуш:
 * новий пресет має з'являтись у рейці з першого дня, а не чекати на малюнок.
 */

type Art = { d1: string; d2?: string; d3?: string };

const ART: Record<string, Art> = {
  print_diary: {
    d1: "M14 8h20a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H14z",
    d2: "M14 8v32",
    d3: "M30 8v32 M20 40v5l2-2 2 2v-5",
  },
  print_certificate: {
    d1: "M8 12h32v24H8z",
    d2: "M14 20h14 M14 26h9",
    d3: "M31 27a3.5 3.5 0 1 0 .01 0 M29.5 31l-1 6 2.8-1.8L34 37l-1-6",
  },
  print_calendar_quarterly: {
    d1: "M12 6h24v8H12z",
    d2: "M14 18h20v6H14z M14 26h20v6H14z M14 34h20v6H14z",
    d3: "M17 6V3 M24 6V3 M31 6V3",
  },
  print_calendar_flip: {
    d1: "M10 15h28v21H10z",
    d2: "M10 15c6-5 22-5 28 0",
    d3: "M15 11V8 M24 11V8 M33 11V8",
  },
  print_calendar_house: {
    d1: "M24 10 38 36H10z",
    d2: "M17 29h14",
    d3: "M24 16v8",
  },
  print_brochure: {
    d1: "M8 12h16v24H8z M24 12h16v24H24z",
    d2: "M24 12v24",
    d3: "M12 19h8 M12 25h6 M28 19h8",
  },
  print_flyer: {
    d1: "M12 8h16l8 8v24H12z",
    d2: "M28 8v8h8",
    d3: "M18 26h12 M18 32h8",
  },
};

const FALLBACK: Art = { d1: "M12 8h24v32H12z", d2: "M18 18h12 M18 24h12", d3: "M18 30h8" };

export function PrintModelArt({ presetKey, className }: { presetKey: string | null; className?: string }) {
  const art = (presetKey && ART[presetKey]) || FALLBACK;
  return (
    <svg
      className={className}
      width="42"
      height="42"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={art.d1} />
      {art.d2 ? <path d={art.d2} strokeWidth={1.3} /> : null}
      {art.d3 ? <path d={art.d3} strokeWidth={1.3} /> : null}
    </svg>
  );
}
