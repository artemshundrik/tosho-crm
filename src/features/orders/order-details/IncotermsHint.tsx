import { InfoHint } from "./OrderHints";

/** Підказка, як обрати базис поставки Incoterms 2020 (вікно умов оплати). */
export const IncotermsHint = () => (
  <InfoHint title="Як обрати Incoterms" widthClass="w-[440px]">
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-foreground">CPT — підходить, якщо:</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>ми самостійно оформлюємо відправку (Нова Пошта / Meest / Укрпошта);</li>
          <li>ми сплачуємо за доставку;</li>
          <li>
            Замовник погоджується, що після передачі товару Перевізнику відповідальність за
            транспортування переходить до нього;
          </li>
          <li>у договорі або СП це чітко зазначено — претензії по транспортуванню вирішуються через Перевізника.</li>
        </ul>
        <div className="mt-2 font-medium text-foreground">У Специфікації, пункт 3.2:</div>
        <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-2xs leading-4 text-foreground">
          3.2 Умови доставки: CPT, адресна доставка Нова Пошта: &lt;адреса Замовника з картки клієнта&gt;, Incoterms® 2020
        </div>
      </div>
      <div className="border-t border-border/60 pt-3">
        <div className="font-semibold text-foreground">CIP — підходить, якщо:</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>товар дорогий;</li>
          <li>велика партія подарункових наборів;</li>
          <li>техніка (павери, bluetooth-колонки, EcoFlow), дорогий мерч, преміальна продукція;</li>
          <li>оформлюємо відправку з великою оголошеною вартістю (страхуванням);</li>
          <li>
            ми несемо всі витрати по доставці та страхуванню (компенсаційний захист доставки),
            поки товар не отримав Замовник.
          </li>
        </ul>
        <div className="mt-2 font-medium text-foreground">У Специфікації:</div>
        <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-2xs leading-4 text-foreground">
          Умови поставки: CIP, &lt;місце доставки&gt;, згідно Incoterms® 2020. Доставка товару
          здійснюється за рахунок Постачальника через службу доставки Нова Пошта (або Укрпошта /
          Meest Express) із оформленням страхування (оголошеної вартості відправлення) за наш
          рахунок. Ризик випадкової втрати або пошкодження товару переходить до Замовника
          відповідно до погоджених умов поставки.
        </div>
      </div>
    </div>
  </InfoHint>
);
