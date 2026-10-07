import { voteCategory } from "./category";
import { assignSiteColors } from "./colors";
import { colorsSentence } from "./colorsSentence";
import { normalizeMethods } from "./description";
import { siteListingPrice } from "./price";
import type { DraftContext, DraftModelOutput, DraftVariant, SiteListingDraft, SizeTable } from "./types";

/**
 * Збирання чернетки з двох половин (спека, розділ 4): спершу КОД рахує все,
 * що має одну правильну відповідь (ціни, кольори, фото, розділ голосуванням,
 * речення про кольори), потім мовна модель пише текст, потім код зводить.
 *
 * Помилка вхідних даних — `DraftInputError`: її текст іде людині в
 * `draft_error` як є, тож пишемо його для людини, а не для журналу.
 */
export class DraftInputError extends Error {}

export type PreparedDraft = {
  variants: DraftVariant[];
  colorsSentence: string | null;
  /** Розділ, визначений голосуванням; null — вирішує модель або людина. */
  category: string | null;
  /** Що дати моделі на вибір: рівні за голосами, або весь перелік, або нічого. */
  categoryChoices: string[] | null;
  textile: boolean;
  sizes: string[];
  noSupplierDescription: boolean;
  warnings: string[];
};

const httpsOnly = (images: string[]) =>
  images.filter((url) => typeof url === "string" && /^https:\/\//i.test(url.trim())).map((url) => url.trim());

export function prepareDraft(context: DraftContext): PreparedDraft {
  if (!context.model || context.variants.length === 0) {
    throw new DraftInputError("Моделі вже немає в пулі постачальника — можливо, її прибрали з фіду.");
  }
  const unpriced = context.variants.filter((variant) => siteListingPrice(variant.sitePrice) === null);
  if (unpriced.length > 0) {
    throw new DraftInputError(
      `Немає ціни постачальника для ${unpriced.map((variant) => variant.article).join(", ")} — без неї модель на сайт не йде.`
    );
  }

  const { colors, warnings } = assignSiteColors(
    context.variants.map((variant) => ({
      article: variant.article,
      color: variant.color,
      exactColor: variant.exactColor,
      group: variant.group,
    })),
    context.brandColors
  );
  const variants: DraftVariant[] = context.variants.map((variant, index) => ({
    article: variant.article,
    color: colors[index].color,
    colorSource: colors[index].source,
    price: siteListingPrice(variant.sitePrice) as number,
    supplierPrice: variant.sitePrice as number,
    images: httpsOnly(variant.images ?? []),
  }));

  const noPhoto = variants.filter((variant) => variant.images.length === 0).map((variant) => variant.article);
  if (noPhoto.length > 0) warnings.push(`Без фото: ${noPhoto.join(", ")} — додайте в Хорошопі.`);

  const vote = voteCategory(context.categoryVotes);
  const categoryChoices = vote.category
    ? null
    : vote.tied.length > 0
      ? vote.tied
      : context.siteCategories.length > 0
        ? context.siteCategories
        : null;

  return {
    variants,
    colorsSentence: colorsSentence(variants.length),
    category: vote.category,
    categoryChoices,
    textile: context.model.textile,
    sizes: context.model.sizes,
    noSupplierDescription: !context.model.description,
    warnings,
  };
}

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Відповідь моделі → перевірений вихід. Схема в запиті й так сувора, але
 * текст, що прийшов ззовні, ми однаково не беремо на віру: обрізаємо довжини,
 * знімаємо маркери пунктів, а розділ приймаємо лише ДОСЛІВНО з переліку, який
 * дали, — інакше вигаданий розділ зламав би імпорт.
 */
export function parseDraftModelOutput(raw: unknown, categoryChoices: string[] | null): DraftModelOutput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DraftInputError("Мовна модель відповіла не за схемою — спробуйте ще раз.");
  }
  const record = raw as Record<string, unknown>;
  const title = cleanText(record.title, 160);
  const intro = Array.isArray(record.intro)
    ? record.intro.map((sentence) => cleanText(sentence, 500)).filter(Boolean).slice(0, 4)
    : [];
  if (!title || intro.length === 0) {
    throw new DraftInputError("Мовна модель не дала назви або опису — спробуйте ще раз.");
  }
  const bullets = Array.isArray(record.bullets)
    ? record.bullets
        .map((bullet) => cleanText(bullet, 240).replace(/^[•·\-–—*]\s*/, ""))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const picked = cleanText(record.category, 300);
  return {
    title,
    intro,
    bullets,
    methods: cleanText(record.methods, 300),
    care: cleanText(record.care, 300) || null,
    category: categoryChoices && categoryChoices.includes(picked) ? picked : null,
  };
}

export function assembleDraft(input: {
  prepared: PreparedDraft;
  output: DraftModelOutput;
  sizeTable: SizeTable | null;
  model: string;
  now: Date;
  warnings?: string[];
}): SiteListingDraft {
  const { prepared, output } = input;
  const category = prepared.category ?? output.category;
  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    model: input.model,
    title: output.title,
    intro: output.intro,
    colorsSentence: prepared.colorsSentence,
    bullets: output.bullets,
    sizeTable: input.sizeTable,
    // Примітка про прання — лише для текстилю: у кухля її бути не може, і
    // якщо модель її вигадала, у картку вона не піде.
    care: prepared.textile ? output.care : null,
    textile: prepared.textile,
    methods: normalizeMethods(output.methods),
    category,
    categorySource: prepared.category ? "votes" : output.category ? "model" : null,
    variants: prepared.variants,
    noSupplierDescription: prepared.noSupplierDescription,
    warnings: [...prepared.warnings, ...(input.warnings ?? [])],
  };
}
