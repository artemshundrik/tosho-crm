import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  formatMoney,
  formatMoneyPlain,
  getCommercialDocName,
  initialsFor,
  offerSummaryText,
  OFFER_DOC_LABEL,
  OFFER_HEADLINE,
  OFFER_INTRO_TEXT,
  OFFER_LOCKUP_URL,
  OFFER_LOGO_URL,
  OFFER_MOTTO,
  OFFER_NEXT_STEP_TITLE,
  OFFER_PARTNER_TEXT,
  stripSupplierTag,
  RUN_CHOICE_NOTE,
  unitDiscountPercent,
  type CommercialDocument,
  type CommercialItemRow,
} from "../document";

/**
 * Пропозиція справжнім PDF — векторним, із текстом, який можна виділити.
 *
 * ЧОМУ ДРУГА РОЗМІТКА, А НЕ ОДНА НА ДВА ВИХОДИ. @react-pdf розуміє власний
 * набір примітивів, а не HTML: спільного шаблону тут не буває в принципі. Тому
 * спільними лишаються ЧИСЛА Й ТЕКСТИ — вони приходять із `document.ts`, і
 * розійтися двом виходам нема на чому.
 *
 * РОЗМІРИ — ЦЕ ПІКСЕЛІ МАКЕТА, ПОДІЛЕНІ НА 0,75. Сторінка A4 має 794 px ширини
 * й 595 pt, тож один піксель макета = 0,75 pt. Без цього перерахунку документ
 * виходив би приблизно на третину дрібнішим за те, що бачив менеджер у прев'ю.
 *
 * НОМЕРА СТОРІНКИ НЕМАЄ, хоч у макеті він був. Динамічний вміст @react-pdf
 * малює лише через `render`, і в цій версії воно не працює в жодному вигляді:
 * `render` на вкладеному вузлі мовчки викидає ВЕСЬ батьківський стовпчик (так
 * зникли контакти менеджера), а окремим `fixed`-вузлом не малює нічого. Ставити
 * замість нього статичну «01» не можна: на другій сторінці вона брехала б.
 *
 * НАСИЧЕНОСТЕЙ РІВНО ДВІ. Roboto зареєстрований як normal і bold (`pdfFonts`),
 * і проміжні 500/600 рушій не знайде — він упаде, а не підбере найближчу. Тому
 * все, що в макеті 600, тут bold.
 */

