import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PrintSpecFields } from "./PrintSpecFields";
import {
  PRINT_SPEC_DIARY,
  PRINT_SPEC_PACKAGE,
  createEmptyPrintSpecValues,
  getPrintSpecSections,
  settlePrintSpecValues,
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
    expect(screen.getByText("Друк і ламінація", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Вибірковий УФ-лак")).toBeTruthy();
    expect(screen.queryByText("Шовкотрафарет")).toBeNull();

    await pick(user, "Матеріал", "Шкірзамінник");
    expect(screen.getByText("Шовкотрафарет")).toBeTruthy();
    expect(screen.queryByText("Друк і ламінація", { selector: "span" })).toBeNull();
    expect(screen.queryByText("Вибірковий УФ-лак")).toBeNull();

    await pick(user, "Матеріал", "Дизайнерський папір");
    expect(screen.getByText("Дизайнерський папір — назва", { selector: "span" })).toBeTruthy();
    // Підказка гілки тепер під значком «і», тож перевіряємо саме його.
    expect(screen.getByRole("button", { name: "Підказка: Оздоблення" })).toBeTruthy();
    expect(screen.queryByText("Друк і ламінація", { selector: "span" })).toBeNull();
  });

  it("щільність, папір і кольоровість питають лише для індивідуального блока", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await pick(user, "Виконання блока", "Стандартний");
    expect(screen.queryByText("Щільність паперу", { selector: "span" })).toBeNull();
    expect(screen.queryByText("Кольоровість друку", { selector: "span" })).toBeNull();
    // Макет питають завжди — саме з нього виведена кольоровість стандартного.
    expect(screen.getByText("Макет", { selector: "span" })).toBeTruthy();

    await pick(user, "Виконання блока", "Індивідуальний");
    expect(screen.getByText("Щільність паперу", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Папір блока", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Кольоровість друку", { selector: "span" })).toBeTruthy();
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
    expect(within(parent).getByText("Шкірзамінник — який саме", { selector: "span" })).toBeTruthy();
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
    expect(screen.getByText("Посилання постачальника", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Люверси", { selector: "span" })).toBeNull();

    await pick(user, "Тип пакета", "Індивідуальний");
    expect(chip("Тип нанесення", "CMYK")).toBeTruthy();
    expect(screen.getByPlaceholderText("Г")).toBeTruthy();
    expect(screen.getByText("Люверси", { selector: "span" })).toBeTruthy();

    await pick(user, "Матеріал", "Крафт");
    expect(screen.queryByText("Люверси", { selector: "span" })).toBeNull();
  });
});


