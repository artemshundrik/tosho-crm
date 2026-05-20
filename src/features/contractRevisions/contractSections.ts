// Data-driven contract sections.
//
// Each contract starts with 8 core sections (cannot be deleted) plus an arbitrary
// number of custom sections appended by the manager. The "Адреси і реквізити сторін"
// block is rendered separately from this array because its structure is parties-grid,
// not editable HTML.
//
// HTML inside `bodyHtml` is the rendered output — at draft creation time we resolve
// all dynamic values (production days, payment %, end date), so subsequent edits
// operate on final HTML. Manager edits do not re-resolve placeholders.

export type ContractSection = {
  id: string;
  title: string;
  bodyHtml: string;
  isCore: boolean;
};

export type ContractRenderContext = {
  productionWorkingDays: number;
  contractEndDate: string;
  hasPaymentBreakdown: boolean;
  paymentAdvancePct: number;
  paymentBalancePct: number;
  balanceTimingPhrase: string;
  balanceAfterShipmentTermSuffix: string;
  contractAutoProlongation: boolean;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const CORE_CONTRACT_SECTION_IDS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export type CoreContractSectionId = (typeof CORE_CONTRACT_SECTION_IDS)[number];

type CoreSectionDef = {
  id: CoreContractSectionId;
  title: string;
  buildBody: (ctx: ContractRenderContext) => string;
};

// IMPORTANT: editing the default text here changes the starting point for FUTURE contracts only.
// Existing contract revisions store their own bodyHtml and are not affected.
const CORE_SECTIONS: ReadonlyArray<CoreSectionDef> = [
  {
    id: "1",
    title: "Предмет договору",
    buildBody: () => `
        <p>Виконавець зобов’язується виготовити та поставити Замовнику рекламно-сувенірну продукцію (надалі – Продукція) в асортименті, кількості та по ціні згідно Специфікаціям, що є невід’ємними частинами цього Договору, а Замовник зобов’язується прийняти Продукцію та оплатити її в порядку та на умовах, визначених Договором.</p>
        <p>На кожне окреме замовлення (партію) Продукції оформлюється Специфікація, в якій зазначається:</p>
        <ul>
          <li>кількість Продукції;</li>
          <li>назва Продукції;</li>
          <li>технічні параметри продукції згідно затверджених макетів та візуалів;</li>
          <li>умови та терміни оплати конкретної партії Продукції;</li>
          <li>строк виготовлення та поставки Продукції Замовнику.</li>
        </ul>`,
  },
  {
    id: "2",
    title: "Порядок виконання, здачі та приймання виконаних робіт",
    buildBody: (ctx) => `
        <p>2.1. Виготовлення Продукції здійснюється партіями відповідно до наданих Замовником і затверджених ним макетів Продукції, підписаних уповноваженою особою Замовника.</p>
        <p>2.2. Поставка здійснюється на склад Замовника. Термін поставки Продукції становить не більше ${ctx.productionWorkingDays} робочих днів з моменту погодження Сторонами та затвердження Замовником оригінал-макету і здійснення передоплати, залежно від події, що наступить пізніше. Якщо на конкретну партію Продукції встановлені інші умови поставки, то вони зазначаються у Специфікації на відповідну партію замовлення.</p>
        <p>2.3. Датою поставки вважається дата фактичної передачі Продукції Замовнику, що зазначається в накладних на виготовлену Продукцію.</p>
        <p>2.4. Приймання Продукції за кількістю та якістю здійснюється сторонами в порядку, що визначається чинним законодавством України.</p>`,
  },
  {
    id: "3",
    title: "Вартість робіт по договору та порядок розрахунків",
    buildBody: (ctx) => {
      const breakdown = ctx.hasPaymentBreakdown
        ? `\n        <p>3.4. Орієнтовний порядок оплати: ${ctx.paymentAdvancePct}% — передоплата перед запуском у виробництво; ${ctx.paymentBalancePct}% — ${escapeHtml(ctx.balanceTimingPhrase)}${ctx.balanceAfterShipmentTermSuffix}. Конкретні суми та строки оплати по кожній партії визначаються у відповідній Специфікації.</p>`
        : "";
      return `
        <p>3.1. Перелік робіт та цін визначаються у Специфікаціях до цього Договору.</p>
        <p>3.2. Оплата за цим Договором здійснюється шляхом перерахування на розрахунковий рахунок Виконавця грошових коштів в національній валюті України, відповідно до умов кожної Специфікації.</p>
        <p>3.3. Зміна вартості робіт по виготовленню Продукції та умов оплати можлива лише за згодою Сторін, що оформляється шляхом підписання Сторонами Додаткової угоди до Специфікації.</p>${breakdown}`;
    },
  },
  {
    id: "4",
    title: "Права та обов’язки сторін",
    buildBody: () => `
        <p>4.1. Замовник зобов’язується своєчасно здійснювати розрахунки з Виконавцем за Договором.</p>
        <p>4.2. Замовник має право контролювати якість виконуваних робіт на їх відповідність погодженим Сторонами Специфікаціям.</p>
        <p>4.3. Виконавець зобов’язується виконувати роботи по виготовленню Продукції згідно Специфікаціям та з додержанням вимог діючих державних стандартів і технічних умов.</p>
        <p>4.4. Виконавець має право вимагати оплати Замовником вартості робіт в порядку та строки, визначені цим Договором.</p>`,
  },
  {
    id: "5",
    title: "Відповідальність сторін",
    buildBody: () => `
        <p>5.1. У випадку порушення умов даного Договору Сторони несуть відповідальність відповідно до чинного законодавства України та даного Договору.</p>
        <p>5.2. За несвоєчасну поставку виготовленої Продукції Виконавець сплачує Замовнику пеню в розмірі подвійної облікової ставки НБУ від вартості несвоєчасно поставленої Продукції за кожен день прострочення.</p>
        <p>5.3. У випадку порушення Замовником строків оплати, передбачених у відповідних Специфікаціях, Замовник сплачує Виконавцю штраф в розмірі 5% від суми заборгованості.</p>`,
  },
  {
    id: "6",
    title: "Форс-мажор",
    buildBody: () => `
        <p>6.1. Сторони звільняються від відповідальності за повне або часткове невиконання своїх зобов’язань по даному Договору, якщо воно викликано обставинами непереборної сили відповідно до чинного законодавства України.</p>`,
  },
  {
    id: "7",
    title: "Врегулювання суперечок",
    buildBody: () => `
        <p>7.1. Всі суперечки між сторонами з приводу виконання даного договору вирішуються шляхом переговорів. У випадку недосягнення згоди спірне питання підлягає вирішенню в Господарському суді згідно чинного законодавства України.</p>`,
  },
  {
    id: "8",
    title: "Інші умови",
    buildBody: (ctx) => {
      const prolongation = ctx.contractAutoProlongation
        ? `\n        <p>8.5. Якщо за 30 (тридцять) календарних днів до закінчення терміну дії цього Договору жодна із Сторін письмово не повідомить іншу про намір припинити його дію, Договір вважається автоматично продовженим на наступний 1 (один) рік на тих самих умовах. Кількість можливих автоматичних пролонгацій не обмежена.</p>`
        : "";
      return `
        <p>8.1. Цей Договір складений українською мовою у двох автентичних примірниках, які мають однакову юридичну силу, по одному для кожної із Сторін.</p>
        <p>8.2. Цей Договір вважається укладеним і набирає чинності з моменту його підписання Сторонами.</p>
        <p>8.3. Додатки до цього Договору є його невід'ємними частинами і мають юридичну силу у разі, якщо вони викладені у письмовій формі та підписані Сторонами.</p>
        <p>8.4. Термін дії Договору до ${escapeHtml(ctx.contractEndDate)} року та/або до повного виконання Сторонами своїх зобов’язань.</p>${prolongation}`;
    },
  },
];

export const buildDefaultContractSections = (ctx: ContractRenderContext): ContractSection[] =>
  CORE_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    bodyHtml: section.buildBody(ctx),
    isCore: true,
  }));

export const renderContractSectionsHtml = (sections: ContractSection[]) =>
  sections
    .map(
      (section, index) =>
        `<h3>${index + 1}. ${escapeHtml(section.title)}</h3>${section.bodyHtml}`
    )
    .join("\n");

export const partiesSectionNumber = (sections: ContractSection[]) => sections.length + 1;

export const isContractSectionArray = (value: unknown): value is ContractSection[] => {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { title?: unknown }).title === "string" &&
      typeof (item as { bodyHtml?: unknown }).bodyHtml === "string" &&
      typeof (item as { isCore?: unknown }).isCore === "boolean"
  );
};
