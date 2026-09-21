import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  buildOfferIntro,
  formatMoney,
  formatMoneyPlain,
  initialsFor,
  offerSummaryText,
  RUN_CHOICE_NOTE,
  unitDiscountPercent,
  type CommercialDocument,
  type CommercialItemRow,
} from "../document";

/**
 * Пропозиція справжнім PDF — векторним, із текстом, який можна виділити.
 *
 * ЧОМУ НЕ «ЗБЕРЕГТИ ЯК PDF» У ВІКНІ ДРУКУ. Це був не файл, а три зайві кроки
 * для менеджера, різний результат у різних браузерах і колонтитули з адресою
 * сторінки поверх документа, який їде замовнику.
 *
 * ЧОМУ ДРУГА РОЗМІТКА, А НЕ ОДНА НА ДВА ВИХОДИ. @react-pdf розуміє власний
 * набір примітивів, а не HTML: спільного шаблону тут не буває в принципі. Тому
 * спільними лишаються ЧИСЛА Й ТЕКСТИ — вони приходять із `document.ts`
 * (`buildOfferIntro`, `offerSummaryText`, `RUN_CHOICE_NOTE`, `initialsFor`,
 * `unitDiscountPercent`), і розійтися двом виходам нема на чому.
 */

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#111213",
    paddingVertical: 40,
    paddingHorizontal: 40,
    lineHeight: 1.4,
  },
  head: { flexDirection: "row", alignItems: "flex-start" },
  headLeft: { flexGrow: 1, flexBasis: 1 },
  // lineHeight на заголовку обов'язковий: успадкований 1.4 лишав рядок нижче,
  // ніж його рахує розкладка, і номер прорахунку налазив на назву.
  title: { fontSize: 22, fontWeight: "bold", letterSpacing: -0.4, lineHeight: 1.15 },
  meta: { fontSize: 9, color: "#5b5c62", marginTop: 8 },
  headRight: { textAlign: "right", width: 170 },
  brand: { fontSize: 15, fontWeight: "bold", letterSpacing: -0.3 },
  manager: { fontSize: 8, color: "#5b5c62", marginTop: 4, lineHeight: 1.5 },
  rule: { height: 2, backgroundColor: "#111213", marginTop: 16, marginBottom: 16 },
  party: { flexDirection: "row", alignItems: "center" },
  partyLabel: { fontSize: 8, color: "#5b5c62", letterSpacing: 0.4 },
  partyName: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  valid: { marginLeft: "auto", backgroundColor: "#f0f1f2", borderRadius: 6, padding: 8, textAlign: "right" },
  validLabel: { fontSize: 7, color: "#5b5c62", letterSpacing: 0.4 },
  validValue: { fontSize: 11, fontWeight: "bold", marginTop: 2 },
  intro: { fontSize: 9.5, color: "#3a3b40", marginTop: 16, lineHeight: 1.55 },
  sectionHead: { fontSize: 10, fontWeight: "bold", color: "#5b5c62", marginTop: 16 },
  visuals: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  visual: { width: 120, height: 84, objectFit: "cover", borderRadius: 6, marginRight: 8, marginBottom: 8 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    border: "1px solid #dbdce1",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  itemNum: {
    width: 20,
    height: 20,
    backgroundColor: "#f0f1f2",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: "bold",
    color: "#5b5c62",
    textAlign: "center",
    paddingTop: 4,
  },
  photo: { width: 62, height: 62, borderRadius: 6, objectFit: "cover", marginLeft: 10 },
  photoInitials: {
    width: 62,
    height: 62,
    borderRadius: 6,
    marginLeft: 10,
    backgroundColor: "#e3eaf4",
    color: "#2a5c94",
    fontSize: 17,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: 21,
  },
  itemBody: { flexGrow: 1, flexBasis: 1, marginLeft: 10, marginRight: 10 },
  itemName: { fontSize: 10, fontWeight: "bold", lineHeight: 1.3 },
  itemLine: { fontSize: 8.5, color: "#5b5c62", marginTop: 4 },
  runs: { flexDirection: "row" },
  run: { width: 92, border: "1px solid #dbdce1", borderRadius: 6, padding: 6, marginLeft: 6 },
  runQty: { fontSize: 7, color: "#5b5c62", letterSpacing: 0.4 },
  runUnit: { fontSize: 8, color: "#3a3b40", marginTop: 3 },
  runTotal: { fontSize: 11, fontWeight: "bold", marginTop: 1 },
  runHint: { fontSize: 7, color: "#037c52", marginTop: 2 },
  empty: { fontSize: 9, color: "#5b5c62", marginTop: 8 },
  summary: { backgroundColor: "#f0f1f2", borderRadius: 8, padding: 14, marginTop: 18 },
  summaryTitle: { fontSize: 11, fontWeight: "bold" },
  summaryText: { fontSize: 9, color: "#3a3b40", marginTop: 5, lineHeight: 1.55 },
  summaryNote: { fontSize: 8, color: "#5b5c62", marginTop: 8, lineHeight: 1.55 },
  foot: { fontSize: 8, color: "#5b5c62", textAlign: "center", marginTop: 14 },
});

