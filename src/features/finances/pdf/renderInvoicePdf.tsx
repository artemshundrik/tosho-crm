import { pdf } from "@react-pdf/renderer";
import type { InvoiceDocParams } from "../documentHtml";
import { InvoiceDocument } from "./InvoiceDocument";
import { ensurePdfFonts } from "./pdfFonts";

// Рендер рахунку у справжній (текстовий) PDF на клієнті → Blob.
export async function renderInvoicePdfBlob(params: InvoiceDocParams): Promise<Blob> {
  ensurePdfFonts();
  return pdf(<InvoiceDocument params={params} />).toBlob();
}

// Blob → base64 (без data-URL префікса) для відправки в Netlify-функцію Вчасно.
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function renderInvoicePdfBase64(params: InvoiceDocParams): Promise<string> {
  return blobToBase64(await renderInvoicePdfBlob(params));
}
