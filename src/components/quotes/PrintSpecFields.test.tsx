import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";

import { PrintSpecFields, getPrintSpecSections } from "./PrintSpecFields";
import {
  PRINT_SPEC_DIARY,
  PRINT_SPEC_FLYER,
  createEmptyPrintSpecValues,
  type PrintSpecValues,
} from "@/lib/printSpec";

/**
 * Розгалуження щоденника — те, заради чого паперовий чекліст узагалі переїхав у
 * CRM: матеріал обкладинки міняє набір питань, і людина не повинна бачити
 * оздоблення, якого на її матеріалі не буває (REQ-36#p29, #p30).
 *
 * Перевіряється кліками, а не читанням опису: опис — це дані, і помилка в
 * `showIf` не ламає ні збірку, ні типи. Видно її лише в формі.
 */
function Harness() {
  const [values, setValues] = React.useState<PrintSpecValues>(() => createEmptyPrintSpecValues(PRINT_SPEC_DIARY));
  return <PrintSpecFields preset={PRINT_SPEC_DIARY} values={values} onChange={setValues} />;
}

const pick = async (user: ReturnType<typeof userEvent.setup>, fieldLabel: string, optionLabel: string) => {
  const label = screen.getByText(fieldLabel);
  const trigger = label.parentElement?.querySelector("button");
  await user.click(trigger as HTMLElement);
  await user.click(await screen.findByRole("button", { name: optionLabel }));
};

describe("параметри щоденника", () => {
  it("матеріал обкладинки міняє набір оздоблень", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Матеріал не вибраний — жодної гілки.
    expect(screen.queryByText("Тиснення фольгою")).toBeNull();
    expect(screen.queryByText("Шовкотрафарет")).toBeNull();

    await pick(user, "Матеріал", "Папір з друком");
    expect(screen.getByText("Друк і ламінація")).toBeTruthy();
    expect(screen.getByText("Вибірковий УФ-лак")).toBeTruthy();
    expect(screen.queryByText("Шовкотрафарет")).toBeNull();

    await pick(user, "Матеріал", "Шкірзамінник");
    expect(screen.getByText("Шовкотрафарет")).toBeTruthy();
    expect(screen.queryByText("Друк і ламінація")).toBeNull();
    expect(screen.queryByText("Вибірковий УФ-лак")).toBeNull();

    await pick(user, "Матеріал", "Дизайнерський папір");
    expect(screen.getByText("Дизайнерський папір — назва")).toBeTruthy();
    expect(screen.getByText("Дизайнерський папір — без ламінації")).toBeTruthy();
    expect(screen.queryByText("Друк і ламінація")).toBeNull();
  });

  it("щільність, папір і кольоровість питають лише для індивідуального блока", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await pick(user, "Виконання блока", "Стандартний");
    expect(screen.queryByText("Щільність паперу")).toBeNull();
    expect(screen.queryByText("Кольоровість друку")).toBeNull();
    // Макет питають завжди — саме з нього виведена кольоровість стандартного.
    expect(screen.getByText("Макет")).toBeTruthy();

    await pick(user, "Виконання блока", "Індивідуальний");
    expect(screen.getByText("Щільність паперу")).toBeTruthy();
    expect(screen.getByText("Папір блока")).toBeTruthy();
    expect(screen.getByText("Кольоровість друку")).toBeTruthy();
  });
});

/**
 * Лічильники рейки розділів (варіант А). Вони показують «3/5», і знаменник тут
 * не сталий: умовні поля з'являються й зникають від вибору. Якщо рахувати ВСІ
 * поля пресету, щоденник показував би «5 з 33» назавжди — тобто прогрес, який
 * ніколи не дійде до кінця, хоч усе заповнено.
 */
describe("розділи для рейки", () => {
  it("знаменник рахує лише видимі поля й росте разом із розгалуженням", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);

    const before = getPrintSpecSections(PRINT_SPEC_DIARY, values);
    const cover = before.find((section) => section.title === "Обкладинка");
    expect(cover?.fields.length).toBe(3);
    expect(cover?.filled).toBe(0);

    // Шкірзамінник відкриває ще два питання — і знаменник мусить це врахувати.
    const after = getPrintSpecSections(PRINT_SPEC_DIARY, { ...values, coverMaterial: "leatherette" });
    const coverAfter = after.find((section) => section.title === "Обкладинка");
    expect(coverAfter?.fields.length).toBe(5);
    expect(coverAfter?.filled).toBe(1);
  });

  it("розділ без жодного видимого поля в рейку не потрапляє", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    const titles = getPrintSpecSections(PRINT_SPEC_DIARY, values).map((section) => section.title);
    // «Ляссе» має лише одне безумовне поле — вид ляссе, тож розділ є.
    expect(titles).toContain("Ляссе");
    expect(titles.length).toBe(PRINT_SPEC_DIARY.sections.length);
  });

  it("у листівки розділів менше трьох — рейка там не малюється", () => {
    const sections = getPrintSpecSections(PRINT_SPEC_FLYER, createEmptyPrintSpecValues(PRINT_SPEC_FLYER));
    expect(sections.length).toBe(2);
  });
});