const INK = "#0e0e10";
const MUTE = "#6b6c72";
const SOFT = "#8b8c92";
const HAIR = "#dcdcd6";
const RULE = "#e4e4e7";
const ACCENT = "#b0136b";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 10,
    color: INK,
    paddingTop: 40,
    paddingHorizontal: 40,
    // Місце під колонтитул: він стоїть `fixed` поверх потоку, тож нижнє поле
    // мусить бути більшим за нього, інакше текст полізе під лінію.
    paddingBottom: 96,
    lineHeight: 1.45,
  },
  head: { flexDirection: "row", alignItems: "flex-start" },
  lockup: { width: 100 },
  brandFallback: { fontSize: 14, fontWeight: "bold" },
  headRight: { marginLeft: "auto", textAlign: "right" },
  eyebrow: { fontSize: 6.5, fontWeight: "bold", letterSpacing: 0.9, textTransform: "uppercase", color: MUTE },
  docNo: { fontSize: 10, fontWeight: "bold", marginTop: 4 },
  validLabel: { marginTop: 8 },
  validValue: { fontSize: 10, fontWeight: "bold", marginTop: 2 },
  // lineHeight на заголовку обов'язковий: успадкований 1.45 лишав рядок нижче,
  // ніж його рахує розкладка, і підзаголовок налазив на назву.
  h1: { fontSize: 17, fontWeight: "bold", letterSpacing: 0.2, lineHeight: 1.2, marginTop: 15, textTransform: "uppercase" },
  ledeSub: { fontSize: 12, color: MUTE, marginTop: 2 },
  intro: { fontSize: 10, color: MUTE, marginTop: 8, lineHeight: 1.6, maxWidth: 380 },
  sectionHead: { fontSize: 8, fontWeight: "bold", letterSpacing: 0.7, textTransform: "uppercase", color: MUTE, marginTop: 14 },
  visuals: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  visual: { width: 112, height: 79, objectFit: "cover", borderRadius: 3, borderWidth: 1, borderColor: "#e6e6e1", marginRight: 6, marginBottom: 6 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: HAIR,
    borderRadius: 12,
    padding: 9,
    marginTop: 8,
  },
  photo: { width: 100, height: 100, borderWidth: 1, borderColor: "#e6e6e1", borderRadius: 3, objectFit: "cover" },
  photoInitials: {
    width: 100,
    height: 100,
    borderWidth: 1,
    borderColor: "#e6e6e1",
    borderRadius: 3,
    backgroundColor: "#f4f7fc",
    color: "#234f80",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: 36,
  },
  itemBody: { flexGrow: 1, flexBasis: 1, marginLeft: 12 },
  itemNum: { fontSize: 7.5, fontWeight: "bold", letterSpacing: 0.9, color: ACCENT },
  itemName: { fontSize: 11.5, fontWeight: "bold", marginTop: 3, lineHeight: 1.3 },
  itemSpec: { fontSize: 9, color: MUTE, marginTop: 2 },
  runsHead: { flexDirection: "row", marginTop: 8, paddingBottom: 4 },
  runsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: RULE, paddingVertical: 6 },
  th: { fontSize: 7.5, fontWeight: "bold", letterSpacing: 0.7, textTransform: "uppercase", color: MUTE },
  qty: { fontSize: 10 },
  unit: { fontSize: 10, color: MUTE },
  sum: { fontSize: 11, fontWeight: "bold", textAlign: "right" },
  gain: { fontSize: 8, color: "#026a46", textAlign: "right" },
  note: { fontSize: 8, color: SOFT, marginTop: 8, lineHeight: 1.55 },
  closing: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: HAIR },
  closingTitle: { fontSize: 11, fontWeight: "bold" },
  closingText: { fontSize: 10, color: MUTE, marginTop: 4, lineHeight: 1.6 },
  empty: { fontSize: 10, color: MUTE, marginTop: 8 },
  foot: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 34,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: HAIR,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  mark: { width: 36 },
  motto: { fontSize: 8.5, fontWeight: "bold", letterSpacing: 0.5, marginTop: 6 },
  footText: { fontSize: 8, color: MUTE, marginTop: 3, lineHeight: 1.5, maxWidth: 300 },
  // Явна ширина, а не `marginLeft: "auto"`: у @react-pdf авто-відступ праву
  // колонку не притискає — ліва з flexGrow зʼїдала всю ширину, і контакти
  // з номером сторінки виїжджали за край аркуша.
  footRight: { width: 150, textAlign: "right" },
  footLine: { fontSize: 8, color: MUTE, lineHeight: 1.55 },
});

export type PdfImageMap = Record<string, string>;

/** Ширини колонок таблиці тиражів — ті самі, що в HTML-виході. */
const COL = { qty: "26%", unit: "24%", sum: "26%", gain: "24%" } as const;

