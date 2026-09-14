import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_BASE, SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * Сторож ролей радіуса (docs/superpowers/specs/2026-09-14-visual-refresh-wave2a-design.md, §4–5).
 * Радіус задає РОЛЬ, а не висота: інакше сторінка, що стискає поле класом,
 * отримує 36px із радіусом 12 поруч із таким самим полем радіусом 8.
 */

const CSS = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

describe("висота контролу — одна змінна", () => {
  it("телефон 40px, від md — 32px", () => {
    expect(CSS).toMatch(/--control-h:\s*2\.5rem/);
    expect(CSS).toMatch(/@media \(min-width: 48rem\)\s*\{\s*:root\s*\{[^}]*--control-h:\s*2rem/);
  });
});

describe("радіус за роллю", () => {
  it("база поля — висота зі змінної, радіус контролу", () => {
    expect(CONTROL_BASE).toContain("h-(--control-h)");
    expect(CONTROL_BASE).toContain("rounded-lg");
    expect(CONTROL_BASE).not.toContain("rounded-xl");
  });

  it.each(["sm", "md", "lg", "iconSm", "icon", "iconMd"] as const)("кнопка %s — rounded-lg", (size) => {
    const merged = cn(buttonVariants({ size }));
    expect(merged).toContain("rounded-lg");
    expect(merged).not.toMatch(/rounded-(md|xl)\b/);
  });

  it.each(["xxs", "xs", "iconXs"] as const)("дрібна кнопка %s — rounded-md", (size) => {
    expect(cn(buttonVariants({ size }))).toContain("rounded-md");
  });

  it("іконка-контрол не повертає rounded-xl через варіант", () => {
    expect(cn(buttonVariants({ variant: "control", size: "icon" }))).not.toContain("rounded-xl");
  });

  it("пігулка лишається пігулкою за будь-якого розміру", () => {
    const merged = cn(buttonVariants({ variant: "inverted", size: "sm" }));
    expect(merged).toContain("rounded-full");
    expect(merged).not.toContain("rounded-lg");
  });

  it("поле за замовчуванням — 32/40 і rounded-lg", () => {
    const html = renderToStaticMarkup(<Input />);
    expect(html).toContain("h-(--control-h)");
    expect(html).toContain("rounded-lg");
  });

  it("сегменти концентричні: група 8, тригер 6", () => {
    expect(SEGMENTED_GROUP).toContain("rounded-lg");
    expect(SEGMENTED_GROUP).toContain("h-(--control-h)");
    expect(SEGMENTED_TRIGGER).toContain("rounded-md");
  });
});
