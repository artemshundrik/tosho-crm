// Strict HTML sanitizer for contract section bodies.
//
// Manager-edited HTML is later embedded into a printable document opened in a new window,
// and into the CEO diff view. Allow only formatting tags we actually use; strip everything
// else (script, style, on*-handlers, javascript: URLs).

import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "a", "span"];
const ALLOWED_ATTRS = ["href", "rel", "target"];

export const sanitizeContractHtml = (dirtyHtml: string): string =>
  DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOWED_URI_REGEXP: /^(https?|mailto|tel):/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    FORBID_ATTR: ["onload", "onclick", "onerror", "onmouseover", "style"],
  });
