import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Check, ExternalLink, Minus, RefreshCw, Settings2 } from "lucide-react";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getNpSenders, NovaPoshtaNotConfiguredError } from "@/lib/novaPoshtaApi";
import { supabase } from "@/lib/supabaseClient";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import { formatActivity } from "./IntegrationCard";
import { writeLocalCheckStamp } from "./integrationsCache";
import { integrationFaviconUrl, type IntegrationDefinition, type IntegrationId } from "./integrationsCatalog";
import {
  INTEGRATION_PLATE_TONE,
  INTEGRATION_STATE_ICON,
  INTEGRATION_STATE_LABEL,
  INTEGRATION_STATE_TONE,
} from "./integrationsPresentation";
import type { IntegrationStatus } from "./integrationsStatus";

/**
 * Деталі одного сервісу.
 *
 * Тут і тільки тут живуть ДОРОГІ перевірки: жива відповідь Нової Пошти й обхід
 * тек Dropbox. На списку карток їх немає навмисно — інакше кожне відкриття
 * сторінки стукало б у два зовнішні сервіси, а список має з'являтись одразу.
 */

type LiveCheck = { tone: "success" | "danger"; text: string };

/** Сервіси, у яких є що перевіряти живцем. Решта — лише стан із бази. */
const LIVE_CHECKS: Partial<Record<IntegrationId, () => Promise<LiveCheck>>> = {
  nova_poshta: async () => {
    try {
      const senders = await getNpSenders();
      return {
        tone: "success",
        text: `Ключ робочий: кабінет відповів, у ньому ${senders.length} відправник(ів).`,
      };
    } catch (cause) {
      if (cause instanceof NovaPoshtaNotConfiguredError) {
        return { tone: "danger", text: "Ключ API не налаштований на сервері — CRM не може звернутись до НП." };
      }
      return {
        tone: "danger",
        text: cause instanceof Error ? cause.message : "Нова Пошта не відповіла.",
      };
    }
  },
  dropbox: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/.netlify/functions/dropbox-manage", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "health" }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      health?: { folders: number; brokenLinks: unknown[]; deadLinks?: unknown[] };
    } | null;
    if (!response.ok || !payload?.ok || !payload.health) {
      return { tone: "danger", text: payload?.error || "Dropbox не відповів на перевірку." };
    }
    const broken = payload.health.brokenLinks.length + (payload.health.deadLinks ?? []).length;
    if (broken > 0) {
      return { tone: "danger", text: `Зв'язок є, але ${broken} прив'язок ведуть у нікуди — теку видалили або перейменували.` };
    }
    return { tone: "success", text: `Зв'язок цілий: ${payload.health.folders} тек, усі прив'язки на місці.` };
  },
};

