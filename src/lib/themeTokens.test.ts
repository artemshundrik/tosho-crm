import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Сторож нейтральної палітри (docs/VISUAL_REFRESH_DESIGN.md, розділ 3).
 * Весь сірий колір застосунку йде через токени index.css, тож саме тут
 * повзе дрейф: новий токен «0 0% L%» тихо повертає чисто нейтральний сірий
 * серед холодних, а правка фону — непомітно ламає контраст приглушеного тексту.
 */

const CSS = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

type Selector = ":root" | ".dark";

/** Токени, оголошені безпосередньо в блоці з цим селектором (`:root`, `.dark`, `@theme`). */
function readTokens(selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const stack: string[] = [];
  for (const line of CSS.split("\n")) {
    const declaration = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/);
    if (declaration && stack[stack.length - 1] === selector) {
      tokens.set(declaration[1], declaration[2].trim());
    }
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    for (let i = 0; i < opens; i++) stack.push(line.replace(/\{.*/, "").trim());
    for (let i = 0; i < closes; i++) stack.pop();
  }
  return tokens;
}

type Hsl = { h: number; s: number; l: number };

function parseHsl(value: string): Hsl | null {
  const match = value.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  return match ? { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) } : null;
}

function relativeLuminance({ h, s, l }: Hsl): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(a: Hsl, b: Hsl): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Винятки розділу 2: полотно макета, теплова карта, чорне затемнення. */
const EXCLUDED = /^--(canvas-|heat-ink-|overlay-scrim)/;

/** Точні значення з таблиць розділів 3.1 і 3.2. */
const EXPECTED: Record<Selector, Record<string, string>> = {
  ":root": {
    "--background": "220 10% 98.8%",
    "--foreground": "210 6% 7%",
    "--card-foreground": "210 6% 7%",
    "--popover-foreground": "210 6% 7%",
    "--secondary-foreground": "210 6% 7%",
    "--accent-foreground": "210 6% 7%",
    "--ring": "210 6% 7%",
    "--card": "0 0% 100%",
    "--popover": "0 0% 100%",
    "--secondary": "220 8% 96.5%",
    "--accent": "220 8% 96.5%",
    "--muted": "220 8% 96.5%",
    "--muted-foreground": "225 4% 37%",
    "--border": "225 9% 91%",
    "--input": "225 9% 91%",
    "--app-structure-divider": "220 8% 91.3%",
    "--kanban-col-border": "220 8% 91.6%",
    "--design-task-panel-card-border": "220 8% 91.6%",
    "--neutral-soft-border": "220 8% 89.8%",
  },
  ".dark": {
    "--background": "210 6% 6.7%",
    "--foreground": "210 8% 95%",
    "--card-foreground": "210 8% 95%",
    "--popover-foreground": "210 8% 95%",
    "--secondary-foreground": "210 8% 95%",
    "--accent-foreground": "210 8% 95%",
    "--ring": "210 8% 95%",
    "--card": "220 6% 9.6%",
    "--popover": "225 7% 11.4%",
    "--secondary": "220 7% 14%",
    "--muted": "220 7% 14%",
    "--accent": "220 7% 14%",
    "--muted-foreground": "220 3% 62.5%",
    "--border": "220 4% 16%",
    "--input": "220 4% 16%",
    "--app-main-bg": "220 8% 6.7%",
    "--app-shell-bg": "220 8% 6.3%",
    "--sidebar-surface-bg": "220 8% 6.5%",
    "--kanban-col-bg": "220 8% 7.9%",
    "--design-task-details-bg": "220 8% 8.1%",
    "--design-task-panel-card-bg": "220 8% 9.1%",
    "--design-task-panel-card-hover": "220 8% 11.9%",
    "--neutral-soft": "220 8% 11.7%",
    "--skeleton-bg": "220 8% 12.9%",
    "--app-structure-divider": "220 8% 11.4%",
    "--kanban-col-border": "220 8% 12.6%",
    "--design-task-panel-card-border": "220 8% 13.9%",
    "--neutral-soft-border": "220 8% 16%",
  },
};

const THEMES: Selector[] = [":root", ".dark"];

