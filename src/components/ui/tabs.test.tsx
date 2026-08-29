import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Tabs, TabsContent, TabsList, TabsTrigger, useViewTransitionTabs } from "@/components/ui/tabs";

/**
 * Перемикання вкладок із переїздом підкреслення (REQ-202).
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ТЕСТУЄТЬСЯ, ЯКЩО АНІМАЦІЮ ОКОМ ТУТ НЕ ВИДНО. Саме тому й
 * тестується. Переїзд тримається на двох умовах, і обидві ламаються МОВЧКИ:
 * ім'я переходу мусить бути валідним CSS-ідентифікатором (інакше воно тихо
 * стає `none`) і мусить бути різним у різних смуг вкладок (два однакові імені
 * в кадрі скасовують перехід цілком). Ані типи, ані лінт цього не спіймають, а
 * в браузері це виглядає як «анімації просто немає».
 */

function Fixture({ label }: { label: string }) {
  const tabs = useViewTransitionTabs("first");
  return (
    <Tabs {...tabs}>
      <TabsList variant="underline" aria-label={label}>
        <TabsTrigger value="first">Перша</TabsTrigger>
        <TabsTrigger value="second">Друга</TabsTrigger>
      </TabsList>
      <TabsContent value="first">Вміст першої</TabsContent>
      <TabsContent value="second">Вміст другої</TabsContent>
    </Tabs>
  );
}

const underlineName = (label: string) =>
  screen.getByRole("tablist", { name: label }).style.getPropertyValue("--tabs-underline-name");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("вкладки з підкресленням", () => {
  it("ім'я переходу — валідний CSS-ідентифікатор", () => {
    render(<Fixture label="Розділи" />);
    // `useId` віддає щось на кшталт «r0» У ЛАПКАХ-ЯЛИНКАХ, а такий рядок у CSS
    // недійсний: `view-transition-name` мовчки стане `none`, і підкреслення
    // почне зникати-з'являтися замість переїзду.
    expect(underlineName("Розділи")).toMatch(/^tabs-underline-[A-Za-z0-9_-]+$/);
  });

  it("дві смуги вкладок отримують різні імена", () => {
    render(
      <>
        <Fixture label="Ліва картка" />
        <Fixture label="Права картка" />
      </>
    );
    // Однакові імена в одному кадрі браузер вважає помилкою й скасовує перехід
    // ЦІЛКОМ — тобто дві відкриті картки лишили б без анімації одна одну.
    expect(underlineName("Ліва картка")).not.toBe(underlineName("Права картка"));
  });

  it("підкреслення живе всередині кожного тригера, а не лише активного", () => {
    render(<Fixture label="Розділи" />);
    // Проліт має бути в ОБОХ: ім'я вмикається селектором за `data-state`, тож
    // елемент мусить існувати заздалегідь — інакше в кадрі «після» його немає,
    // і переїжджати нема чому.
    for (const name of ["Перша", "Друга"]) {
      expect(screen.getByRole("tab", { name }).querySelector(".tabs-underline")).not.toBeNull();
    }
  });

  it("вкладка перемикається й там, де переходів немає", async () => {
    // jsdom не має `document.startViewTransition` — тобто це заразом перевірка
    // запасного шляху: у браузері без API вкладки мусять працювати як раніше.
    expect("startViewTransition" in document).toBe(false);

    render(<Fixture label="Розділи" />);
    await userEvent.click(screen.getByRole("tab", { name: "Друга" }));

    expect(screen.getByRole("tab", { name: "Друга" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Вміст другої")).toBeInTheDocument();
  });

  it("перемикання йде ЧЕРЕЗ перехід, коли браузер його вміє", async () => {
    // Ключова умова, заради якої вкладки зроблено керованими: значення мусить
    // мінятись УСЕРЕДИНІ зворотного виклику. Знімок «до» браузер робить перед
    // ним, тож зміна поза викликом означала б два однакові кадри.
    let updatedInsideCallback = false;
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      updatedInsideCallback = screen.queryByText("Вміст другої") !== null;
      return { finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    vi.stubGlobal("document", Object.assign(document, { startViewTransition }));

    render(<Fixture label="Розділи" />);
    await userEvent.click(screen.getByRole("tab", { name: "Друга" }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(updatedInsideCallback).toBe(true);

    // @ts-expect-error — прибираємо підмінений метод, щоб не протік у сусідні тести
    delete document.startViewTransition;
  });
});