/** Адреси картинок уже перетворені на data-URL: див. `resolvePdfImages`. */
export type PdfImageMap = Record<string, string>;

function ItemCard({ item, images }: { item: CommercialItemRow; images: PdfImageMap }) {
  const photo = item.imageUrl ? images[item.imageUrl] : "";
  const lines = [
    item.methodsSummary ? `Нанесення: ${item.methodsSummary}` : "",
    item.placementSummary ? `Місце: ${item.placementSummary}` : "",
  ].filter(Boolean);

  return (
    <View style={styles.item} wrap={false}>
      <Text style={styles.itemNum}>{item.position}</Text>
      {photo ? (
        <Image src={photo} style={styles.photo} />
      ) : (
        <Text style={styles.photoInitials}>{initialsFor(item.name)}</Text>
      )}
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{item.name}</Text>
        {lines.length > 0 ? <Text style={styles.itemLine}>{lines.join(" · ")}</Text> : null}
        {item.description ? <Text style={styles.itemLine}>{item.description}</Text> : null}
      </View>
      <View style={styles.runs}>
        {item.runs.map((run, index) => {
          const discount = unitDiscountPercent(item.runs, index);
          return (
            <View key={run.id} style={styles.run}>
              <Text style={styles.runQty}>
                {formatMoneyPlain(run.qty)} {item.unit}
              </Text>
              <Text style={styles.runUnit}>
                {formatMoneyPlain(run.unitPrice)} грн/{item.unit}
              </Text>
              <Text style={styles.runTotal}>{formatMoney(run.lineTotal)}</Text>
              {discount > 0 ? (
                <Text style={styles.runHint}>
                  −{discount} % за {item.unit}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OfferDocument({ doc, images }: { doc: CommercialDocument; images: PdfImageMap }) {
  const hasRunChoice = doc.sections.some((section) => section.items.some((item) => item.runs.length > 1));
  const showSectionHeads = doc.sections.length > 1;
  const quoteNumbers = doc.sections.map((section) => section.quoteNumber).filter(Boolean);

  return (
    <Document title={doc.title} author="ToSho">
      <Page size="A4" style={styles.page}>
        <View style={styles.head} fixed={false}>
          <View style={styles.headLeft}>
            <Text style={styles.title}>Комерційна пропозиція</Text>
            <Text style={styles.meta}>
              {quoteNumbers.length > 0 ? `№ ${quoteNumbers.join(", ")} · ` : ""}від {doc.createdAt}
            </Text>
          </View>
          <View style={styles.headRight}>
            <Text style={styles.brand}>ToSho</Text>
            {doc.manager ? (
              <Text style={styles.manager}>
                {[`${doc.manager.name}, менеджер`, doc.manager.phone, doc.manager.email]
                  .filter(Boolean)
                  .join("\n")}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.party}>
          <View>
            <Text style={styles.partyLabel}>ДЛЯ</Text>
            <Text style={styles.partyName}>{doc.customerName}</Text>
          </View>
          {doc.validUntil ? (
            <View style={styles.valid}>
              <Text style={styles.validLabel}>ПРОПОЗИЦІЯ ДІЙСНА ДО</Text>
              <Text style={styles.validValue}>{doc.validUntil}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.intro}>{buildOfferIntro(doc)}</Text>

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
              section.items.map((item) => <ItemCard key={item.id} item={item} images={images} />)
            )}
          </View>
        ))}

        <View style={styles.summary} wrap={false}>
          <Text style={styles.summaryTitle}>Підсумок</Text>
          <Text style={styles.summaryText}>{offerSummaryText(doc)}</Text>
          {hasRunChoice ? <Text style={styles.summaryNote}>{RUN_CHOICE_NOTE}</Text> : null}
        </View>

        <Text style={styles.foot}>Ціни вказані з ПДВ.</Text>
      </Page>
    </Document>
  );
}