/** Підказки поля живуть під значком «і»: у розкладці їх тексту немає, доки не наведуть чи не сфокусують. */
describe("підказки під значком «і»", () => {
  const HINT = "Нестандартний — «Інше» й розміри текстом";
  const preset = PRINT_SPEC_DIARY;
  const values = createEmptyPrintSpecValues(PRINT_SPEC_DIARY);

  it("текст підказки не видно, а в кнопки-значка є aria-label", () => {
    render(<PrintSpecFields preset={preset} values={values} onChange={() => {}} />);
    expect(screen.queryByText(HINT)).toBeNull();
    const button = screen.getByRole("button", { name: "Підказка: Формат" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("наведення й фокус показують підказку", async () => {
    render(<PrintSpecFields preset={preset} values={values} onChange={() => {}} />);
    const button = screen.getByRole("button", { name: "Підказка: Формат" });

    fireEvent.mouseEnter(button);
    expect((await screen.findByRole("tooltip")).textContent).toContain(HINT);
    fireEvent.mouseLeave(button);

    fireEvent.focus(button);
    expect((await screen.findByRole("tooltip")).textContent).toContain(HINT);
  });
});

/**
 * REQ-326: підказки стали кнопками, неможливе вимкнене, типове підставляється.
 * Усе перевіряється кліками: правила — це дані, і їх помилка видна лише у формі.
 */
function SettledHarness({ onValues }: { onValues?: (values: PrintSpecValues) => void }) {
  const initial = React.useMemo(
    () => settlePrintSpecValues(PRINT_SPEC_DIARY, createEmptyPrintSpecValues(PRINT_SPEC_DIARY), { auto: [], touched: [] }),
    []
  );
  const [values, setValues] = React.useState<PrintSpecValues>(initial.values);
  return (
    <PrintSpecFields
      preset={PRINT_SPEC_DIARY}
      values={values}
      initialAuto={initial.meta.auto}
      onChange={(next) => {
        setValues(next);
        onValues?.(next);
      }}
    />
  );
}

describe("кнопки замість підказок", () => {
  it("пресети й крок числових полів ставлять значення", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const pages = within(screen.getByRole("group", { name: "Кількість сторінок: швидкі значення" }));
    await user.click(pages.getByRole("button", { name: "224" }));
    expect((screen.getByLabelText("Кількість сторінок") as HTMLInputElement).value).toBe("224");
    await user.click(pages.getByRole("button", { name: "352" }));
    expect((screen.getByLabelText("Кількість сторінок") as HTMLInputElement).value).toBe("352");

    await user.click(screen.getByRole("button", { name: "Рекламні вставки: більше на 2" }));
    await user.click(screen.getByRole("button", { name: "Рекламні вставки: більше на 2" }));
    expect((screen.getByLabelText("Рекламні вставки") as HTMLInputElement).value).toBe("4");
    await user.click(screen.getByRole("button", { name: "Рекламні вставки: менше на 2" }));
    expect((screen.getByLabelText("Рекламні вставки") as HTMLInputElement).value).toBe("2");
  });

  it("непарна кількість вставок — попередження, а не блок", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Рекламні вставки"), "3");
    expect(screen.getByText("Кратне двом")).toBeTruthy();
    await user.type(screen.getByLabelText("Рекламні вставки"), "2");
    expect(screen.queryByText("Кратне двом")).toBeNull();
  });
});

describe("неможливе вимкнене", () => {
  it("з поролоном вертикальна резинка сіра, а вже вибрана знімається з поясненням", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await pick(user, "Резинка", "Наявна");
    await pick(user, "Розташування", "Вертикальна");
    expect(chip("Розташування", "Вертикальна").getAttribute("aria-pressed")).toBe("true");

    await pick(user, "Поролон", "З поролоном");
    expect(chip("Розташування", "Вертикальна").getAttribute("aria-pressed")).toBe("false");
    expect((chip("Розташування", "Вертикальна") as HTMLButtonElement).disabled).toBe(true);
    expect((chip("Розташування", "Під ручку") as HTMLButtonElement).disabled).toBe(false);
    expect(
      screen.getByText("«Вертикальна» знято: З поролоновою обкладинкою можлива лише резинка під ручку")
    ).toBeTruthy();
  });
});

describe("значення за замовчуванням у формі", () => {
  it("позначка «за замовчуванням» тримається, доки значення не підтвердили чи не змінили", async () => {
    const user = userEvent.setup();
    let latest: PrintSpecValues = {};
    render(<SettledHarness onValues={(values) => (latest = values)} />);

    expect(chip("Форзац", "Карти").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("за замовчуванням").length).toBe(2);

    // Макет «Лінія» міняє типове, бо людина форзац ще не чіпала.
    await pick(user, "Макет", "Лінія");
    expect(chip("Форзац", "Чисті").getAttribute("aria-pressed")).toBe("true");
    expect(latest.endpaper).toBe("plain");

    // Клік по поставленому значенню його підтверджує, а не знімає.
    await user.click(chip("Форзац", "Чисті"));
    expect(chip("Форзац", "Чисті").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("за замовчуванням").length).toBe(1);

    // Підтверджене вже не міняється від макета.
    await pick(user, "Макет", "Датований");
    expect(latest.endpaper).toBe("plain");
    expect(latest.backpaper).toBe("maps");
  });
});

describe("що бракує", () => {
  it("шапка стовпчика називає незаповнене чипами, клік веде до поля й фокусує його", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const lane = within(screen.getByRole("region", { name: "Обкладинка" }));
    expect(lane.getByText("Не заповнено:")).toBeTruthy();
    await user.click(lane.getByRole("button", { name: "Матеріал" }));
    expect(document.activeElement).toBe(chip("Матеріал", "Шкірзамінник"));
  });

  it("повністю заповнений стовпчик пише «Усе заповнено»", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const lane = () => within(screen.getByRole("region", { name: "Обкладинка" }));
    expect(lane().queryByText("Усе заповнено")).toBeNull();

    for (const [group, option] of [
      ["Формат", "А5"],
      ["Тип", "Гнучка"],
      ["Поролон", "Без поролону"],
      ["Матеріал", "Папір з друком"],
      ["Друк і ламінація", "4+0 + матова ламінація 1+0"],
    ] as const) {
      await pick(user, group, option);
    }
    expect(lane().queryByText("Не заповнено:")).toBeTruthy();
    await pick(user, "Оздоблення", "Сліпе тиснення");
    expect(lane().getByText("Усе заповнено")).toBeTruthy();
  });

  it("поля зі стрічки «головне» мають тиху позначку «для ціни»", () => {
    render(<Harness />);
    const price = screen.getByText("Макет", { selector: "span" }).closest("div") as HTMLElement;
    expect(within(price).getByText("для ціни")).toBeTruthy();
    const noPrice = screen.getByText("Кути", { selector: "span" }).closest("div") as HTMLElement;
    expect(within(noPrice).queryByText("для ціни")).toBeNull();
  });

  it("«Лише незаповнені» ховає лише те, що було заповнене на момент увімкнення", () => {
    const hidden = new Set(["format"]);
    const { rerender } = render(<Harness />);
    expect(screen.getByText("Формат", { selector: "span" })).toBeTruthy();
    rerender(<PrintSpecFields preset={PRINT_SPEC_DIARY} values={createEmptyPrintSpecValues(PRINT_SPEC_DIARY)} onChange={() => {}} hiddenIds={hidden} />);
    expect(screen.queryByText("Формат", { selector: "span" })).toBeNull();
    expect(screen.getByText("Тип", { selector: "span" })).toBeTruthy();
  });

  it("порожній стовпчик у режимі «Лише незаповнені» — «Усе заповнено»", () => {
    const values = createEmptyPrintSpecValues(PRINT_SPEC_PACKAGE);
    const all = new Set(PRINT_SPEC_PACKAGE.fields.map((field) => field.id));
    render(<PrintSpecFields preset={PRINT_SPEC_PACKAGE} values={values} onChange={() => {}} hiddenIds={all} />);
    for (const title of ["Корпус", "Друк і оздоблення", "Ручки й люверси"]) {
      const lane = within(screen.getByRole("region", { name: title }));
      expect(lane.getAllByText("Усе заповнено").length).toBeGreaterThan(0);
      expect(lane.queryByRole("group")).toBeNull();
    }
  });
});

describe("вузький екран: частини виробу вкладками", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  });
  const squeeze = (px: number) =>
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => px });

  it("показує лише вибрану частину, а клік по сегменту перемикає", async () => {
    squeeze(360);
    const user = userEvent.setup();
    render(<Harness />);

    const tabs = within(screen.getByRole("group", { name: "Частини виробу" }));
    expect(screen.getByRole("region", { name: "Обкладинка" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Блок" })).toBeNull();
    expect(tabs.getByRole("button", { name: /Блок/ })).toBeTruthy();

    await user.click(tabs.getByRole("button", { name: /Блок/ }));
    expect(screen.getByRole("region", { name: "Блок" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Обкладинка" })).toBeNull();
  });

  it("на широкому екрані перемикача немає, усі стовпчики в ряд", () => {
    squeeze(1200);
    render(<Harness />);
    expect(screen.queryByRole("group", { name: "Частини виробу" })).toBeNull();
    expect(screen.getAllByRole("region").length).toBe(3);
  });
});
