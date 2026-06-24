import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceDocParams } from "../documentHtml";

// Векторний (текстовий, з можливістю виділення/копіювання) PDF рахунку.
// Дані — той самий InvoiceDocParams, що й HTML-друк, тож одне джерело даних.

const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("uk-UA");
};

const BORDER = "1px solid #e5e7eb";

const styles = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 10, paddingVertical: 44, paddingHorizontal: 40, color: "#111827", lineHeight: 1.4 },
  h1: { fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  h2: { fontSize: 11, color: "#6b7280", marginBottom: 18 },
  block: { marginBottom: 8 },
  label: { color: "#6b7280" },
  bold: { fontWeight: "bold" },
  muted: { color: "#6b7280", fontSize: 9, marginTop: 2 },
  table: { marginTop: 14, borderTop: BORDER, borderLeft: BORDER },
  tr: { flexDirection: "row" },
  thRow: { backgroundColor: "#f9fafb" },
  cNo: { width: 32, padding: 6, borderRight: BORDER, borderBottom: BORDER },
  cName: { flexGrow: 1, flexBasis: 1, padding: 6, borderRight: BORDER, borderBottom: BORDER },
  cSum: { width: 110, padding: 6, borderRight: BORDER, borderBottom: BORDER, textAlign: "right" },
  totals: { marginTop: 14, marginLeft: "auto", width: 250 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  sign: { marginTop: 48, flexDirection: "row", justifyContent: "space-between" },
});

export function InvoiceDocument({ params }: { params: InvoiceDocParams }) {
  const net = params.amount - (params.vatAmount || 0);
  const sellerLines = [
    params.sellerEdrpou ? `ЄДРПОУ: ${params.sellerEdrpou}` : "",
    params.sellerIpn ? `ІПН: ${params.sellerIpn}` : "",
    params.sellerIban ? `IBAN: ${params.sellerIban}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");

  return (
    <Document title={`Рахунок ${params.number}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>РАХУНОК № {params.number || "—"}</Text>
        <Text style={styles.h2}>від {fmtDate(params.issueDate)}</Text>

        <View style={styles.block}>
          <Text>
            <Text style={styles.label}>Постачальник: </Text>
            <Text style={styles.bold}>{params.sellerName}</Text>
          </Text>
          {sellerLines ? <Text style={styles.muted}>{sellerLines}</Text> : null}
        </View>

        <View style={styles.block}>
          <Text>
            <Text style={styles.label}>Платник: </Text>
            <Text style={styles.bold}>{params.buyerName}</Text>
          </Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.tr, styles.thRow]}>
            <Text style={[styles.cNo, styles.bold]}>№</Text>
            <Text style={[styles.cName, styles.bold]}>Найменування</Text>
            <Text style={[styles.cSum, styles.bold]}>Сума, грн</Text>
          </View>
          <View style={styles.tr}>
            <Text style={styles.cNo}>1</Text>
            <Text style={styles.cName}>
              {params.description}
              {params.orderNumber ? ` (замовлення ${params.orderNumber})` : ""}
            </Text>
            <Text style={styles.cSum}>{money(net)}</Text>
          </View>
        </View>

        <View style={styles.totals}>
          {params.vatRate ? (
            <>
              <View style={styles.totRow}>
                <Text>Без ПДВ:</Text>
                <Text>{money(net)}</Text>
              </View>
              <View style={styles.totRow}>
                <Text>ПДВ {params.vatRate}%:</Text>
                <Text>{money(params.vatAmount)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.totRow}>
              <Text style={styles.muted}>Без ПДВ</Text>
            </View>
          )}
          <View style={styles.totRow}>
            <Text style={styles.bold}>Разом до сплати:</Text>
            <Text style={styles.bold}>{money(params.amount)}</Text>
          </View>
        </View>

        {params.sellerIban ? <Text style={styles.muted}>Оплата на IBAN: {params.sellerIban}</Text> : null}

        <View style={styles.sign}>
          <Text>Виписав(ла): _______________________</Text>
          <Text>М.П.</Text>
        </View>
      </Page>
    </Document>
  );
}
