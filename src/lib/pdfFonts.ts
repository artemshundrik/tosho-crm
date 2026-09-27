import { Font } from "@react-pdf/renderer";
import RobotoRegular from "@/assets/fonts/Roboto-Regular.ttf?url";
import RobotoBold from "@/assets/fonts/Roboto-Bold.ttf?url";
import { BRAND_FONT_BOLD_URL, BRAND_FONT_FAMILY, BRAND_FONT_REGULAR_URL } from "@/lib/brandFonts";

// Реєстрація шрифтів для @react-pdf (браузер). Викликати один раз перед рендером PDF. Ідемпотентна.
//
// Roboto має повну кирилицю: ним набраний рахунок на оплату, і він же запасний у КП.
// Mariupol — фірмовий шрифт КП; його файли лежать у сховищі, а не в бандлі (`brandFonts`).
let registered = false;

export function ensurePdfFonts() {
  if (registered) return;
  Font.register({
    family: "Roboto",
    fonts: [
      { src: RobotoRegular, fontWeight: "normal" },
      { src: RobotoBold, fontWeight: "bold" },
    ],
  });
  Font.register({
    family: BRAND_FONT_FAMILY,
    fonts: [
      { src: BRAND_FONT_REGULAR_URL, fontWeight: "normal" },
      { src: BRAND_FONT_BOLD_URL, fontWeight: "bold" },
    ],
  });
  // Без переносів по складах (латинські правила ламали б українські слова).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

/**
 * Шрифти КП: фірмовий Mariupol, а за ним Roboto.
 *
 * Roboto — запасний для знаків, яких у Mariupol немає: апострофа «ʼ»,
 * нерозривного пробілу, «✓». @react-pdf для кожного символу бере перший шрифт
 * стека, у якому той є, і без запасного на їхньому місці лишилася б дірка.
 *
 * Межа двох шрифтів має ціну: рядок із таким знаком сідає трохи нижче, а рушій
 * бачить там місце для переносу з дефісом («863-» / «805,00»). Для рідкісного
 * знака в назві з бази це терпимо, для сум — ні, тож із них нерозривний пробіл
 * прибрано ще до рендеру (`pdfNumber` в `OfferDocument`).
 */
export const OFFER_PDF_FONT_FAMILY = [BRAND_FONT_FAMILY, "Roboto"];

/** Запасний набір, коли файли фірмового шрифту не доїхали зі сховища. */
export const OFFER_PDF_FALLBACK_FONT_FAMILY = ["Roboto"];
