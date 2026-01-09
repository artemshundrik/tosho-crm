import { useMemo, useState } from "react";

type ParsedSnapshot = {
  standingsBlock: string | null;
  matchesBlock: string | null;
  sourceLength: number;
  standingsLength: number;
  matchesLength: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const STANDINGS_LABEL = "Турнірна таблиця";
const MATCHES_LABEL = "Календар матчів";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function extractBlock(source: string, startLabel: string, endLabel?: string) {
  const startIndex = source.indexOf(startLabel);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = endLabel ? source.indexOf(endLabel, startIndex + startLabel.length) : -1;
  const sliceEnd = endIndex === -1 ? source.length : endIndex;

  return source.slice(startIndex, sliceEnd).trim();
}

function toPreview(block: string | null, maxLength = 420) {
  if (!block) return "";
  if (block.length <= maxLength) return block;
  return `${block.slice(0, maxLength)}…`;
}

export default function TournamentImportLabPage() {
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSnapshot | null>(null);
  const [normalizedText, setNormalizedText] = useState<string>("");

  const handleLoad = async () => {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/snapshots/v9ky-gold-league.html", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const textContent = doc.body.textContent ?? "";
      const normalized = normalizeText(textContent);

      const standingsBlock = extractBlock(normalized, STANDINGS_LABEL, MATCHES_LABEL);
      const matchesBlock = extractBlock(normalized, MATCHES_LABEL);

      setNormalizedText(normalized);
      setParsed({
        standingsBlock,
        matchesBlock,
        sourceLength: normalized.length,
        standingsLength: standingsBlock?.length ?? 0,
        matchesLength: matchesBlock?.length ?? 0,
      });
      setState("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setState("error");
    }
  };

  const jsonPreview = useMemo(() => {
    if (!parsed) return "";
    return JSON.stringify(parsed, null, 2);
  }, [parsed]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Tournament Import Lab</h1>
        <p className="text-sm text-muted-foreground">
          DEV-only sandbox for parsing v9ky snapshots without touching production flows.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleLoad}
          disabled={state === "loading"}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "loading" ? "Завантаження..." : "Завантажити snapshot"}
        </button>
        <div className="text-xs text-muted-foreground">
          {state === "idle" && "Очікує на завантаження"}
          {state === "ready" && "Snapshot готовий"}
          {state === "error" && "Помилка під час завантаження"}
        </div>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Standings block</h2>
            <span className="text-xs text-muted-foreground">{parsed?.standingsLength ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(parsed?.standingsBlock)}</p>
          <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {JSON.stringify(
              {
                block: parsed?.standingsBlock ?? null,
              },
              null,
              2,
            )}
          </pre>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Calendar matches block</h2>
            <span className="text-xs text-muted-foreground">{parsed?.matchesLength ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(parsed?.matchesBlock)}</p>
          <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {JSON.stringify(
              {
                block: parsed?.matchesBlock ?? null,
              },
              null,
              2,
            )}
          </pre>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Snapshot stats</h2>
          <span className="text-xs text-muted-foreground">{normalizedText.length} chars</span>
        </div>
        <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
          {jsonPreview || "{}"}
        </pre>
      </section>
    </div>
  );
}
