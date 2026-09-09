/**
 * Дві кнопки-посилання на картці позиції: у кого товар куплять і як він
 * виглядає в нашому магазині.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. Блок жив усередині `QuoteDetailsPage.tsx` (одна з
 * сторінок-гігантів), і ратчет розростання завернув наступну ж правку в ньому.
 * Тут він ще й перевіряється тестом, чого всередині сторінки не було.
 *
 * ЖИВЕ ПОСИЛАННЯ ПЕРЕБИВАЄ ЗНІМОК. Адреса береться з ПОТОЧНОЇ моделі каталогу,
 * а знімок у `metadata` позиції — запасний: так правка посилань у моделі
 * оновлює всі прорахунки одразу, без перезбереження позицій. Причина, з якої
 * це колись зламалось: позиції, створені до того, як модель дістала посилання,
 * несли порожній знімок, а копіювання відбувалось лише в мить створення.
 *
 * КНОПКА НАЗИВАЄ ДЖЕРЕЛО, А НЕ РОЛЬ (Артем, 08.09.2026). «Постачальник» не
 * каже нічого — джерел три, і кнопку тиснуть саме щоб побачити, у КОГО. Назва
 * читається з самої адреси, тож підписуються й давні позиції. Посилання
 * немає — називати нема кого, лишається роль.
 */

import * as React from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverTip } from "@/components/ui/hover-tip";
import { supplierNameFromUrl } from "@/lib/supplierPoolRows";

import type { CatalogType } from "./catalog-utils";

type QuoteItemSupplierLinksProps = {
  /** `quote_items.metadata` як є — знімок посилань у мить створення позиції. */
  metadata: unknown;
  catalogTypes: CatalogType[];
  typeId?: string;
  kindId?: string;
  modelId?: string;
};

const snapshot = (metadata: unknown, key: "supplierUrl" | "avantprintUrl"): string => {
  const record = metadata as Record<string, unknown> | null;
  return typeof record?.[key] === "string" ? (record[key] as string) : "";
};

const LinkButton: React.FC<{ url: string; label: string; hint: string }> = ({ url, label, hint }) =>
  url ? (
    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 transition-colors">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Button>
  ) : (
    <HoverTip asChild label={hint}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-dashed text-muted-foreground/70"
        disabled
        aria-label={hint}
      >
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </HoverTip>
  );

export const QuoteItemSupplierLinks: React.FC<QuoteItemSupplierLinksProps> = ({
  metadata,
  catalogTypes,
  typeId,
  kindId,
  modelId,
}) => {
  const model = catalogTypes
    .find((type) => type.id === typeId)
    ?.kinds.find((kind) => kind.id === kindId)
    ?.models.find((candidate) => candidate.id === modelId);

  const supplierUrl = (model?.metadata?.supplierUrl ?? snapshot(metadata, "supplierUrl")).trim();
  const avantprintUrl = (model?.metadata?.avantprintUrl ?? snapshot(metadata, "avantprintUrl")).trim();

  return (
    <>
      <LinkButton
        url={supplierUrl}
        label={supplierNameFromUrl(supplierUrl) ?? "Постачальник"}
        hint="Посилання на товар у постачальника зʼявиться після його додавання в товарі"
      />
      <LinkButton
        url={avantprintUrl}
        label="Avanprint"
        hint="Посилання на товар на Avanprint зʼявиться після його додавання в товарі"
      />
    </>
  );
};
