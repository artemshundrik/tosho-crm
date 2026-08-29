import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TabBar, TabBarItem } from "@/components/ui/tab-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Смуга вкладок із підкресленням (REQ-202).
 *
 * ДВА ВХОДИ, ОДНА МЕХАНІКА. `TabBar` малює саму смугу там, де розділи лежать
 * поруч і перемикаються класом (картка прорахунку, картка людини), а вкладки
 * Radix тримають вміст самі. Спільне в них головне: одна риска на смугу, що
 * ПЕРЕЇЖДЖАЄ, і згасання вмісту. Тест тримає обидва входи разом — саме тому,
 * що розійтись вони можуть тихо: вигляд лишиться тим самим, а рух зникне в
 * одному з них.
 *
 * Координати тут не перевіряються: jsdom не рахує розкладку, і в браузері це
 * вже перевірено оком. Тут — те, що ламається логікою.
 */
describe("вкладки з підкресленням", () => {
  it("риска одна на смугу, а не по одній на кнопку", () => {
    render(
      <TabBar value="products">
        <TabBarItem value="products" onSelect={() => {}}>
          Товари
        </TabBarItem>
        <TabBarItem value="design" onSelect={() => {}}>
          Дизайн
        </TabBarItem>
      </TabBar>
    );
    // Саме «одна» й робить рух можливим: підкреслення на кожній кнопці вміло б
    // лише згаснути в одному місці й засвітитись в іншому.
    expect(document.querySelectorAll("[data-segmented-indicator]")).toHaveLength(1);
  });

  it("активну вкладку видно і риска її знаходить", () => {
    render(
      <TabBar value="design">
        <TabBarItem value="products" onSelect={() => {}}>
          Товари
        </TabBarItem>
        <TabBarItem value="design" onSelect={() => {}}>
          Дизайн
        </TabBarItem>
      </TabBar>
    );
    const active = screen.getByRole("tab", { name: "Дизайн" });
    expect(active).toHaveAttribute("aria-selected", "true");
    // Риска шукає активну кнопку саме за `aria-pressed` — без нього підсвітка
    // тихо зникне, хоч на вигляд розмітка лишиться цілою.
    expect(active).toHaveAttribute("aria-pressed", "true");
  });

  it("клік повідомляє нове значення", async () => {
    const seen: string[] = [];
    render(
      <TabBar value="products">
        <TabBarItem value="design" onSelect={(next) => seen.push(next)}>
          Дизайн
        </TabBarItem>
      </TabBar>
    );
    await userEvent.click(screen.getByRole("tab", { name: "Дизайн" }));
    expect(seen).toEqual(["design"]);
  });

  it("вкладки Radix беруть ту саму риску й згасання вмісту", () => {
    render(
      <Tabs defaultValue="brief">
        <TabsList variant="underline">
          <TabsTrigger value="brief">ТЗ</TabsTrigger>
          <TabsTrigger value="visuals">Візуалізації</TabsTrigger>
        </TabsList>
        <TabsContent value="brief">ТЗ для дизайнера</TabsContent>
      </Tabs>
    );
    expect(document.querySelectorAll("[data-segmented-indicator]")).toHaveLength(1);
    // `tab-panel` — той самий клас, яким згасають розділи картки прорахунку.
    expect(screen.getByText("ТЗ для дизайнера").className).toContain("tab-panel");
  });

  it("звичайні вкладки риски не отримують", () => {
    render(
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Написати</TabsTrigger>
          <TabsTrigger value="preview">Перегляд</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    expect(document.querySelectorAll("[data-segmented-indicator]")).toHaveLength(0);
  });
});
