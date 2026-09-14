import { render } from "@testing-library/react";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";

import { Check, Trash2 } from "./appIcons";

describe("appIcons (REQ-275)", () => {
  /**
   * Звичайний значок — сам компонент Phosphor, а не обгортка. Обгортка на
   * кожен значок склеїла б усі 229 в стартовий чанк (заміряно: 363 кБ gzip
   * при стелі 240), бо виклик на рівні модуля збирач прибрати не може.
   */
  it("звичайний значок — реекспорт, без обгортки", () => {
    expect(Check).toBe(CheckIcon);
  });

  it("значок із рухом додає клас руху й зберігає класи місця виклику", () => {
    const svg = render(<Trash2 className="h-4 w-4 text-destructive" />).container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("icon-motion-shake h-4 w-4 text-destructive");
  });

  it("явна вага передається: так активний пункт сайдбару стає заповненим", () => {
    const d = (node: React.ReactElement) => render(node).container.querySelector("svg path")?.getAttribute("d");
    expect(d(<Trash2 weight="fill" />)).toBe(d(<TrashIcon weight="fill" />));
  });
});
