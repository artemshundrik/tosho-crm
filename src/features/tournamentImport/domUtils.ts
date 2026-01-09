import { normalizeSpace } from "./textUtils";

export function parseHtmlToDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function getText(el: Element | null | undefined): string {
  if (!el) return "";
  return normalizeSpace(el.textContent ?? "");
}
