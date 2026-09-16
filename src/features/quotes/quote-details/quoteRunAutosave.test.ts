import { describe, expect, it } from "vitest";

import {
  buildRunsAutosaveSignature,
  changedRunItemIds,
  isBlankDraftRun,
  isPristineAutoDraftRun,
} from "./quoteRunAutosave";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Дві протилежні помилки, між якими живе цей підпис.
 *
 * Ліворуч — REQ-243: відкриття картки не має нічого писати. Сторінка сама
 * створює заготовку для товару без тиражів, і вона одразу розходилась зі
 * збереженим станом, тобто автозбереження писало її в прод через 900 мс, без
 * жодної дії людини.
 *
 * Праворуч — REQ-278: те, що людина зробила руками, має доїхати. Заглушка з
 * REQ-243 глушила БУДЬ-ЯКИЙ порожній тираж, тож тираж, доданий кнопкою
 * «+ Тираж», не доїжджав ніколи — ні порожнім, ні після того, як у нього
 * вписували 1000 шт.
 *
 * Зламати будь-яку з половин можна однією зміною фільтра, і жоден тип про це
 * не скаже.
 */

const RATES = { markupFallback: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 };

/** Кількість тут та сама, що в `PRISTINE`: це і є заготовка, яку дала сторінка. */
const run = (overrides: Partial<QuoteRun> = {}): QuoteRun =>
  ({
    id: "draft-1",
    quantity: 12,
    unit_price_model: 0,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: 40,
    manager_rate: 10,
    fixed_cost_rate: 30,
    vat_rate: 20,
    is_approved: false,
    ...overrides,
  }) as QuoteRun;

const PRISTINE = { id: "draft-1", quantity: 12 };

describe("buildRunsAutosaveSignature", () => {
  it("незаймана заготовка не рахується зміною — відкриття картки нічого не пише", () => {
    expect(buildRunsAutosaveSignature([run()], RATES, new Set(), PRISTINE)).toBe(
      buildRunsAutosaveSignature([], RATES, new Set(), PRISTINE)
    );
  });

  it("перше введене число робить заготовку справжньою зміною", () => {
    expect(
      buildRunsAutosaveSignature([run({ unit_price_model: 336.41 })], RATES, new Set(), PRISTINE)
    ).not.toBe(buildRunsAutosaveSignature([], RATES, new Set(), PRISTINE));
  });

  it("позначка «погодив клієнт» — теж намір, а не порожнеча", () => {
    expect(
      buildRunsAutosaveSignature([run({ is_approved: true })], RATES, new Set(), PRISTINE)
    ).not.toBe(buildRunsAutosaveSignature([], RATES, new Set(), PRISTINE));
  });

  it("порожній тираж, який УЖЕ в базі, з підпису не зникає — інакше його не видалити", () => {
    const saved = new Set(["draft-1"]);
    expect(buildRunsAutosaveSignature([run()], RATES, saved, PRISTINE)).not.toBe(
      buildRunsAutosaveSignature([], RATES, saved, PRISTINE)
    );
  });

  /**
   * РЕГРЕС REQ-278. Заготовку створює САМА сторінка, і мовчати вона має рівно
   * доти, доки її ніхто не торкався. Кількість — дотик: людина вписала 1000
   * замість підставленої, і це намір, а не порожнеча.
   */
  it("кількість, вписана в заготовку сторінки, — це вже зміна", () => {
    expect(
      buildRunsAutosaveSignature([run({ quantity: 1000 })], RATES, new Set(), PRISTINE)
    ).not.toBe(buildRunsAutosaveSignature([], RATES, new Set(), PRISTINE));
  });

  /**
   * РЕГРЕС REQ-278, друга половина. Тираж, доданий кнопкою «+ Тираж», — не
   * заготовка сторінки: клік і є намір. Поки він мовчав разом із заготовкою,
   * доданий тираж не доїжджав до бази взагалі й зникав на перезавантаженні.
   */
  it("тираж, доданий людиною, їде в базу з першої секунди — навіть із самими нулями", () => {
    const added = run({ id: "added-1", quantity: 1 });
    expect(
      buildRunsAutosaveSignature([run(), added], RATES, new Set(), PRISTINE)
    ).not.toBe(buildRunsAutosaveSignature([run()], RATES, new Set(), PRISTINE));
  });

  /**
   * Заготовки немає взагалі — мовчати нема чому. Так виглядає картка, у якої
   * тиражі прочитались із бази: кожен рядок у підписі, і будь-яка правка видна.
   */
  it("без заготовки сторінки не глушиться нічого", () => {
    expect(buildRunsAutosaveSignature([run()], RATES, new Set(), null)).not.toBe(
      buildRunsAutosaveSignature([], RATES, new Set(), null)
    );
  });
});

describe("isPristineAutoDraftRun", () => {
  it("мовчить лише той рядок, чий id сторінка запам'ятала", () => {
    expect(isPristineAutoDraftRun(run(), PRISTINE)).toBe(true);
    expect(isPristineAutoDraftRun(run({ id: "added-1" }), PRISTINE)).toBe(false);
  });

  it("гроші й кількість однаково знімають тишу", () => {
    expect(isPristineAutoDraftRun(run({ quantity: 1000 }), PRISTINE)).toBe(false);
    expect(isPristineAutoDraftRun(run({ logistics_cost: 500 }), PRISTINE)).toBe(false);
  });

  it("порожнеча САМА ПО СОБІ рахується по грошах — кількість поруч, у порівнянні із заготовкою", () => {
    expect(isBlankDraftRun(run({ quantity: 500 }))).toBe(true);
    expect(isBlankDraftRun(run({ logistics_cost: 500 }))).toBe(false);
  });
});

/**
 * Відклик «Зберігаю… / Збережено» стоїть у шапці тиражів КОЖНОЇ позиції, тож
 * питання «що саме змінилось» має відповідь із точністю до товару. Неправда
 * тут гірша за мовчання: «Збережено» над товаром, якого не чіпали, вчить не
 * вірити напису взагалі.
 */
describe("changedRunItemIds", () => {
  const saved = [
    run({ id: "a", quote_item_id: "item-1", unit_price_model: 100 }),
    run({ id: "b", quote_item_id: "item-2", unit_price_model: 200 }),
  ];

  it("бачить лише ту позицію, у якій правили числа", () => {
    const next = [{ ...saved[0], quantity: 1000 }, saved[1]];
    expect([...changedRunItemIds(next, saved)]).toEqual(["item-1"]);
  });

  it("доданий тираж — зміна в СВОЇЙ позиції", () => {
    const next = [...saved, run({ id: "c", quote_item_id: "item-2", unit_price_model: 0 })];
    expect([...changedRunItemIds(next, saved)]).toEqual(["item-2"]);
  });

  it("видалений тираж — теж зміна, і саме там, звідки він зник", () => {
    expect([...changedRunItemIds([saved[0]], saved)]).toEqual(["item-2"]);
  });

  it("нечіпана заготовка сторінки відклику не заслуговує", () => {
    const draft = run({ id: "draft-1", quote_item_id: "item-1" });
    expect(changedRunItemIds([draft], [], PRISTINE).size).toBe(0);
    expect([...changedRunItemIds([{ ...draft, quantity: 1000 }], [], PRISTINE)]).toEqual(["item-1"]);
  });

  it("нічого не змінилось — нічого й не показуємо", () => {
    expect(changedRunItemIds(saved, saved).size).toBe(0);
  });
});