function RunTable({ item, showGain }: { item: CommercialItemRow; showGain: boolean }) {
  return (
    <View>
      <View style={styles.runsHead}>
        <Text style={[styles.th, { width: COL.qty }]}>Тираж</Text>
        <Text style={[styles.th, { width: COL.unit }]}>Ціна за шт.</Text>
        <Text style={[styles.th, { width: showGain ? COL.sum : "50%", textAlign: "right" }]}>Вартість</Text>
        {showGain ? <Text style={[styles.th, { width: COL.gain, textAlign: "right" }]}>Вигода</Text> : null}
      </View>
      {item.runs.map((run, index) => {
        const discount = unitDiscountPercent(item.runs, index);
        return (
          <View key={run.id} style={styles.runsRow}>
            <Text style={[styles.qty, { width: COL.qty }]}>
              {formatMoneyPlain(run.qty)} {item.unit}
            </Text>
            <Text style={[styles.unit, { width: COL.unit }]}>{formatMoneyPlain(run.unitPrice)} грн</Text>
            <Text style={[styles.sum, { width: showGain ? COL.sum : "50%" }]}>{formatMoney(run.lineTotal)}</Text>
            {showGain ? (
              <Text style={[styles.gain, { width: COL.gain }]}>
                {discount > 0 ? `−${discount} % за ${item.unit}` : "—"}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ItemCard({
  item,
  images,
  showGain,
}: {
  item: CommercialItemRow;
  images: PdfImageMap;
  showGain: boolean;
}) {
  const src = item.imageUrl ? images[item.imageUrl] : undefined;
  const specs = [
    item.description,
    [item.methodsSummary, item.placementSummary].filter(Boolean).join(" — "),
  ].filter(Boolean);

  return (
    <View style={styles.item} wrap={false}>
      {src ? (
        <Image src={src} style={styles.photo} />
      ) : (
        <Text style={styles.photoInitials}>{initialsFor(item.name)}</Text>
      )}
      <View style={styles.itemBody}>
        <Text style={styles.itemNum}>{String(item.position).padStart(2, "0")}</Text>
        {/* maxLines={1} — рівно один рядок, як у прикладі: довгі назви від
            постачальників інакше перебивають таблицю тиражів. Обрізається показ,
            а не дані. */}
        <Text style={styles.itemName}>{stripSupplierTag(item.name)}</Text>
        {specs.map((line) => (
          <Text key={line} style={styles.itemSpec}>
            {line}
          </Text>
        ))}
        <RunTable item={item} showGain={showGain} />
      </View>
    </View>
  );
}

export function OfferDocument({ doc, images }: { doc: CommercialDocument; images: PdfImageMap }) {
  const hasRunChoice = doc.sections.some((section) => section.items.some((item) => item.runs.length > 1));
  const showSectionHeads = doc.sections.length > 1;
  const quoteNumbers = doc.sections.map((section) => section.quoteNumber).filter(Boolean);
  const numberLine = [quoteNumbers.length > 0 ? `№ ${quoteNumbers.join(", ")}` : "", doc.createdAt]
    .filter(Boolean)
    .join(" · ");
  const contactLines = doc.manager
    ? [`${doc.manager.name}, менеджер`, doc.manager.phone, doc.manager.email].filter(Boolean)
    : [];

  return (
    <Document title={getCommercialDocName(doc)} author="ToSho">
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          {images[OFFER_LOCKUP_URL] ? (
            <Image src={images[OFFER_LOCKUP_URL]} style={styles.lockup} />
          ) : (
            /* Лого не намалювалось — назва словом: документ без жодного знака
               відправника гірший за документ без картинки. */
            <Text style={styles.brandFallback}>ToSho</Text>
          )}
          <View style={styles.headRight}>
            <Text style={styles.eyebrow}>{OFFER_DOC_LABEL}</Text>
            <Text style={styles.docNo}>{numberLine}</Text>
            {doc.validUntil ? (
              <>
                <Text style={[styles.eyebrow, styles.validLabel]}>Пропозиція дійсна до</Text>
                <Text style={styles.validValue}>{doc.validUntil}</Text>
              </>
            ) : null}
          </View>
        </View>

        <Text style={styles.h1}>{OFFER_HEADLINE}</Text>
        {doc.customerName ? <Text style={styles.ledeSub}>для {doc.customerName}</Text> : null}
        <Text style={styles.intro}>{OFFER_INTRO_TEXT}</Text>

        {doc.sections.map((section, index) => (
          <View key={section.quoteId}>
            {showSectionHeads ? (
              <Text style={styles.sectionHead}>
                {index + 1}. {section.quoteNumber}
              </Text>
            ) : null}
            {section.visualizations.length > 0 ? (
              <View style={styles.visuals}>
                {section.visualizations
                  .map((file) => images[file.url])
                  .filter(Boolean)
                  .map((src, visualIndex) => (
                    <Image key={`${section.quoteId}-visual-${visualIndex}`} src={src} style={styles.visual} />
                  ))}
              </View>
            ) : null}
            {section.items.length === 0 ? (
              <Text style={styles.empty}>У цьому прорахунку немає товарних позицій.</Text>
            ) : (
              section.items.map((item) => (
                <ItemCard key={item.id} item={item} images={images} showGain={hasRunChoice} />
              ))
            )}
          </View>
        ))}

        {hasRunChoice ? <Text style={styles.note}>{RUN_CHOICE_NOTE}</Text> : null}

        <View style={styles.closing} wrap={false}>
          <Text style={styles.closingTitle}>{OFFER_NEXT_STEP_TITLE}</Text>
          <Text style={styles.closingText}>{offerSummaryText(doc)}</Text>
        </View>

        {/* Колонтитул `fixed` — він повторюється на КОЖНІЙ сторінці, і номер у
            ньому справжній. Сказати рушію «лише на останній» не можна. */}
        <View style={styles.foot} fixed>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            {images[OFFER_LOGO_URL] ? <Image src={images[OFFER_LOGO_URL]} style={styles.mark} /> : null}
            <Text style={styles.motto}>{OFFER_MOTTO}</Text>
            <Text style={styles.footText}>{OFFER_PARTNER_TEXT}</Text>
          </View>
          <View style={styles.footRight}>
            {contactLines.map((line) => (
              <Text key={line} style={styles.footLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
