import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

async function writeToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export async function copyText(value: string, successMessage = "Посилання скопійовано") {
  await writeToClipboard(value);
  toast.success(successMessage);
}

function splitWithMatches(text: string, regex: RegExp) {
  const parts: Array<{ value: string; matched: boolean }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const matchedText = match[0];
    if (index > lastIndex) {
      parts.push({ value: text.slice(lastIndex, index), matched: false });
    }
    parts.push({ value: matchedText, matched: true });
    lastIndex = index + matchedText.length;
  }

  if (lastIndex < text.length) {
    parts.push({ value: text.slice(lastIndex), matched: false });
  }

  return parts;
}

function renderMentionSegments(text: string, keyPrefix: string) {
  return splitWithMatches(text, MENTION_TOKEN_REGEX).map((part, index) =>
    part.matched ? (
      <span key={`${keyPrefix}-mention-${index}`} className="font-semibold text-primary">
        {part.value}
      </span>
    ) : (
      <span key={`${keyPrefix}-text-${index}`}>{part.value}</span>
    )
  );
}

function InlineCopyableLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const title = useMemo(() => {
    try {
      const parsed = new URL(url);
      return parsed.toString();
    } catch {
      return url;
    }
  }, [url]);

  return (
    <span className={cn("group/link inline-flex max-w-full items-center gap-1 align-baseline", className)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="min-w-0 break-all text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary/80"
        onClick={(event) => event.stopPropagation()}
      >
        {url}
      </a>
      <button
        type="button"
        title="Скопіювати посилання"
        aria-label="Скопіювати посилання"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/link:opacity-100"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void copyText(url).then(() => setCopied(true)).catch(() => toast.error("Не вдалося скопіювати посилання"));
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export function renderInlineRichText(
  text: string,
  options?: {
    highlightMentions?: boolean;
  }
): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  const formatPattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

  const renderPlainText = (value: string, prefix: string) => {
    const renderedParts: ReactNode[] = [];
    for (const [index, part] of splitWithMatches(value, URL_REGEX).entries()) {
      if (!part.value) continue;
      if (part.matched) {
        renderedParts.push(<InlineCopyableLink key={`${prefix}-url-${index}`} url={part.value} />);
        continue;
      }
      if (options?.highlightMentions) {
        renderedParts.push(...renderMentionSegments(part.value, `${prefix}-mentions-${index}`));
      } else {
        renderedParts.push(part.value);
      }
    }
    return renderedParts;
  };

  for (const match of text.matchAll(formatPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(...renderPlainText(text.slice(cursor, index), `plain-${key++}`));
    }
    if (match[2]) {
      parts.push(<strong key={`b-${key++}`}>{renderPlainText(match[2], `bold-${key}`)}</strong>);
    } else if (match[3]) {
      parts.push(<em key={`i-${key++}`}>{renderPlainText(match[3], `italic-${key}`)}</em>);
    } else {
      parts.push(match[0]);
    }
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(...renderPlainText(text.slice(cursor), `tail-${key++}`));
  }

  return parts;
}

export function renderRichTextBlocks(
  value: string | null | undefined,
  options?: {
    emptyFallback?: ReactNode;
    highlightMentions?: boolean;
  }
) {
  const text = value?.trim();
  if (!text) return options?.emptyFallback ?? <span>Порожній текст</span>;

  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let currentList:
    | {
        type: "ul" | "ol";
        items: Array<{ key: string; lines: string[]; orderNumber?: number }>;
      }
    | null = null;

  const flushList = () => {
    if (!currentList || currentList.items.length === 0) return;

    const renderedItems = currentList.items.map((item) => (
      <li key={item.key}>
        <div className="space-y-1.5">
          {item.lines.map((line, index) => (
            <div key={`${item.key}-line-${index}`} className="whitespace-pre-wrap break-words">
              {renderInlineRichText(line, options)}
            </div>
          ))}
        </div>
      </li>
    ));

    if (currentList.type === "ul") {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-3 pl-5 marker:text-foreground/75">
          {renderedItems}
        </ul>
      );
    } else {
      blocks.push(
        <ol
          key={`ol-${blocks.length}`}
          start={currentList.items[0]?.orderNumber ?? 1}
          className="list-decimal space-y-3 pl-6 marker:font-semibold marker:text-foreground/85"
        >
          {renderedItems}
        </ol>
      );
    }

    currentList = null;
  };

  const ensureList = (type: "ul" | "ol") => {
    if (!currentList || currentList.type !== type) {
      flushList();
      currentList = { type, items: [] };
    }
    return currentList;
  };

  const appendLineToCurrentListItem = (line: string) => {
    const lastItem = currentList?.items[currentList.items.length - 1];
    if (!lastItem) return false;
    lastItem.lines.push(line);
    return true;
  };

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const headingMatch = trimmed.match(/^##\s+(.*)$/);
    if (headingMatch) {
      flushList();
      blocks.push(
        <div key={`h-${lineIndex}`} className="text-sm font-semibold leading-7 text-foreground">
          {renderInlineRichText(headingMatch[1], options)}
        </div>
      );
      return;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      ensureList("ol").items.push({
        key: `ol-li-${lineIndex}`,
        lines: [orderedMatch[2]],
        orderNumber: Number(orderedMatch[1]) || undefined,
      });
      return;
    }

    const bulletMatch = trimmed.match(/^-+\s+(.*)$/);
    if (bulletMatch) {
      ensureList("ul").items.push({
        key: `ul-li-${lineIndex}`,
        lines: [bulletMatch[1]],
      });
      return;
    }

    if (appendLineToCurrentListItem(line)) {
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${lineIndex}`} className="whitespace-pre-wrap break-words leading-7">
        {renderInlineRichText(line, options)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-3">{blocks}</div>;
}
