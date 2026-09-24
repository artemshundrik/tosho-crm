import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { buildSheetDump } from "./sheetDump";
import { parseWordDocumentXml, readWordDocumentSheets } from "./readWordDocument";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;

const p = (text: string, extra = "") => `<w:p>${extra}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string, props = "") => `<w:tc>${props}${p(text)}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;

describe("parseWordDocumentXml — ТЗ у Word як «аркуш» для моделі", () => {
  it("абзаци й рядки таблиці йдуть у порядку документа", () => {
    const sheet = parseWordDocumentXml(
      doc(
        p("ТЗ: Welcome Boxes") +
          `<w:tbl>${row(cell("Позиція"), cell("Кількість"), cell("Нанесення"))}${row(
            cell("Футболка чорна"),
            cell("100"),
            cell("DTF, лого на грудях")
          )}</w:tbl>` +
          p("Дедлайн — до 10 жовтня")
      )
    );
    expect(sheet.rows).toEqual([
      ["ТЗ: Welcome Boxes"],
      ["Позиція", "Кількість", "Нанесення"],
      ["Футболка чорна", "100", "DTF, лого на грудях"],
      ["Дедлайн — до 10 жовтня"],
    ]);
  });

  it("об'єднана по горизонталі комірка не зсуває колонки", () => {
    const sheet = parseWordDocumentXml(
      doc(
        `<w:tbl>${row(cell("Шопер"), cell("друк з двох сторін", '<w:tcPr><w:gridSpan w:val="2"/></w:tcPr>'), cell("300"))}</w:tbl>`
      )
    );
    expect(sheet.rows).toEqual([["Шопер", "друк з двох сторін", "", "300"]]);
  });

  it("кілька абзаців у комірці — одна комірка через крапку з комою", () => {
    const sheet = parseWordDocumentXml(doc(`<w:tbl>${row(`<w:tc>${p("Колір: чорний")}${p("Лого: груди")}</w:tc>`)}</w:tbl>`));
    expect(sheet.rows).toEqual([["Колір: чорний; Лого: груди"]]);
  });

  it("текст, розірваний на шматки форматуванням, склеюється; сутності розкодовано", () => {
    const sheet = parseWordDocumentXml(
      doc(`<w:p><w:r><w:t>Плед &quot;</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>фліс</w:t></w:r><w:r><w:t>&quot; &amp; вишивка</w:t></w:r></w:p>`)
    );
    expect(sheet.rows).toEqual([['Плед "фліс" & вишивка']]);
  });

  it("пункт списку позначено, щоб модель бачила перелік", () => {
    const sheet = parseWordDocumentXml(doc(p("Термопляшка 500 мл", '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>')));
    expect(sheet.rows).toEqual([["• Термопляшка 500 мл"]]);
  });

  it("гіперпосилання з r:id і з поля HYPERLINK лягають до свого рядка", () => {
    const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://supplier.ua/p/1?a=1&amp;b=2" TargetMode="External"/>
</Relationships>`;
    const sheet = parseWordDocumentXml(
      doc(
        p("Вступ") +
          `<w:p><w:r><w:t>Блокнот: </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>посилання</w:t></w:r></w:hyperlink></w:p>` +
          `<w:p><w:fldSimple w:instr=" HYPERLINK &quot;https://supplier.ua/p/2&quot; "><w:r><w:t>ручка</w:t></w:r></w:fldSimple></w:p>` +
          `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://supplier.ua/p/3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>чашка</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
      ),
      rels
    );
    expect(sheet.rows).toEqual([["Вступ"], ["Блокнот: посилання"], ["ручка"], ["чашка"]]);
    expect(sheet.links).toEqual([
      { row: 2, url: "https://supplier.ua/p/1?a=1&b=2" },
      { row: 3, url: "https://supplier.ua/p/2" },
      { row: 4, url: "https://supplier.ua/p/3" },
    ]);
  });

  it("напис у фігурі не дублюється запасною копією (mc:Fallback)", () => {
    const shape = `<w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="wps"><w:txbxContent>${p("Лого по центру")}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${p("Лого по центру")}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r>`;
    const sheet = parseWordDocumentXml(doc(`<w:p><w:r><w:t>Макет:</w:t></w:r>${shape}</w:p>`));
    expect(sheet.rows).toEqual([["Макет: Лого по центру"]]);
  });

  it("видалений у режимі правок текст не потрапляє, вставлений — так", () => {
    const sheet = parseWordDocumentXml(
      doc(`<w:p><w:del><w:r><w:delText>200 шт</w:delText></w:r></w:del><w:ins><w:r><w:t>300 шт</w:t></w:r></w:ins></w:p>`)
    );
    expect(sheet.rows).toEqual([["300 шт"]]);
  });

  it("порожні абзаци не займають рядків", () => {
    const sheet = parseWordDocumentXml(doc(`${p("Раз")}<w:p/><w:p><w:r><w:t> </w:t></w:r></w:p>${p("Два")}`));
    expect(sheet.rows).toEqual([["Раз"], ["Два"]]);
  });

  it("службова розмітка Word (rsid, перевірка правопису, закладки, сітка таблиці) не заважає", () => {
    const sheet = parseWordDocumentXml(
      doc(
        `<w:p w:rsidR="00A1B2C3" w:rsidRDefault="00A1B2C3"><w:pPr><w:rPr><w:lang w:val="uk-UA"/></w:rPr></w:pPr><w:proofErr w:type="spellStart"/><w:r w:rsidRPr="00D4"><w:rPr><w:lang w:val="uk-UA"/></w:rPr><w:t>Худі</w:t></w:r><w:proofErr w:type="spellEnd"/><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:bookmarkEnd w:id="0"/></w:p>` +
          `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3005"/><w:gridCol w:w="3005"/></w:tblGrid>` +
          `<w:tr w:rsidR="00E5" w:rsidTr="00E5"><w:tc><w:tcPr><w:tcW w:w="3005" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr>${p("Худі оверсайз")}</w:tc><w:tc><w:tcPr><w:tcW w:w="3005" w:type="dxa"/></w:tcPr>${p("50")}</w:tc></w:tr>` +
          `<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc>${p("100")}</w:tc></w:tr></w:tbl>` +
          `<w:sectPr w:rsidR="00F6"><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`
      )
    );
    expect(sheet.rows).toEqual([["Худі"], ["Худі оверсайз", "50"], ["", "100"]]);
  });

  it("дамп для моделі — той самий формат, що з ексельки", () => {
    const sheet = parseWordDocumentXml(doc(p("Шопер") + `<w:tbl>${row(cell("Шопер"), cell("300"))}</w:tbl>`));
    expect(buildSheetDump([sheet]).text).toBe("1\tШопер\n2\tШопер\t300");
  });
});

describe("readWordDocumentSheets — справжній .docx (zip)", () => {
  const zip = (entries: Record<string, string>) => {
    const container = XLSX.CFB.utils.cfb_new();
    for (const [path, content] of Object.entries(entries)) {
      XLSX.CFB.utils.cfb_add(container, path, new TextEncoder().encode(content));
    }
    return XLSX.CFB.write(container, { type: "array", fileType: "zip" }) as unknown as ArrayLike<number>;
  };

  it("розпаковує документ і читає його таблиці", async () => {
    const bytes = zip({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": doc(`<w:tbl>${row(cell("Футболка"), cell("50"))}</w:tbl>`),
    });
    const file = new File([new Uint8Array(Array.from(bytes))], "ТЗ.docx");
    const sheets = await readWordDocumentSheets(file);
    expect(sheets[0].rows).toEqual([["Футболка", "50"]]);
  });

  it("не-Word під розширенням .docx — зрозуміла помилка, а не падіння", async () => {
    const file = new File([new TextEncoder().encode("це просто текст")], "ТЗ.docx");
    await expect(readWordDocumentSheets(file)).rejects.toThrow(/не документ Word/);
  });
});
