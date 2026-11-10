// @vitest-environment jsdom
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  classifyContractFile,
  isBrowserViewable,
  prepareContractFile,
  storageExtension,
  textFromDocumentXml,
} from "./customerContractFile";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const DOCX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
  <w:p><w:r><w:t>ДОГОВІР ПОСТАВКИ № 12/05/2026-003</w:t></w:r></w:p>
  <w:p><w:r><w:t xml:space="preserve">м. Київ</w:t></w:r><w:r><w:tab/><w:t>12 травня 2026 р.</w:t></w:r></w:p>
  <w:p><w:r><w:instrText>PAGE</w:instrText><w:t>Діє до</w:t><w:br/><w:t>31.12.2026</w:t></w:r></w:p>
</w:body></w:document>`;

const ODT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h>ДОГОВІР № 45-П</text:h><text:p>м. Львів<text:s text:c="3"/>01.06.2026</text:p></office:text></office:body></office:document-content>`;

const file = (bytes: BlobPart, name: string, type = "") => new File([bytes], name, { type });

describe("customerContractFile", () => {
  it("розпізнає формат за розширенням і за типом", () => {
    expect(classifyContractFile(file("x", "Договір.DOCX"))).toBe("docx");
    expect(classifyContractFile(file("x", "IMG_0001", "image/heic"))).toBe("heic");
    expect(classifyContractFile(file("x", "scan.tif"))).toBe("tiff");
    expect(classifyContractFile(file("x", "old.doc"))).toBe("doc");
    expect(classifyContractFile(file("x", "a.rtf"))).toBe("rtf");
    expect(classifyContractFile(file("x", "a.odt"))).toBe("odt");
    expect(classifyContractFile(file("x", "a.webp"))).toBe("image");
    expect(classifyContractFile(file("x", "notes.txt", "text/plain"))).toBeNull();
  });

  it("бере розширення сховища з типу, а не з назви", () => {
    expect(storageExtension(file("x", "IMG_0001", "image/jpeg"))).toBe("jpg");
    expect(storageExtension(file("x", "Договір.docx"))).toBe("docx");
    expect(storageExtension(file("x", "без розширення"))).toBe("bin");
  });

  it("показує у вкладці лише PDF і фото", () => {
    expect(isBrowserViewable("teams/t/customer-contracts/c/1.pdf")).toBe(true);
    expect(isBrowserViewable("teams/t/customer-contracts/c/1.docx")).toBe(false);
    expect(isBrowserViewable("teams/t/customer-contracts/c/1.tiff")).toBe(false);
  });

  it("дістає текст DOCX абзацами, без службових полів", () => {
    expect(textFromDocumentXml(DOCX_XML, "docx")).toBe(
      "ДОГОВІР ПОСТАВКИ № 12/05/2026-003\nм. Київ\t12 травня 2026 р.\nДіє до\n31.12.2026"
    );
  });

  it("дістає текст ODT із пробілами text:s", () => {
    expect(textFromDocumentXml(ODT_XML, "odt")).toBe("ДОГОВІР № 45-П\nм. Львів   01.06.2026");
  });

  it("віддає на розпізнавання текст DOCX, а файл зберігає як є", async () => {
    const bytes = zipSync({ "word/document.xml": strToU8(DOCX_XML), "[Content_Types].xml": strToU8("<Types/>") });
    const original = file(bytes, "Договір.docx");
    const prepared = await prepareContractFile(original);
    expect(prepared.file).toBe(original);
    expect(prepared.recognition).toEqual({ kind: "text", text: expect.stringContaining("12/05/2026-003") });
    expect(prepared.skipNote).toBeNull();
  });

  it("старий .doc зберігає без розпізнавання й каже чому", async () => {
    const prepared = await prepareContractFile(file("x".repeat(200), "old.doc"));
    expect(prepared.recognition).toBeNull();
    expect(prepared.skipNote).toContain(".doc");
  });

  it("не приймає чужі формати й завеликі файли", async () => {
    await expect(prepareContractFile(file("x", "notes.txt", "text/plain"))).rejects.toThrow("не підходить");
    const huge = file("x", "big.pdf", "application/pdf");
    Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024 });
    await expect(prepareContractFile(huge)).rejects.toThrow("20 МБ");
  });
});