export function IntegrationSheet({
  definition,
  status,
  open,
  onOpenChange,
}: {
  definition: IntegrationDefinition | null;
  status: IntegrationStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<LiveCheck | null>(null);

  if (!definition || !status) return null;

  const tone = INTEGRATION_STATE_TONE[status.state];
  const plateTone = INTEGRATION_PLATE_TONE[status.state];
  const StateIcon = INTEGRATION_STATE_ICON[status.state];
  const runCheck = LIVE_CHECKS[definition.id];

  const handleCheck = async () => {
    if (!runCheck) return;
    setChecking(true);
    setCheckResult(null);
    try {
      setCheckResult(await runCheck());
      // Для Dropbox це ЄДИНА чесна дата в картці: він не лишає в нашій базі
      // сліду своєї роботи, тож «коли ми востаннє звіряли» — усе, що ми знаємо.
      writeLocalCheckStamp(definition.id, new Date().toISOString());
    } catch (cause) {
      setCheckResult({ tone: "danger", text: cause instanceof Error ? cause.message : "Перевірка не вдалася." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Результат попередньої перевірки не має «переїжджати» на іншу картку.
        if (!next) setCheckResult(null);
        onOpenChange(next);
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-[520px]" dismissible>
        <SheetHeader className="space-y-0">
          <div className="flex items-start gap-3">
            {definition.Mark ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                <definition.Mark className="h-6 w-6" />
              </span>
            ) : (
              <EntityAvatar
                src={definition.domain ? integrationFaviconUrl(definition.domain) : null}
                name={definition.name}
                size={40}
                className="shrink-0 rounded-xl"
              />
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold leading-snug">{definition.name}</SheetTitle>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{definition.what}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Дивайдери від краю до краю: тіло розтягуємо на всю ширину шторки
            (-mx-6 гасить p-6 контейнера), а падінг повертаємо вже секціям.
            Тоді лінія йде через усю шторку, а текст лишається в полях —
            інакше межа виглядає обрізаним огризком посеред панелі. */}
        <SheetBody className="-mx-6 divide-y divide-border/60 [&>section:first-child]:pt-0 [&>section]:px-6 [&>section]:py-5">
          {/* Стан — повним текстом, без обрізання: тут місця вистачає. */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone} size="md" className="gap-1.5">
                <StateIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {INTEGRATION_STATE_LABEL[status.state]}
              </Badge>
              <span className="text-2xs text-muted-foreground">{formatActivity(status.activity)}</span>
              {runCheck ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void handleCheck()}
                  loading={checking}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  Перевірити зв'язок
                </Button>
              ) : null}
            </div>

            <div className={cn("flex items-start gap-2 rounded-inner border px-3 py-2.5", toneSubtleClass[plateTone])}>
              <StateIcon className={cn("mt-0.5 h-4 w-4 shrink-0", toneTextClass[plateTone])} aria-hidden="true" />
              <p className="text-xs leading-relaxed text-foreground">{status.message}</p>
            </div>

            {checkResult ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-inner border px-3 py-2.5",
                  checkResult.tone === "success" ? toneSubtleClass.success : toneSubtleClass.danger
                )}
              >
                <RefreshCw
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    checkResult.tone === "success" ? toneTextClass.success : toneTextClass.danger
                  )}
                  aria-hidden="true"
                />
                <p className="text-xs leading-relaxed text-foreground">{checkResult.text}</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-2.5">
            <h3 className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">Що це дає</h3>
            <ul className="space-y-1.5">
              {definition.capabilities.map((capability) => (
                <li key={capability.label} className="flex items-start gap-2 text-xs leading-relaxed">
                  {capability.enabled ? (
                    <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", toneTextClass.success)} aria-hidden="true" />
                  ) : (
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className={capability.enabled ? "text-foreground" : "text-muted-foreground"}>
                    {capability.label}
                    {capability.enabled ? "" : " · не робимо"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {status.details.length > 0 ? (
            <section className="space-y-2.5">
              <h3 className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
                Налаштування
              </h3>
              <dl className="divide-y divide-border/60 rounded-inner border border-border/60">
                {status.details.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 px-3 py-2">
                    <dt className="shrink-0 text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 text-right text-xs font-medium text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* Списки, заради яких сюди й заходить керівник: хто не прив'язав
              бота, на що йдуть гроші OpenAI, хто ним користується. */}
          {status.extraSections.map((section) => (
            <section key={section.title} className="space-y-2.5">
              <div>
                <h3 className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
                  {section.title}
                </h3>
                {section.hint ? <p className="mt-1 text-2xs text-muted-foreground">{section.hint}</p> : null}
              </div>
              <dl className="divide-y divide-border/60 rounded-inner border border-border/60">
                {section.rows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 px-3 py-2">
                    <dt className="min-w-0 text-xs font-medium text-foreground">{row.label}</dt>
                    <dd className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </SheetBody>

        <SheetFooter className="gap-2 sm:justify-start">
          {definition.settingsPath ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate(definition.settingsPath!);
              }}
            >
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Налаштувати
            </Button>
          ) : null}
          {definition.monitorPath ? (
            <Button
              variant={definition.settingsPath ? "outline" : "primary"}
              onClick={() => {
                onOpenChange(false);
                navigate(definition.monitorPath!);
              }}
            >
              <Activity className="mr-2 h-4 w-4" aria-hidden="true" />
              Показники
            </Button>
          ) : null}
          {definition.externalUrl ? (
            <Button variant="outline" asChild>
              <a href={definition.externalUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Кабінет сервісу
              </a>
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
