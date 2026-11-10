import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildNotificationKeyboard } from "../_notificationDelivery";
import { decidedKeyboard, ORDER_APPROVAL_INFO_CALLBACK } from "./orderApprovalDecision";
import {
  approvalCaption,
  buildApprovalWidgetData,
  fitApprovalWidget,
  isOwnPublicStorageUrl,
  orderApprovalCallbackData,
  parseOrderApprovalCallback,
} from "./orderApprovalWidget";

const ID = "5f0d1c2b-3a4e-4f56-9876-0123456789ab";
const SUPABASE = "https://abc.supabase.co";

const order = {
  id: "o1",
  team_id: "t1",
  quote_number: "TO-1026-0008",
  customer_name: "ФРУТ ТАЙМ FRUIT TIME",
  customer_id: null,
  customer_logo_url: null,
  legal_entity_label: "ТОВ БОН ФРУКТ",
  customer_tax_id: "41052689",
  total: "82980.00",
  currency: "UAH",
  prepayment_pct: "70.00",
  balance_timing: "after_shipment",
  balance_days_after_shipment: 3,
  balance_days_kind: "working",
  contract_production_days: 50,
  incoterms_code: "FCA",
  incoterms_place: null,
  delivery_type: "pickup",
  payment_method_label: "Безготівкові, грн.",
  contract_signed_at: "2026-10-28T06:29:07Z",
  contract_signed_via: "vchasno",
  contract_auto_prolongation: false,
  customer_signatory_authority: "Статут",
  specification_number: 1,
};

const items = [
  { name: "Щоденник", qty: "200", unit: "шт.", line_total: "82980", spec_text: "А5, твердa обкладинка", description: null },
  { name: "Порожня", qty: 0, unit: "шт.", line_total: 0, spec_text: null, description: null },
];

describe("кнопка «Погодити»", () => {
  it("розбирає лише oap:a:<uuid>", () => {
    expect(parseOrderApprovalCallback(orderApprovalCallbackData(ID))).toEqual({ approvalId: ID });
    expect(parseOrderApprovalCallback(`oap:a:${ID}:x`)).toBeNull();
    expect(parseOrderApprovalCallback("oap:a:not-a-uuid")).toBeNull();
    expect(parseOrderApprovalCallback(`oap:r:${ID}`)).toBeNull();
    expect(parseOrderApprovalCallback(ORDER_APPROVAL_INFO_CALLBACK)).toBeNull();
  });

  it("вміщається в 64 байти callback_data", () => {
    expect(Buffer.byteLength(orderApprovalCallbackData(ID))).toBeLessThanOrEqual(64);
  });

  it("«Погодити» і «Повернути» стоять в одному рядку, «Повернути» веде в CRM", () => {
    const keyboard = buildNotificationKeyboard(
      {
        user_id: "u",
        title: "t",
        body: null,
        href: "/orders/production/o1",
        type: "warning",
        telegramActions: [
          { text: "✅ Погодити", callbackData: orderApprovalCallbackData(ID) },
          { text: "↩️ Повернути", href: "/orders/production/o1" },
        ],
      },
      "https://tosho.pro/orders/production/o1",
      (href) => `https://tosho.pro${href}`
    );
    expect(keyboard[0]).toEqual([
      { text: "✅ Погодити", callback_data: `oap:a:${ID}` },
      { text: "↩️ Повернути", url: "https://tosho.pro/orders/production/o1" },
    ]);
  });

  it("після рішення показує, хто й коли погодив", () => {
    const keyboard = decidedKeyboard({
      deciderName: "Ірина Коваль",
      decidedAt: "2026-11-10T08:42:00Z",
      crmUrl: "https://tosho.pro/orders/production/o1",
    });
    expect(keyboard[0][0]).toEqual({ text: "✅ Погоджено · Ірина К., 10:42", callback_data: ORDER_APPROVAL_INFO_CALLBACK });
  });
});

