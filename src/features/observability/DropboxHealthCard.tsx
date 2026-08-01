import { useCallback, useEffect, useState } from "react";
import { FolderTree, RefreshCw } from "lucide-react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import type { HealthTone } from "@/lib/systemHealthThresholds";

/**
 * Стан зв'язку CRM ↔ Dropbox на сторінці Observability.
 *
 * Числа рахує та сама функція, що відповідає в боті на /dropbox
 * (netlify/functions/_lib/dropboxHealth.ts) — свідомо не дублюємо логіку тут.
 * Дві реалізації однієї перевірки неминуче розійдуться, і тоді доведеться
 * з'ясовувати, якій із них вірити.
 *
 * Дані живі, не зі снапшота: перевірку відкривають, коли щось запідозрили, і
 * тоді вчорашній знімок гірший за відсутність відповіді.
 */

type DropboxHealth = {
  folders: number;
  linkedCustomers: number;
  linkedLeads: number;
  brokenLinks: Array<{ name: string; path: string; kind: "customer" | "lead" }>;
  orphanFolders: string[];
  duplicateFolders: string[][];
  drifted: Array<{ crmName: string; folderName: string }>;
  approvedNotInDropbox: number;
  approvedWithoutMarkedFiles: number;
  approvedTotal: number;
  taskStatsIncluded: boolean;
  unsorted: Array<{ folder: string; files: number; bytes: number }>;
  deadLinks: Array<{ name: string; kind: "customer" | "lead"; which: "folder" | "brand" }>;
  linksChecked: number;
};

const TONE_CLASS: Record<HealthTone, string> = {
  good: "bg-success-soft text-success-foreground border-success-soft-border",
  warning: "bg-warning-soft text-warning-foreground border-warning-soft-border",
  danger: "bg-danger-soft text-danger-foreground border-danger-soft-border",
  neutral: "bg-muted text-muted-foreground border-border/60",
};

function toneOf(health: DropboxHealth): HealthTone {
  if (health.brokenLinks.length > 0 || health.duplicateFolders.length > 0 || (health.deadLinks ?? []).length > 0) {
    return "danger";
  }
  if (health.orphanFolders.length > 0 || health.drifted.length > 0) return "warning";
  return "good";
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function DropboxHealthCard() {
  const [health, setHealth] = useState<DropboxHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch("/.netlify/functions/dropbox-manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "health" }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; health?: DropboxHealth; error?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.health) {
        throw new Error(payload?.error || "Не вдалося зібрати стан Dropbox.");
      }
      setHealth(payload.health);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося зібрати стан Dropbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tone = health ? toneOf(health) : "neutral";
  const marked = health ? health.approvedTotal - health.approvedWithoutMarkedFiles : 0;
  const markedPercent = health && health.approvedTotal > 0 ? Math.round((marked / health.approvedTotal) * 100) : 0;

  return (
    <section className="mt-6 rounded-4xl border border-border/60 bg-card/95 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FolderTree className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Dropbox</h2>
            <p className="text-sm text-muted-foreground">Зв'язок карток CRM із теками замовників</p>
          </div>
          {health ? (
            <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", TONE_CLASS[tone])}>
              {tone === "good" ? "Зв'язок цілий" : tone === "warning" ? "Є хвости" : "Розрив зв'язку"}
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Оновити
        </Button>
      </div>

      {loading && !health ? (
        <AppSectionLoader label="Читаємо стан Dropbox..." className="border-none bg-transparent py-10" />
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-danger-soft-border bg-danger-soft p-4 text-sm text-danger-foreground">
          {error}
        </div>
      ) : health ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Тек замовників" value={String(health.folders)} />
            <Stat
              label="Прив'язано"
              value={String(health.linkedCustomers + health.linkedLeads)}
              hint={`${health.linkedCustomers} замовників · ${health.linkedLeads} лідів`}
            />
            <Stat
              label="Прив'язка без теки"
              value={String(health.brokenLinks.length)}
              hint={health.brokenLinks.length > 0 ? "теку видалили або перейменували" : "усі шляхи ведуть у теку"}
            />
            <Stat
              label="Кнопка веде в нікуди"
              value={String((health.deadLinks ?? []).length)}
              hint={
                health.linksChecked
                  ? `перевірено ${health.linksChecked} посилань — тека є, посилання мертве`
                  : "посилання не перевірялись"
              }
            />
          </div>

          {health.taskStatsIncluded ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Stat
                label="Відмітка затверджених файлів"
                value={`${marked} з ${health.approvedTotal}`}
                hint={`${markedPercent}% — без відмітки не знати, що класти у «Фінал»`}
              />
              <Stat
                label="Затверджених ще не перенесено"
                value={String(health.approvedNotInDropbox)}
                hint="перенесення поки ручне, тож це не збій"
              />
            </div>
          ) : null}

          {(health.unsorted ?? []).some((pile) => pile.files > 0) ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(health.unsorted ?? []).filter((pile) => pile.files > 0).map((pile) => (
                <Stat
                  key={pile.folder}
                  label={`Чекає на розбір · ${pile.folder}`}
                  value={String(pile.files)}
                  hint={`${Math.round(pile.bytes / 1024 / 1024)} МБ — теки без замовника, до яких треба повернутись`}
                />
              ))}
            </div>
          ) : null}

          {health.brokenLinks.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-danger-soft-border bg-danger-soft p-4">
              <div className="text-sm font-semibold text-danger-foreground">Прив'язка веде в нікуди</div>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {health.brokenLinks.map((item) => (
                  <li key={`${item.kind}:${item.path}`}>
                    {item.name}
                    {item.kind === "lead" ? " (лід)" : ""} — <span className="text-muted-foreground">{item.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(health.deadLinks ?? []).length > 0 ? (
            <div className="mt-3 rounded-2xl border border-danger-soft-border bg-danger-soft p-4">
              <div className="text-sm font-semibold text-danger-foreground">
                Тека на місці, а посилання мертве — кнопка в картці не працює
              </div>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {health.deadLinks.map((item) => (
                  <li key={`${item.kind}:${item.name}:${item.which}`}>
                    {item.name}
                    {item.which === "brand" ? " — тека «Бренд»" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {health.duplicateFolders.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-danger-soft-border bg-danger-soft p-4">
              <div className="text-sm font-semibold text-danger-foreground">Дві теки на одного клієнта</div>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {health.duplicateFolders.map((group) => (
                  <li key={group.join("|")}>{group.join(" ↔ ")}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {health.orphanFolders.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div className="text-sm font-semibold text-foreground">Теки без картки в CRM</div>
              <p className="mt-1 text-sm text-muted-foreground">{health.orphanFolders.join(", ")}</p>
            </div>
          ) : null}

          {health.drifted.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div className="text-sm font-semibold text-foreground">Назва в CRM не збігається з назвою теки</div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {health.drifted.map((item) => (
                  <li key={`${item.crmName}:${item.folderName}`}>
                    {item.crmName} → теку названо «{item.folderName}»
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
