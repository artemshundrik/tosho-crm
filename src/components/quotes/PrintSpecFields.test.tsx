import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";

import { PrintSpecFields } from "./PrintSpecFields";
import {
  PRINT_SPEC_DIARY,
  PRINT_SPEC_PACKAGE,
  createEmptyPrintSpecValues,
  getPrintSpecSections,
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

/** Чип варіанта всередині групи поля: імена варіантів повторюються між полями («Стандартне»). */
const chip = (fieldLabel: string, optionLabel: string) =>
  within(screen.getByRole("group", { name: fieldLabel })).getByRole("button", { name: optionLabel });

const pick = async (user: ReturnType<typeof userEvent.setup>, fieldLabel: string, optionLabel: string) => {
  await user.click(chip(fieldLabel, optionLabel));
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
 * Лічильники розділів і стовпчиків. Вони показують «3/5», і знаменник тут
 * не сталий: умовні поля з'являються й зникають від вибору. Якщо рахувати ВСІ
 * поля пресету, щоденник показував би «5 з 33» назавжди — тобто прогрес, який
 * ніколи не дійде до кінця, хоч усе заповнено.
 */
describe("лічильники розділів", () => {
  it("знаменник рахує лише видимі поля й росте разом із розгалуженням", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);

    const before = getPrintSpecSections(PRINT_SPEC_DIARY, values);
    const cover = before.find((section) => section.title === "Обкладинка");
    expect(cover?.fields.length).toBe(4); // + формат, що тепер у «Обкладинці»
    expect(cover?.filled).toBe(0);

    // Шкірзамінник відкриває ще два питання — і знаменник мусить це врахувати.
    const after = getPrintSpecSections(PRINT_SPEC_DIARY, { ...values, coverMaterial: "leatherette" });
    const coverAfter = after.find((section) => section.title === "Обкладинка");
    expect(coverAfter?.fields.length).toBe(6);
    expect(coverAfter?.filled).toBe(1);
  });

  it("розділ без жодного видимого поля в рейку не потрапляє", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);
    const titles = getPrintSpecSections(PRINT_SPEC_DIARY, values).map((section) => section.title);
    // «Ляссе» має лише одне безумовне поле — вид ляссе, тож розділ є.
    expect(titles).toContain("Ляссе");
    expect(titles.length).toBe(PRINT_SPEC_DIARY.sections.length);
  });
});

/** Поведінка чипів: кожен варіант видно одразу, без випадного списку. */
describe("чипи варіантів", () => {
  it("клік ставить значення, повторний знімає", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const a5 = () => chip("Формат", "А5");

    expect(a5().getAttribute("aria-pressed")).toBe("false");
    await user.click(a5());
    expect(a5().getAttribute("aria-pressed")).toBe("true");
    expect(chip("Формат", "А4").getAttribute("aria-pressed")).toBe("false");
    await user.click(a5());
    expect(a5().getAttribute("aria-pressed")).toBe("false");
  });

  it("«Інше…» відкриває поле вводу, повторний клік ховає його", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByPlaceholderText("Вкажіть своє")).toBeNull();
    await user.click(chip("Формат", "Інше…"));
    const input = screen.getByPlaceholderText("Вкажіть своє");
    await user.type(input, "150 × 200");
    expect((input as HTMLInputElement).value).toBe("150 × 200");
    await user.click(chip("Формат", "Інше…"));
    expect(screen.queryByPlaceholderText("Вкажіть своє")).toBeNull();
  });

  it("дочірнє поле з'являється під батьківським, у тому ж блоці", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(chip("Матеріал", "Шкірзамінник"));
    const parent = screen.getByRole("group", { name: "Матеріал" }).closest("div.min-w-0")?.parentElement as HTMLElement;
    expect(within(parent).getByText("Шкірзамінник — який саме")).toBeTruthy();
  });

  it("«кілька зі списку» — чипи, що вмикаються незалежно", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(chip("Матеріал", "Шкірзамінник"));
    await user.click(chip("Нанесення", "Лак"));
    await user.click(chip("Нанесення", "Тиснення"));
    expect(chip("Нанесення", "Лак").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Нанесення", "Тиснення").getAttribute("aria-pressed")).toBe("true");
    await user.click(chip("Нанесення", "Лак"));
    expect(chip("Нанесення", "Лак").getAttribute("aria-pressed")).toBe("false");
  });
});

/**
 * Пакет (REQ-323#p4): від матеріалу й типу залежать не лише поля, а й ВАРІАНТИ
 * — правила старого конфігуратора, тепер у описі. Перевіряється кліками з тієї ж
 * причини, що й гілки щоденника: помилка в умові не ламає ні збірку, ні типи.
 */
function PackageHarness({ onValues }: { onValues?: (values: PrintSpecValues) => void }) {
  const [values, setValues] = React.useState<PrintSpecValues>(() => createEmptyPrintSpecValues(PRINT_SPEC_PACKAGE));
  return (
    <PrintSpecFields
      preset={PRINT_SPEC_PACKAGE}
      values={values}
      onChange={(next) => {
        setValues(next);
        onValues?.(next);
      }}
    />
  );
}

describe("параметри пакета", () => {
  it("матеріал міняє щільності, а вибір, якого більше немає, знімається тим самим кліком", async () => {
    const user = userEvent.setup();
    let latest: PrintSpecValues = {};
    render(<PackageHarness onValues={(values) => (latest = values)} />);

    expect(within(screen.getByRole("group", { name: "Щільність" })).queryByRole("button", { name: "120 г/м²" })).toBeNull();

    await pick(user, "Матеріал", "Крафт");
    await pick(user, "Щільність", "120 г/м²");
    await pick(user, "Ручки", "Кручена паперова");
    expect(chip("Щільність", "120 г/м²").getAttribute("aria-pressed")).toBe("true");

    await pick(user, "Матеріал", "Картон");
    expect(within(screen.getByRole("group", { name: "Щільність" })).queryByRole("button", { name: "120 г/м²" })).toBeNull();
    expect(chip("Щільність", "205 г/м²")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Ручки" })).queryByRole("button", { name: "Кручена паперова" })).toBeNull();
    expect(latest.density).toBe("");
    expect(latest.handleType).toBe("");
  });

  it("готовий пакет: без CMYK, з посиланням постачальника; індивідуальний — розмір у три виміри й люверси", async () => {
    const user = userEvent.setup();
    render(<PackageHarness />);

    await pick(user, "Тип пакета", "Готовий");
    expect(within(screen.getByRole("group", { name: "Тип нанесення" })).queryByRole("button", { name: "CMYK" })).toBeNull();
    expect(screen.getByText("Посилання постачальника")).toBeTruthy();
    expect(screen.queryByText("Люверси")).toBeNull();

    await pick(user, "Тип пакета", "Індивідуальний");
    expect(chip("Тип нанесення", "CMYK")).toBeTruthy();
    expect(screen.getByPlaceholderText("Г")).toBeTruthy();
    expect(screen.getByText("Люверси")).toBeTruthy();

    await pick(user, "Матеріал", "Крафт");
    expect(screen.queryByText("Люверси")).toBeNull();
  });
});