describe.each(THEMES)("нейтральна палітра %s", (selector) => {
  const tokens = readTokens(selector);

  it("не лишає чисто нейтральних сірих, крім винятків і чисто білого", () => {
    const leftovers = [...tokens]
      .filter(([name, value]) => {
        const neutral = value.match(/^0 0% (\d+(?:\.\d+)?)%/);
        return neutral && !EXCLUDED.test(name) && Number(neutral[1]) < 100;
      })
      .map(([name, value]) => `${name}: ${value}`);
    expect(leftovers).toEqual([]);
  });

  it("тримає точні значення з документа", () => {
    for (const [name, value] of Object.entries(EXPECTED[selector])) {
      expect(tokens.get(name), name).toBe(value);
    }
  });

  it("решта холодних сірих іде за правилом насиченості", () => {
    const offRule = [...tokens]
      .filter(([name]) => !(name in EXPECTED[selector]))
      .flatMap(([name, value]) => {
        const hsl = parseHsl(value);
        if (!hsl || hsl.h !== 220 || hsl.s > 10) return [];
        const saturation = hsl.l >= 85 || hsl.l <= 20 ? 8 : 4;
        return hsl.s === saturation ? [] : [`${name}: ${value}, чекали ${saturation}%`];
      });
    expect(offRule).toEqual([]);
  });

  it("приглушений текст читається на кожній поверхні (≥ 4.5:1)", () => {
    const muted = parseHsl(tokens.get("--muted-foreground") ?? "");
    expect(muted).not.toBeNull();
    const rootTokens = readTokens(":root");
    for (const surface of ["--app-main-bg", "--background", "--card", "--muted"]) {
      const value = tokens.get(surface) ?? rootTokens.get(surface) ?? "";
      const hsl = parseHsl(value);
      expect(hsl, surface).not.toBeNull();
      expect(contrast(muted!, hsl!), surface).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("типографіка (розділ 4)", () => {
  const theme = readTokens("@theme");

  it("задає вагу font-medium 550", () => {
    expect(theme.get("--font-weight-medium")).toBe("550");
  });

  it("задає трекінг кожному розміру, дрібним — явний нуль", () => {
    const tracking = Object.fromEntries(
      [...theme].filter(([name]) => name.endsWith("--letter-spacing")),
    );
    expect(tracking).toEqual({
      "--text-3xs--letter-spacing": "0em",
      "--text-2xs--letter-spacing": "0em",
      "--text-xs--letter-spacing": "-0.005em",
      "--text-sm--letter-spacing": "-0.01em",
      "--text-base--letter-spacing": "-0.01em",
      "--text-lg--letter-spacing": "-0.02em",
      "--text-xl--letter-spacing": "-0.02em",
      "--text-2xl--letter-spacing": "-0.02em",
      "--text-3xl--letter-spacing": "-0.02em",
      "--text-4xl--letter-spacing": "-0.02em",
    });
  });

  it("основний текст — вага 500 і трекінг −0.01em", () => {
    const body = CSS.match(/\n\s*body \{([^}]*)\}/);
    expect(body?.[1]).toMatch(/font-weight:\s*500;/);
    expect(body?.[1]).toMatch(/letter-spacing:\s*-0\.01em;/);
  });
});

describe("драбина поверхонь темної теми (REQ-271#p5)", () => {
  const dark = readTokens(".dark");
  const lightness = (name: string) => parseHsl(dark.get(name) ?? "")?.l ?? Number.NaN;

  // Перша хвиля зрівняла --muted/--accent із --popover (усі 11.4%), і підсвітка
  // пункту меню (select.tsx і dropdown-menu.tsx фарбують її в bg-muted) стала
  // невидимою. Крок менший за 2 пункти світлості око на темному вже не розрізняє.
  it("підсвітка пункту меню помітна на спливному вікні", () => {
    expect(lightness("--muted") - lightness("--popover")).toBeGreaterThanOrEqual(2);
    expect(lightness("--accent") - lightness("--popover")).toBeGreaterThanOrEqual(2);
  });

  it("виділення (muted) помітне на картці", () => {
    expect(lightness("--muted") - lightness("--card")).toBeGreaterThanOrEqual(3);
  });

  it("рамка помітна на картці навіть напівпрозора (/60 — найчастіша в коді)", () => {
    const edgeAt60 = lightness("--card") + (lightness("--border") - lightness("--card")) * 0.6;
    expect(edgeAt60 - lightness("--card")).toBeGreaterThanOrEqual(3);
  });
});