describe("лого тягнемо лише з нашого сховища", () => {
  it("пропускає публічний бакет нашого Supabase", () => {
    expect(isOwnPublicStorageUrl(`${SUPABASE}/storage/v1/object/public/public-assets/x.webp`, SUPABASE)).toBe(true);
  });
  it("не пропускає чужі адреси, http і приватні шляхи", () => {
    expect(isOwnPublicStorageUrl("https://evil.example/storage/v1/object/public/x.webp", SUPABASE)).toBe(false);
    expect(isOwnPublicStorageUrl("http://abc.supabase.co/storage/v1/object/public/x.webp", SUPABASE)).toBe(false);
    expect(isOwnPublicStorageUrl(`${SUPABASE}/storage/v1/object/sign/x.webp`, SUPABASE)).toBe(false);
    expect(isOwnPublicStorageUrl("http://169.254.169.254/latest", SUPABASE)).toBe(false);
    expect(isOwnPublicStorageUrl("not a url", SUPABASE)).toBe(false);
  });
});

describe("дані віджета", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("СП: розбивка оплати, стан договору, без порожніх позицій", () => {
    const data = buildApprovalWidgetData({
      kind: "specification",
      order,
      items,
      requesterName: "Юлія Кравченко",
      requestedAt: "2026-10-30T07:30:00Z",
      now,
    });
    expect(data.t).toBe("Погодити СП №1");
    expect(data.e).toBe("ТОВ БОН ФРУКТ · ЄДРПОУ 41052689");
    expect(data.s).toBe(82980);
    expect(data.pp).toBe(70);
    expect(data.bt).toBe("3 р.д. після відвантаження");
    expect(data.p).toHaveLength(1);
    expect(data.k).toContainEqual(["Договір", "підписано у Вчасно", "g"]);
    expect(data.k).toContainEqual(["Оплата", "безготівкові, грн"]);
    expect(data.f).toBe("Просить Юлія К. · 30 жовтня, 09:30");
  });

  it("договір: пролонгація й підстава підпису замість стану договору", () => {
    const data = buildApprovalWidgetData({ kind: "contract", order, items, requesterName: null, requestedAt: null, now });
    expect(data.t).toBe("Погодити договір");
    expect(data.ns).toBe("сума цього замовлення");
    expect(data.k.map((fact) => fact[0])).toEqual(["Виготовлення", "Пролонгація", "Підстава підпису", "Оплата"]);
  });

  it("незаповнені строки й договір помічає червоним", () => {
    const data = buildApprovalWidgetData({
      kind: "specification",
      order: { ...order, contract_production_days: null, contract_signed_at: null },
      items,
      requesterName: null,
      requestedAt: null,
      now,
    });
    expect(data.k).toContainEqual(["Виготовлення", "не вказано", "w"]);
    expect(data.k).toContainEqual(["Договір", "не підписано", "w"]);
  });

  it("чужий текст не закриває наш скрипт", async () => {
    const html = await fitApprovalWidget(
      () => buildApprovalWidgetData({ kind: "specification", order: { ...order, customer_name: "</script><img>" }, items, requesterName: null, requestedAt: null, now }),
      null
    );
    expect(html).not.toBeNull();
    expect(html!.split("</script>")).toHaveLength(3);
  });

  it("сорок позицій: або вміщається в ліміт Telegram, або null — і тоді йде текст", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...items[0], name: `Позиція ${i}`, spec_text: "дуже довгий опис ".repeat(30) }));
    const html = await fitApprovalWidget(
      (specLimit) => buildApprovalWidgetData({ kind: "specification", order, items: many, requesterName: null, requestedAt: null, specLimit, now }),
      null
    );
    if (html) expect(deflateSync(Buffer.from(html), { level: 9 }).length).toBeLessThanOrEqual(3950);
  });

  it("підпис під віджетом називає замовлення, суму й автора", () => {
    const data = buildApprovalWidgetData({ kind: "specification", order, items, requesterName: "Юлія Кравченко", requestedAt: "2026-10-30T07:30:00Z", now });
    expect(approvalCaption(data)).toBe(
      "<b>TO-1026-0008: погодити СП №1</b>\nФРУТ ТАЙМ FRUIT TIME · 82 980 ₴ · передоплата 70%\n\nПросить Юлія К. · 30 жовтня, 09:30"
    );
  });
});
