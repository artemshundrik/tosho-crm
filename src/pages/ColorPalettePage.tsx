import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Info,
  OctagonAlert,
  Sparkles,
  SwatchBook,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BADGE_CATALOG_ITEM_COUNT, BADGE_CATALOG_TABS, type BadgeCatalogItem } from "@/lib/badgeCatalog";

type ToneKey = "neutral" | "info" | "accent" | "success" | "warning" | "danger";
type PresetKey = "current" | "linear" | "radix" | "notion" | "primer" | "atlassian" | "carbon";
type ThemeMode = "light" | "dark";
type CSSVarMap = Record<`--${string}`, string>;

const TONES: Array<{
  key: ToneKey;
  label: string;
  description: string;
  badgeClass: string;
  subtleClass: string;
  textClass: string;
  copyClass: string;
  dotClass: string;
  iconBoxClass: string;
}> = [
  {
    key: "neutral",
    label: "Neutral",
    description: "Спокійні secondary стани, inactive, допоміжні сигнали.",
    badgeClass: "tone-neutral",
    subtleClass: "tone-neutral-subtle",
    textClass: "tone-text-neutral",
    copyClass: "tone-copy-neutral",
    dotClass: "tone-dot-neutral",
    iconBoxClass: "tone-icon-box-neutral",
  },
  {
    key: "info",
    label: "Info",
    description: "Робочий процес, активна фаза, informational actions.",
    badgeClass: "tone-info",
    subtleClass: "tone-info-subtle",
    textClass: "tone-text-info",
    copyClass: "tone-copy-info",
    dotClass: "tone-dot-info",
    iconBoxClass: "tone-icon-box-info",
  },
  {
    key: "accent",
    label: "Accent",
    description: "Product purple для design, estimated, owner та special accents.",
    badgeClass: "tone-accent",
    subtleClass: "tone-accent-subtle",
    textClass: "tone-text-accent",
    copyClass: "tone-copy-accent",
    dotClass: "tone-dot-accent",
    iconBoxClass: "tone-icon-box-accent",
  },
  {
    key: "success",
    label: "Success",
    description: "Підтверджено, готово, оплачено, позитивне завершення.",
    badgeClass: "tone-success",
    subtleClass: "tone-success-subtle",
    textClass: "tone-text-success",
    copyClass: "tone-copy-success",
    dotClass: "tone-dot-success",
    iconBoxClass: "tone-icon-box-success",
  },
  {
    key: "warning",
    label: "Warning",
    description: "Очікує, потрібна увага, ризик, блокер без фатальної помилки.",
    badgeClass: "tone-warning",
    subtleClass: "tone-warning-subtle",
    textClass: "tone-text-warning",
    copyClass: "tone-copy-warning",
    dotClass: "tone-dot-warning",
    iconBoxClass: "tone-icon-box-warning",
  },
  {
    key: "danger",
    label: "Danger",
    description: "Скасовано, помилка, втрати, destructive state.",
    badgeClass: "tone-danger",
    subtleClass: "tone-danger-subtle",
    textClass: "tone-text-danger",
    copyClass: "tone-copy-danger",
    dotClass: "tone-dot-danger",
    iconBoxClass: "tone-icon-box-danger",
  },
];

const STATUS_ROWS = [
  { label: "Новий", tone: "neutral" },
  { label: "На прорахунку", tone: "info" },
  { label: "Пораховано", tone: "accent" },
  { label: "На погодженні", tone: "warning" },
  { label: "Затверджено", tone: "success" },
  { label: "Скасовано", tone: "danger" },
] as const;

const COMMAND_KIND_CLASSES = [
  { label: "Замовник", className: "cmd-kind-customer" },
  { label: "Лід", className: "cmd-kind-lead" },
  { label: "Прорахунок", className: "cmd-kind-quote" },
  { label: "Замовлення", className: "cmd-kind-order" },
  { label: "Дизайн", className: "cmd-kind-design" },
];

const AVATAR_TONES = [
  { label: "Tone 1", shellClass: "entity-avatar-shell-tone-1", fallbackClass: "entity-avatar-fallback-tone-1", glyph: "A" },
  { label: "Tone 2", shellClass: "entity-avatar-shell-tone-2", fallbackClass: "entity-avatar-fallback-tone-2", glyph: "B" },
  { label: "Tone 3", shellClass: "entity-avatar-shell-tone-3", fallbackClass: "entity-avatar-fallback-tone-3", glyph: "C" },
  { label: "Tone 4", shellClass: "entity-avatar-shell-tone-4", fallbackClass: "entity-avatar-fallback-tone-4", glyph: "D" },
  { label: "Tone 5", shellClass: "entity-avatar-shell-tone-5", fallbackClass: "entity-avatar-fallback-tone-5", glyph: "E" },
  { label: "Tone 6", shellClass: "entity-avatar-shell-tone-6", fallbackClass: "entity-avatar-fallback-tone-6", glyph: "F" },
];

const KANBAN_SWATCHES = [
  { label: "New", accentVar: "--kanban-col-new-accent", bgVar: "--kanban-col-new-bg", borderVar: "--kanban-col-new-border" },
  { label: "Estimating", accentVar: "--kanban-col-estimating-accent", bgVar: "--kanban-col-estimating-bg", borderVar: "--kanban-col-estimating-border" },
  { label: "Estimated", accentVar: "--kanban-col-estimated-accent", bgVar: "--kanban-col-estimated-bg", borderVar: "--kanban-col-estimated-border" },
  { label: "Awaiting", accentVar: "--kanban-col-awaiting-accent", bgVar: "--kanban-col-awaiting-bg", borderVar: "--kanban-col-awaiting-border" },
  { label: "Approved", accentVar: "--kanban-col-approved-accent", bgVar: "--kanban-col-approved-bg", borderVar: "--kanban-col-approved-border" },
  { label: "Cancelled", accentVar: "--kanban-col-cancelled-accent", bgVar: "--kanban-col-cancelled-bg", borderVar: "--kanban-col-cancelled-border" },
];

const LEADER_SWATCHES = [
  { label: "Goals", bg: "var(--leader-goals-bg)", border: "var(--leader-goals-border)", color: "var(--leader-goals-foreground)" },
  { label: "Assists", bg: "var(--leader-assists-bg)", border: "var(--leader-assists-border)", color: "var(--leader-assists-foreground)" },
  { label: "Points", bg: "var(--leader-points-bg)", border: "var(--leader-points-border)", color: "var(--leader-points-foreground)" },
  { label: "Matches", bg: "var(--leader-matches-bg)", border: "var(--leader-matches-border)", color: "var(--leader-matches-foreground)" },
  { label: "Discipline", bg: "var(--leader-discipline-bg)", border: "var(--leader-discipline-border)", color: "var(--leader-discipline-foreground)" },
  { label: "Efficiency", bg: "var(--leader-efficiency-bg)", border: "var(--leader-efficiency-border)", color: "var(--leader-efficiency-foreground)" },
];

const RATING_SWATCHES = [
  { label: "Bronze", from: "var(--rating-bronze-from)", mid: "var(--rating-bronze-from)", to: "var(--rating-bronze-to)", border: "var(--rating-bronze-border)", color: "var(--rating-bronze-foreground)" },
  { label: "Silver", from: "var(--rating-silver-from)", mid: "var(--rating-silver-from)", to: "var(--rating-silver-to)", border: "var(--rating-silver-border)", color: "var(--rating-silver-foreground)" },
  { label: "Gold", from: "var(--rating-gold-from)", mid: "var(--rating-gold-from)", to: "var(--rating-gold-to)", border: "var(--rating-gold-border)", color: "var(--rating-gold-foreground)" },
  { label: "Elite", from: "var(--rating-elite-from)", mid: "var(--rating-elite-mid)", to: "var(--rating-elite-to)", border: "var(--rating-elite-border)", color: "var(--rating-elite-foreground)" },
  { label: "Legendary", from: "var(--rating-legendary-from)", mid: "var(--rating-legendary-mid)", to: "var(--rating-legendary-to)", border: "var(--rating-legendary-border)", color: "var(--rating-legendary-foreground)" },
];

const TONE_ICON = {
  neutral: Circle,
  info: Info,
  accent: Sparkles,
  success: CheckCircle2,
  warning: OctagonAlert,
  danger: XCircle,
} satisfies Record<ToneKey, typeof Circle>;

function buildDerivedSemanticAliases(): CSSVarMap {
  return {
    "--cmd-kind-customer-bg": "var(--success-soft)",
    "--cmd-kind-customer-border": "var(--success-soft-border)",
    "--cmd-kind-customer-foreground": "var(--success-foreground)",
    "--cmd-kind-lead-bg": "var(--warning-soft)",
    "--cmd-kind-lead-border": "var(--warning-soft-border)",
    "--cmd-kind-lead-foreground": "var(--warning-foreground)",
    "--cmd-kind-quote-bg": "var(--info-soft)",
    "--cmd-kind-quote-border": "var(--info-soft-border)",
    "--cmd-kind-quote-foreground": "var(--info-foreground)",
    "--cmd-kind-order-bg": "var(--neutral-soft)",
    "--cmd-kind-order-border": "var(--neutral-soft-border)",
    "--cmd-kind-order-foreground": "var(--neutral-foreground)",
    "--cmd-kind-design-bg": "var(--accent-tone-soft)",
    "--cmd-kind-design-border": "var(--accent-tone-soft-border)",
    "--cmd-kind-design-foreground": "var(--accent-tone-foreground)",
    "--entity-avatar-1-bg": "var(--info-soft)",
    "--entity-avatar-1-border": "var(--info-soft-border)",
    "--entity-avatar-1-fg": "var(--info-foreground)",
    "--entity-avatar-1-fallback": "var(--info-soft-border)",
    "--entity-avatar-2-bg": "var(--success-soft)",
    "--entity-avatar-2-border": "var(--success-soft-border)",
    "--entity-avatar-2-fg": "var(--success-foreground)",
    "--entity-avatar-2-fallback": "var(--success-soft-border)",
    "--entity-avatar-3-bg": "var(--warning-soft)",
    "--entity-avatar-3-border": "var(--warning-soft-border)",
    "--entity-avatar-3-fg": "var(--warning-foreground)",
    "--entity-avatar-3-fallback": "var(--warning-soft-border)",
    "--entity-avatar-4-bg": "var(--danger-soft)",
    "--entity-avatar-4-border": "var(--danger-soft-border)",
    "--entity-avatar-4-fg": "var(--danger-foreground)",
    "--entity-avatar-4-fallback": "var(--danger-soft-border)",
    "--entity-avatar-5-bg": "var(--accent-tone-soft)",
    "--entity-avatar-5-border": "var(--accent-tone-soft-border)",
    "--entity-avatar-5-fg": "var(--accent-tone-foreground)",
    "--entity-avatar-5-fallback": "var(--accent-tone-soft-border)",
    "--entity-avatar-6-bg": "var(--info-soft)",
    "--entity-avatar-6-border": "var(--info-soft-border)",
    "--entity-avatar-6-fg": "var(--info-foreground)",
    "--entity-avatar-6-fallback": "var(--info-soft-border)",
    "--kanban-col-new-bg": "var(--neutral-soft)",
    "--kanban-col-new-border": "var(--neutral-soft-border)",
    "--kanban-col-new-accent": "var(--neutral-foreground)",
    "--kanban-col-estimating-bg": "var(--info-soft)",
    "--kanban-col-estimating-border": "var(--info-soft-border)",
    "--kanban-col-estimating-accent": "var(--info-foreground)",
    "--kanban-col-estimated-bg": "var(--accent-tone-soft)",
    "--kanban-col-estimated-border": "var(--accent-tone-soft-border)",
    "--kanban-col-estimated-accent": "var(--accent-tone-foreground)",
    "--kanban-col-awaiting-bg": "var(--warning-soft)",
    "--kanban-col-awaiting-border": "var(--warning-soft-border)",
    "--kanban-col-awaiting-accent": "var(--warning-foreground)",
    "--kanban-col-approved-bg": "var(--success-soft)",
    "--kanban-col-approved-border": "var(--success-soft-border)",
    "--kanban-col-approved-accent": "var(--success-foreground)",
    "--kanban-col-cancelled-bg": "var(--danger-soft)",
    "--kanban-col-cancelled-border": "var(--danger-soft-border)",
    "--kanban-col-cancelled-accent": "var(--danger-foreground)",
    "--leader-goals-bg": "hsl(var(--info-soft) / 0.78)",
    "--leader-goals-border": "hsl(var(--info-soft-border))",
    "--leader-goals-foreground": "hsl(var(--info-foreground))",
    "--leader-assists-bg": "hsl(var(--success-soft) / 0.82)",
    "--leader-assists-border": "hsl(var(--success-soft-border))",
    "--leader-assists-foreground": "hsl(var(--success-foreground))",
    "--leader-points-bg": "hsl(var(--accent-tone-soft) / 0.8)",
    "--leader-points-border": "hsl(var(--accent-tone-soft-border))",
    "--leader-points-foreground": "hsl(var(--accent-tone-foreground))",
    "--leader-matches-bg": "hsl(var(--neutral-soft) / 0.88)",
    "--leader-matches-border": "hsl(var(--neutral-soft-border))",
    "--leader-matches-foreground": "hsl(var(--neutral-foreground))",
    "--leader-discipline-bg": "hsl(var(--warning-soft) / 0.82)",
    "--leader-discipline-border": "hsl(var(--warning-soft-border))",
    "--leader-discipline-foreground": "hsl(var(--warning-foreground))",
    "--leader-efficiency-bg": "hsl(var(--neutral-soft) / 0.94)",
    "--leader-efficiency-border": "hsl(var(--neutral-soft-border))",
    "--leader-efficiency-foreground": "hsl(var(--neutral-foreground))",
  };
}

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    description: string;
    light: CSSVarMap;
    dark: CSSVarMap;
  }
> = {
  current: {
    label: "Current",
    description: "Поточна продова палітра без локальних overrides.",
    light: {},
    dark: {},
  },
  linear: {
    label: "Linear",
    description: "Щільні, холодні, product-first кольори з clean blue, зібраним violet і дорослим jade.",
    light: {
      "--primary": "221 83% 53%",
      "--destructive": "356 74% 51%",
      "--neutral-soft": "220 23% 97%",
      "--neutral-soft-border": "220 16% 86%",
      "--neutral-foreground": "220 9% 39%",
      "--info-soft": "214 100% 96.7%",
      "--info-soft-border": "214 86% 84%",
      "--info-foreground": "216 82% 48%",
      "--accent-tone-soft": "262 100% 97.4%",
      "--accent-tone-soft-border": "262 78% 86%",
      "--accent-tone-foreground": "262 62% 55%",
      "--success-soft": "160 34% 95.4%",
      "--success-soft-border": "160 24% 78%",
      "--success-foreground": "165 44% 28%",
      "--warning-soft": "42 72% 94.4%",
      "--warning-soft-border": "40 56% 78%",
      "--warning-foreground": "31 62% 33%",
      "--danger-soft": "356 100% 96.8%",
      "--danger-soft-border": "356 78% 86%",
      "--danger-foreground": "356 72% 48%",
      "--cmd-kind-customer-bg": "160 34% 95.4%",
      "--cmd-kind-customer-border": "160 24% 78%",
      "--cmd-kind-customer-foreground": "165 44% 28%",
      "--cmd-kind-lead-bg": "42 72% 94.4%",
      "--cmd-kind-lead-border": "40 56% 78%",
      "--cmd-kind-lead-foreground": "31 62% 33%",
      "--cmd-kind-quote-bg": "214 100% 96.7%",
      "--cmd-kind-quote-border": "214 86% 84%",
      "--cmd-kind-quote-foreground": "216 82% 48%",
      "--cmd-kind-order-bg": "220 23% 97%",
      "--cmd-kind-order-border": "220 16% 86%",
      "--cmd-kind-order-foreground": "220 9% 39%",
      "--cmd-kind-design-bg": "262 100% 97.4%",
      "--cmd-kind-design-border": "262 78% 86%",
      "--cmd-kind-design-foreground": "262 62% 55%",
      "--entity-avatar-1-bg": "214 100% 96.7%",
      "--entity-avatar-1-border": "214 86% 84%",
      "--entity-avatar-1-fg": "216 82% 48%",
      "--entity-avatar-1-fallback": "214 100% 88%",
      "--entity-avatar-2-bg": "160 34% 95.4%",
      "--entity-avatar-2-border": "160 24% 78%",
      "--entity-avatar-2-fg": "165 44% 28%",
      "--entity-avatar-2-fallback": "160 28% 84%",
      "--entity-avatar-3-bg": "42 72% 94.4%",
      "--entity-avatar-3-border": "40 56% 78%",
      "--entity-avatar-3-fg": "31 62% 33%",
      "--entity-avatar-3-fallback": "42 72% 84%",
      "--entity-avatar-4-bg": "356 100% 96.8%",
      "--entity-avatar-4-border": "356 78% 86%",
      "--entity-avatar-4-fg": "356 72% 48%",
      "--entity-avatar-4-fallback": "356 100% 90%",
      "--entity-avatar-5-bg": "262 100% 97.4%",
      "--entity-avatar-5-border": "262 78% 86%",
      "--entity-avatar-5-fg": "262 62% 55%",
      "--entity-avatar-5-fallback": "266 100% 89%",
      "--entity-avatar-6-bg": "190 90% 95%",
      "--entity-avatar-6-border": "190 72% 82%",
      "--entity-avatar-6-fg": "194 74% 38%",
      "--entity-avatar-6-fallback": "190 90% 86%",
      "--kanban-col-new-bg": "220 20% 98%",
      "--kanban-col-new-border": "220 14% 88%",
      "--kanban-col-new-accent": "220 10% 58%",
      "--kanban-col-estimating-bg": "214 100% 98%",
      "--kanban-col-estimating-border": "214 78% 89%",
      "--kanban-col-estimating-accent": "216 82% 48%",
      "--kanban-col-estimated-bg": "262 100% 98%",
      "--kanban-col-estimated-border": "262 70% 90%",
      "--kanban-col-estimated-accent": "262 62% 55%",
      "--kanban-col-awaiting-bg": "42 68% 97.8%",
      "--kanban-col-awaiting-border": "40 50% 86%",
      "--kanban-col-awaiting-accent": "31 62% 33%",
      "--kanban-col-approved-bg": "160 30% 97.2%",
      "--kanban-col-approved-border": "160 22% 85%",
      "--kanban-col-approved-accent": "165 44% 28%",
      "--kanban-col-cancelled-bg": "356 100% 98.4%",
      "--kanban-col-cancelled-border": "356 64% 90%",
      "--kanban-col-cancelled-accent": "356 72% 48%",
      "--leader-goals-bg": "hsl(var(--info-soft) / 0.78)",
      "--leader-goals-border": "hsl(var(--info-soft-border))",
      "--leader-goals-foreground": "hsl(var(--info-foreground))",
      "--leader-assists-bg": "hsl(var(--success-soft) / 0.82)",
      "--leader-assists-border": "hsl(var(--success-soft-border))",
      "--leader-assists-foreground": "hsl(var(--success-foreground))",
      "--leader-points-bg": "hsl(var(--accent-tone-soft) / 0.8)",
      "--leader-points-border": "hsl(var(--accent-tone-soft-border))",
      "--leader-points-foreground": "hsl(var(--accent-tone-foreground))",
      "--leader-matches-bg": "hsl(var(--neutral-soft) / 0.88)",
      "--leader-matches-border": "hsl(var(--neutral-soft-border))",
      "--leader-matches-foreground": "hsl(var(--neutral-foreground))",
      "--leader-discipline-bg": "hsl(var(--warning-soft) / 0.82)",
      "--leader-discipline-border": "hsl(var(--warning-soft-border))",
      "--leader-discipline-foreground": "hsl(var(--warning-foreground))",
      "--leader-efficiency-bg": "hsl(var(--neutral-soft) / 0.94)",
      "--leader-efficiency-border": "hsl(var(--neutral-soft-border))",
      "--leader-efficiency-foreground": "hsl(var(--neutral-foreground))",
      "--rating-bronze-from": "#f2d0bb",
      "--rating-bronze-to": "#b87552",
      "--rating-bronze-border": "rgba(184, 117, 82, 0.28)",
      "--rating-bronze-foreground": "#5f2d12",
      "--rating-silver-from": "#f4f7fb",
      "--rating-silver-to": "#d4dbe5",
      "--rating-silver-border": "rgba(148, 163, 184, 0.28)",
      "--rating-silver-foreground": "#334155",
      "--rating-gold-from": "#f4d56a",
      "--rating-gold-to": "#c7921c",
      "--rating-gold-border": "rgba(199, 146, 28, 0.3)",
      "--rating-gold-foreground": "#5a3b02",
      "--rating-elite-from": "#14213d",
      "--rating-elite-mid": "#2556cf",
      "--rating-elite-to": "#1c326c",
      "--rating-elite-border": "rgba(37, 86, 207, 0.4)",
      "--rating-elite-foreground": "#d9e6ff",
      "--rating-legendary-from": "#ffffff",
      "--rating-legendary-mid": "#eef5ff",
      "--rating-legendary-to": "#fde8ef",
      "--rating-legendary-border": "rgba(205, 162, 59, 0.42)",
      "--rating-legendary-foreground": "#b07a11",
    },
    dark: {
      "--primary": "214 100% 70%",
      "--destructive": "356 82% 74%",
      "--neutral-soft": "222 14% 12.5%",
      "--neutral-soft-border": "222 12% 22%",
      "--neutral-foreground": "220 10% 72%",
      "--info-soft": "214 34% 16%",
      "--info-soft-border": "214 32% 28%",
      "--info-foreground": "210 84% 76%",
      "--accent-tone-soft": "262 30% 18%",
      "--accent-tone-soft-border": "262 44% 34%",
      "--accent-tone-foreground": "262 100% 84%",
      "--success-soft": "158 18% 16.2%",
      "--success-soft-border": "158 20% 26%",
      "--success-foreground": "154 32% 70%",
      "--warning-soft": "36 22% 15.8%",
      "--warning-soft-border": "36 24% 27%",
      "--warning-foreground": "40 76% 74%",
      "--danger-soft": "353 18% 16.4%",
      "--danger-soft-border": "353 20% 27%",
      "--danger-foreground": "354 70% 79%",
      "--cmd-kind-customer-bg": "158 18% 16.2%",
      "--cmd-kind-customer-border": "158 20% 26%",
      "--cmd-kind-customer-foreground": "154 32% 70%",
      "--cmd-kind-lead-bg": "36 22% 15.8%",
      "--cmd-kind-lead-border": "36 24% 27%",
      "--cmd-kind-lead-foreground": "40 76% 74%",
      "--cmd-kind-quote-bg": "214 34% 16%",
      "--cmd-kind-quote-border": "214 32% 28%",
      "--cmd-kind-quote-foreground": "210 84% 76%",
      "--cmd-kind-order-bg": "222 14% 12.5%",
      "--cmd-kind-order-border": "222 12% 22%",
      "--cmd-kind-order-foreground": "220 10% 72%",
      "--cmd-kind-design-bg": "262 30% 18%",
      "--cmd-kind-design-border": "262 44% 34%",
      "--cmd-kind-design-foreground": "262 100% 84%",
      "--entity-avatar-1-bg": "214 34% 16%",
      "--entity-avatar-1-border": "214 32% 28%",
      "--entity-avatar-1-fg": "210 84% 76%",
      "--entity-avatar-1-fallback": "214 30% 30%",
      "--entity-avatar-2-bg": "158 18% 16.2%",
      "--entity-avatar-2-border": "158 20% 26%",
      "--entity-avatar-2-fg": "154 32% 70%",
      "--entity-avatar-2-fallback": "156 20% 30%",
      "--entity-avatar-3-bg": "36 22% 15.8%",
      "--entity-avatar-3-border": "36 24% 27%",
      "--entity-avatar-3-fg": "40 76% 74%",
      "--entity-avatar-3-fallback": "38 22% 31%",
      "--entity-avatar-4-bg": "353 18% 16.4%",
      "--entity-avatar-4-border": "353 20% 27%",
      "--entity-avatar-4-fg": "354 70% 79%",
      "--entity-avatar-4-fallback": "353 22% 31%",
      "--entity-avatar-5-bg": "262 30% 18%",
      "--entity-avatar-5-border": "262 44% 34%",
      "--entity-avatar-5-fg": "262 100% 84%",
      "--entity-avatar-5-fallback": "264 34% 34%",
      "--entity-avatar-6-bg": "194 26% 20%",
      "--entity-avatar-6-border": "194 28% 31%",
      "--entity-avatar-6-fg": "190 92% 79%",
      "--entity-avatar-6-fallback": "192 30% 35%",
      "--kanban-col-new-bg": "224 10% 11.5%",
      "--kanban-col-new-border": "224 9% 20%",
      "--kanban-col-new-accent": "220 8% 58%",
      "--kanban-col-estimating-bg": "214 18% 11.8%",
      "--kanban-col-estimating-border": "214 20% 22%",
      "--kanban-col-estimating-accent": "210 84% 76%",
      "--kanban-col-estimated-bg": "262 22% 12%",
      "--kanban-col-estimated-border": "262 28% 24%",
      "--kanban-col-estimated-accent": "262 100% 84%",
      "--kanban-col-awaiting-bg": "36 16% 12.2%",
      "--kanban-col-awaiting-border": "36 18% 23%",
      "--kanban-col-awaiting-accent": "40 76% 74%",
      "--kanban-col-approved-bg": "158 14% 12.2%",
      "--kanban-col-approved-border": "158 16% 22.5%",
      "--kanban-col-approved-accent": "154 32% 70%",
      "--kanban-col-cancelled-bg": "353 14% 12.2%",
      "--kanban-col-cancelled-border": "353 16% 23%",
      "--kanban-col-cancelled-accent": "354 70% 79%",
      "--leader-goals-bg": "hsl(var(--info-soft) / 0.95)",
      "--leader-goals-border": "hsl(var(--info-soft-border))",
      "--leader-goals-foreground": "hsl(var(--info-foreground))",
      "--leader-assists-bg": "hsl(var(--success-soft) / 0.95)",
      "--leader-assists-border": "hsl(var(--success-soft-border))",
      "--leader-assists-foreground": "hsl(var(--success-foreground))",
      "--leader-points-bg": "hsl(var(--accent-tone-soft) / 0.95)",
      "--leader-points-border": "hsl(var(--accent-tone-soft-border))",
      "--leader-points-foreground": "hsl(var(--accent-tone-foreground))",
      "--leader-matches-bg": "hsl(var(--neutral-soft) / 0.94)",
      "--leader-matches-border": "hsl(var(--neutral-soft-border))",
      "--leader-matches-foreground": "hsl(var(--neutral-foreground))",
      "--leader-discipline-bg": "hsl(var(--warning-soft) / 0.95)",
      "--leader-discipline-border": "hsl(var(--warning-soft-border))",
      "--leader-discipline-foreground": "hsl(var(--warning-foreground))",
      "--leader-efficiency-bg": "hsl(var(--neutral-soft) / 0.98)",
      "--leader-efficiency-border": "hsl(var(--neutral-soft-border))",
      "--leader-efficiency-foreground": "hsl(var(--neutral-foreground))",
    },
  },
  radix: {
    label: "Radix",
    description: "Чистий системний набір на основі slate / blue / violet / jade / amber / red.",
    light: {
      "--primary": "221 83% 53%",
      "--destructive": "358 75% 59%",
      "--neutral-soft": "210 40% 98%",
      "--neutral-soft-border": "213 15.9% 86.5%",
      "--neutral-foreground": "220 5.9% 40%",
      "--info-soft": "210 100% 96.5%",
      "--info-soft-border": "213 100% 86.3%",
      "--info-foreground": "208 88.1% 42.9%",
      "--accent-tone-soft": "254 100% 97.5%",
      "--accent-tone-soft-border": "252 94.7% 85.1%",
      "--accent-tone-foreground": "252 55.8% 57.5%",
      "--success-soft": "154 70% 96.1%",
      "--success-soft-border": "149 57.8% 78.6%",
      "--success-foreground": "164 60.7% 32%",
      "--warning-soft": "45 100% 93.9%",
      "--warning-soft-border": "39 84% 75.5%",
      "--warning-foreground": "34 100% 31.6%",
      "--danger-soft": "7 100% 96.7%",
      "--danger-soft-border": "355 80% 84.3%",
      "--danger-foreground": "358 75.1% 59%",
    },
    dark: {
      "--primary": "214 100% 72%",
      "--destructive": "350 72% 76%",
      "--neutral-soft": "210 12.5% 12.5%",
      "--neutral-soft-border": "214 10.8% 25.5%",
      "--neutral-foreground": "216 6.8% 71%",
      "--info-soft": "211 58% 15.9%",
      "--info-soft-border": "211 66.3% 37.3%",
      "--info-foreground": "210 100% 72%",
      "--accent-tone-soft": "257 36.7% 19.2%",
      "--accent-tone-soft-border": "252 55.8% 57.5%",
      "--accent-tone-foreground": "253 100% 82.7%",
      "--success-soft": "158 24% 17.5%",
      "--success-soft-border": "160 28% 30%",
      "--success-foreground": "158 42% 66%",
      "--warning-soft": "36 57.3% 14.7%",
      "--warning-soft-border": "37 65.3% 33.9%",
      "--warning-foreground": "40 100% 68%",
      "--danger-soft": "347 24% 18%",
      "--danger-soft-border": "347 30% 34%",
      "--danger-foreground": "350 72% 76%",
    },
  },
  notion: {
    label: "Notion-ish",
    description: "М’якші і тепліші product-states: менш технічний характер, більше editorial balance.",
    light: {
      "--primary": "220 72% 51%",
      "--destructive": "358 67% 52%",
      "--neutral-soft": "40 18% 97.2%",
      "--neutral-soft-border": "30 12% 84.5%",
      "--neutral-foreground": "24 8% 38%",
      "--info-soft": "214 86% 96.6%",
      "--info-soft-border": "214 70% 85.4%",
      "--info-foreground": "217 74% 45%",
      "--accent-tone-soft": "270 80% 97%",
      "--accent-tone-soft-border": "268 58% 86%",
      "--accent-tone-foreground": "267 45% 53%",
      "--success-soft": "148 42% 95.8%",
      "--success-soft-border": "148 28% 80.4%",
      "--success-foreground": "150 38% 33%",
      "--warning-soft": "44 92% 94.8%",
      "--warning-soft-border": "41 72% 80%",
      "--warning-foreground": "33 74% 35%",
      "--danger-soft": "5 86% 96.2%",
      "--danger-soft-border": "4 62% 84.5%",
      "--danger-foreground": "358 58% 50%",
    },
    dark: {
      "--primary": "215 94% 74%",
      "--destructive": "355 78% 80%",
      "--neutral-soft": "24 9% 13%",
      "--neutral-soft-border": "24 7% 23.5%",
      "--neutral-foreground": "32 8% 72%",
      "--info-soft": "214 30% 16%",
      "--info-soft-border": "214 36% 28%",
      "--info-foreground": "212 96% 78%",
      "--accent-tone-soft": "268 20% 18%",
      "--accent-tone-soft-border": "268 24% 31%",
      "--accent-tone-foreground": "270 100% 86%",
      "--success-soft": "150 17% 17%",
      "--success-soft-border": "150 18% 27.5%",
      "--success-foreground": "148 34% 72%",
      "--warning-soft": "36 26% 16%",
      "--warning-soft-border": "36 28% 28%",
      "--warning-foreground": "42 88% 74%",
      "--danger-soft": "356 18% 17%",
      "--danger-soft-border": "356 20% 28%",
      "--danger-foreground": "355 74% 80%",
    },
  },
  primer: {
    label: "Primer",
    description: "GitHub Primer: контрастні чисті product colors з дуже впізнаваним green / amber / blue балансом.",
    light: {
      ...buildDerivedSemanticAliases(),
      "--primary": "212 92.1% 44.5%",
      "--destructive": "356 70.6% 48%",
      "--neutral-soft": "210 17.4% 96.6%",
      "--neutral-soft-border": "214 13.4% 83.9%",
      "--neutral-foreground": "215 13.8% 34.1%",
      "--info-soft": "199 100% 93.3%",
      "--info-soft-border": "204 100% 75%",
      "--info-foreground": "212 92.1% 44.5%",
      "--accent-tone-soft": "285 100% 96.9%",
      "--accent-tone-soft-border": "263 91% 78.2%",
      "--accent-tone-foreground": "261 69.1% 59.4%",
      "--success-soft": "133 80.5% 92%",
      "--success-soft-border": "137 59.1% 80.9%",
      "--success-foreground": "137 66% 30%",
      "--warning-soft": "53 100% 88.6%",
      "--warning-soft-border": "48 92.2% 73.7%",
      "--warning-foreground": "40 100% 30.2%",
      "--danger-soft": "5 100% 95.7%",
      "--danger-soft-border": "4 100% 90%",
      "--danger-foreground": "356 70.6% 48%",
    },
    dark: {
      ...buildDerivedSemanticAliases(),
      "--primary": "215 92.6% 57.6%",
      "--destructive": "3 92.6% 62.9%",
      "--neutral-soft": "216 15% 14.3%",
      "--neutral-soft-border": "215 14% 24%",
      "--neutral-foreground": "220 14% 71%",
      "--info-soft": "216 32% 16.2%",
      "--info-soft-border": "216 40% 28%",
      "--info-foreground": "215 92.6% 57.6%",
      "--accent-tone-soft": "263 26% 17.5%",
      "--accent-tone-soft-border": "263 34% 30%",
      "--accent-tone-foreground": "262 89.3% 70.6%",
      "--success-soft": "128 22% 16.5%",
      "--success-soft-border": "128 24% 28%",
      "--success-foreground": "128 49.2% 48.6%",
      "--warning-soft": "41 24% 16.8%",
      "--warning-soft-border": "41 28% 29%",
      "--warning-foreground": "41 72.1% 47.8%",
      "--danger-soft": "3 22% 16.6%",
      "--danger-soft-border": "3 26% 28.5%",
      "--danger-foreground": "3 92.6% 62.9%",
    },
  },
  atlassian: {
    label: "Atlassian",
    description: "Atlassian-style: сильний корпоративний blue, виразний amber і більш діловий зелений з продуктовим purple.",
    light: {
      ...buildDerivedSemanticAliases(),
      "--primary": "216 100% 40%",
      "--destructive": "11 100% 59.4%",
      "--neutral-soft": "210 20% 96.9%",
      "--neutral-soft-border": "213 14% 84%",
      "--neutral-foreground": "216 15% 38%",
      "--info-soft": "214 100% 95%",
      "--info-soft-border": "214 100% 84%",
      "--info-foreground": "216 100% 40%",
      "--accent-tone-soft": "252 46% 95.5%",
      "--accent-tone-soft-border": "250 38% 80%",
      "--accent-tone-foreground": "249 46.2% 54.1%",
      "--success-soft": "155 48% 93.5%",
      "--success-soft-border": "155 42% 78%",
      "--success-foreground": "155 53.6% 45.7%",
      "--warning-soft": "40 100% 93%",
      "--warning-soft-border": "40 100% 78%",
      "--warning-foreground": "40 100% 50%",
      "--danger-soft": "11 100% 95.8%",
      "--danger-soft-border": "11 100% 84%",
      "--danger-foreground": "11 100% 59.4%",
    },
    dark: {
      ...buildDerivedSemanticAliases(),
      "--primary": "213 100% 69%",
      "--destructive": "11 100% 70%",
      "--neutral-soft": "220 14% 13.5%",
      "--neutral-soft-border": "220 14% 24%",
      "--neutral-foreground": "220 14% 72%",
      "--info-soft": "216 34% 16%",
      "--info-soft-border": "216 40% 28%",
      "--info-foreground": "213 100% 69%",
      "--accent-tone-soft": "249 24% 18%",
      "--accent-tone-soft-border": "249 28% 31%",
      "--accent-tone-foreground": "252 60% 73%",
      "--success-soft": "155 22% 16.8%",
      "--success-soft-border": "155 24% 28%",
      "--success-foreground": "155 54% 58%",
      "--warning-soft": "40 26% 16.5%",
      "--warning-soft-border": "40 30% 29%",
      "--warning-foreground": "40 100% 62%",
      "--danger-soft": "11 24% 16.8%",
      "--danger-soft-border": "11 28% 29%",
      "--danger-foreground": "11 100% 70%",
    },
  },
  carbon: {
    label: "Carbon",
    description: "IBM Carbon: глибокий product blue, чіткі support colors і більш технічний enterprise-характер.",
    light: {
      ...buildDerivedSemanticAliases(),
      "--primary": "219 99.2% 52.7%",
      "--destructive": "357 75.8% 48.6%",
      "--neutral-soft": "220 20% 96.8%",
      "--neutral-soft-border": "220 13% 84%",
      "--neutral-foreground": "215 14% 34%",
      "--info-soft": "216 100% 95.8%",
      "--info-soft-border": "216 100% 84.5%",
      "--info-foreground": "219 99.2% 52.7%",
      "--accent-tone-soft": "264 100% 96.5%",
      "--accent-tone-soft-border": "264 82% 84%",
      "--accent-tone-foreground": "264 96.9% 61.8%",
      "--success-soft": "137 46% 93.5%",
      "--success-soft-border": "137 36% 78%",
      "--success-foreground": "137 63.5% 38.6%",
      "--warning-soft": "47 88% 91%",
      "--warning-soft-border": "47 84% 74%",
      "--warning-foreground": "47 88.4% 38%",
      "--danger-soft": "357 88% 95.2%",
      "--danger-soft-border": "357 78% 83%",
      "--danger-foreground": "357 75.8% 48.6%",
    },
    dark: {
      ...buildDerivedSemanticAliases(),
      "--primary": "218 100% 63.5%",
      "--destructive": "357 94.5% 64.1%",
      "--neutral-soft": "220 13% 14%",
      "--neutral-soft-border": "220 12% 25%",
      "--neutral-foreground": "220 14% 74%",
      "--info-soft": "218 30% 16.5%",
      "--info-soft-border": "218 34% 29%",
      "--info-foreground": "218 100% 63.5%",
      "--accent-tone-soft": "264 28% 18%",
      "--accent-tone-soft-border": "264 32% 31%",
      "--accent-tone-foreground": "263 100% 79.2%",
      "--success-soft": "137 22% 17%",
      "--success-soft-border": "137 24% 28.5%",
      "--success-foreground": "137 48.8% 50.2%",
      "--warning-soft": "47 24% 17%",
      "--warning-soft-border": "47 28% 30%",
      "--warning-foreground": "47 88.4% 52.5%",
      "--danger-soft": "357 24% 17.2%",
      "--danger-soft-border": "357 26% 29.5%",
      "--danger-foreground": "357 94.5% 64.1%",
    },
  },
};

const PRESET_TRIGGER_ORDER: PresetKey[] = ["current", "linear", "radix", "notion", "primer", "atlassian", "carbon"];

function useDocumentTheme(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    });

    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[var(--radius-section)] border border-border bg-card/80 shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function VarPanel({
  label,
  bg,
  border,
  color,
  children,
}: {
  label: string;
  bg: string;
  border: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius-inner)] border px-4 py-3"
      style={{
        background: bg,
        borderColor: border,
        color,
      }}
    >
      <div className="text-sm font-semibold">{label}</div>
      {children ? <div className="mt-1 text-sm opacity-85">{children}</div> : null}
    </div>
  );
}

function KanbanChip({ label, bgVar, borderVar, accentVar }: { label: string; bgVar: string; borderVar: string; accentVar: string }) {
  return (
    <div
      className="rounded-[var(--radius-inner)] border px-4 py-3 shadow-none"
      style={{
        backgroundColor: `hsl(var(${bgVar}))`,
        borderColor: `hsl(var(${borderVar}))`,
        boxShadow: `inset 0 3px 0 hsl(var(${accentVar}) / 0.9)`,
      }}
    >
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">Kanban surface accent</div>
    </div>
  );
}

function CatalogBadgePreview({ item }: { item: BadgeCatalogItem }) {
  if (item.renderAs === "chip") {
    return (
      <Chip active={item.active} className={cn("text-xs", item.className)}>
        {item.previewLabel ?? item.label}
      </Chip>
    );
  }

  if (item.renderAs === "tag") {
    return <span className={cn("inline-flex items-center", item.className)}>{item.previewLabel ?? item.label}</span>;
  }

  return (
    <Badge
      tone={item.tone}
      variant={item.tone ? "outline" : (item.variant ?? "outline")}
      className={cn("text-xs", item.className)}
    >
      {item.previewLabel ?? item.label}
    </Badge>
  );
}

export default function ColorPalettePage() {
  const [preset, setPreset] = useState<PresetKey>("current");
  const [catalogTab, setCatalogTab] = useState<string>(BADGE_CATALOG_TABS[0]?.id ?? "quotes");
  const [designSystemTab, setDesignSystemTab] = useState<"palette" | "color-palette" | "badges">("badges");
  const theme = useDocumentTheme();
  const presetConfig = PRESETS[preset];
  const previewVars = useMemo(
    () => (theme === "dark" ? presetConfig.dark : presetConfig.light) as React.CSSProperties,
    [presetConfig, theme],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-10">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/80 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border tone-icon-box-accent">
              <SwatchBook className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Design System</h1>
              <p className="max-w-4xl text-sm text-muted-foreground">
                Тут зібрані не тільки кольори, а всі badge-like маркери інтерфейсу: semantic tones, status badges, chips, legal pills,
                канбан-мітки, design/output labels і catalog tags. Це точка збору для подальшої нормалізації.
              </p>
            </div>
          </div>

          <div className="space-y-3 xl:max-w-[34rem] xl:text-right">
            <div className="flex items-center justify-start gap-2 xl:justify-end">
              <Badge variant="outline" className="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {theme === "dark" ? "Dark" : "Light"} mode
              </Badge>
              <Badge variant="outline" className="rounded-full border px-3 py-1 tone-accent">
                {presetConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Зверху тепер є окремі таби для палітри і badge-like елементів, щоб їх можна було розбирати окремо.</p>
          </div>
        </div>
      </div>

      <div style={previewVars}>
        <Tabs value={designSystemTab} onValueChange={(value) => setDesignSystemTab(value as typeof designSystemTab)}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="palette">Palette</TabsTrigger>
            <TabsTrigger value="color-palette">Color Palette</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
          </TabsList>

          <TabsContent value="palette" className="mt-6 space-y-6">
            <SectionCard
              title="Palette Presets"
              description="Тут можна перемикати системні palette presets і дивитися, як вони впливають на semantic layer."
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2 xl:max-w-2xl">
                  <div className="text-sm font-semibold text-foreground">{presetConfig.label}</div>
                  <p className="text-sm text-muted-foreground">{presetConfig.description}</p>
                </div>
                <Tabs value={preset} onValueChange={(value) => setPreset(value as PresetKey)}>
                  <TabsList className="h-auto flex-wrap justify-start xl:justify-end">
                    {PRESET_TRIGGER_ORDER.map((key) => (
                      <TabsTrigger key={key} value={key} className="min-w-[7rem]">
                        {PRESETS[key].label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-3">
              <SectionCard title="Semantic Families" description="Базові product tones для всіх станів.">
                <div className="flex flex-wrap gap-2">
                  {TONES.map((tone) => (
                    <Badge key={tone.key} variant="outline" className={cn("rounded-full border px-3 py-1", tone.badgeClass)}>
                      {tone.label}
                    </Badge>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="System Tokens" description="Brand, destructive та кількість badge-like варіантів.">
                <div className="grid gap-3">
                  <VarPanel label="Primary" bg="hsl(var(--primary) / 0.12)" border="hsl(var(--primary) / 0.28)" color="hsl(var(--primary))">
                    Brand accent
                  </VarPanel>
                  <VarPanel label="Destructive" bg="hsl(var(--destructive) / 0.12)" border="hsl(var(--destructive) / 0.28)" color="hsl(var(--destructive))">
                    Critical action
                  </VarPanel>
                </div>
              </SectionCard>
              <SectionCard title="Registry Scope" description="Що саме вже заведено в цей design system.">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-[var(--radius-inner)] border border-border/70 bg-background/70 px-4 py-3">
                    <div className="text-lg font-semibold text-foreground">{BADGE_CATALOG_ITEM_COUNT}</div>
                    badge-like variants already indexed
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BADGE_CATALOG_TABS.map((tab) => (
                      <Badge key={tab.id} variant="outline" className="rounded-full border px-3 py-1 text-xs">
                        {tab.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>
          </TabsContent>

          <TabsContent value="color-palette" className="mt-6 space-y-6">
            <SectionCard
              title="Core Semantic Tones"
              description="Базовий шар продукту, на який повинні спиратися badges, status chips, warning/success surfaces і secondary actions."
            >
              <div className="grid gap-4 xl:grid-cols-3">
                {TONES.map((tone) => {
                  const ToneIcon = TONE_ICON[tone.key];
                  return (
                    <div key={tone.key} className="rounded-[var(--radius-inner)] border border-border/70 bg-background/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-lg font-semibold text-foreground">{tone.label}</div>
                          <p className="text-sm text-muted-foreground">{tone.description}</p>
                        </div>
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", tone.iconBoxClass)}>
                          <ToneIcon className="h-4.5 w-4.5" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("rounded-full border px-3 py-1", tone.badgeClass)}>
                          {tone.label}
                        </Badge>
                        <span className={cn("text-sm font-medium", tone.textClass)}>{tone.label} text</span>
                        <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", tone.dotClass)} />
                      </div>

                      <div className={cn("mt-4 rounded-[var(--radius-inner)] border p-4", tone.subtleClass)}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className={cn("text-sm font-semibold", tone.textClass)}>Surface preview</div>
                            <div className={cn("mt-1 text-sm", tone.copyClass)}>Secondary panel з цим semantic tone.</div>
                          </div>
                          <div className={cn("rounded-xl border px-2.5 py-1 text-xs font-semibold", tone.badgeClass)}>{tone.label}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className={cn("border", tone.badgeClass)}>
                          Outline
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className={cn("hover:bg-transparent", tone.textClass)}>
                          Text action
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <SectionCard title="Brand And System Colors" description="Primary brand accent і system destructive tone, які теж використовуються поза semantic badges.">
                <div className="grid gap-4 md:grid-cols-2">
                  <VarPanel label="Primary" bg="hsl(var(--primary) / 0.12)" border="hsl(var(--primary) / 0.28)" color="hsl(var(--primary))">
                    Brand blue для фокусу, CTA, navigation accents.
                  </VarPanel>
                  <VarPanel label="Destructive" bg="hsl(var(--destructive) / 0.12)" border="hsl(var(--destructive) / 0.28)" color="hsl(var(--destructive))">
                    System red для destructive кнопок і критичних confirm states.
                  </VarPanel>
                </div>
              </SectionCard>

              <SectionCard title="Quote Status Mapping" description="Фактична мапа статусів прорахунків після уніфікації.">
                <div className="space-y-3">
                  {STATUS_ROWS.map((row) => {
                    const tone = TONES.find((item) => item.key === row.tone)!;
                    return (
                      <div key={row.label} className="flex items-center justify-between rounded-[var(--radius-inner)] border border-border/70 bg-background/70 px-4 py-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">{row.label}</div>
                          <div className="text-xs text-muted-foreground">Semantic tone: {tone.label}</div>
                        </div>
                        <Badge variant="outline" className={cn("rounded-full border px-3 py-1", tone.badgeClass)}>
                          {row.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <SectionCard title="Command Palette Kind Tokens" description="Кольори типів сутностей усередині command palette search.">
                <div className="flex flex-wrap gap-3">
                  {COMMAND_KIND_CLASSES.map((item) => (
                    <Badge key={item.label} variant="outline" className={cn("rounded-full border px-3 py-1 text-xs uppercase tracking-wide", item.className)}>
                      {item.label}
                    </Badge>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Entity Avatar Families" description="Усі 6 color families, які застосовуються до логотипів/аватарів сутностей.">
                <div className="grid gap-3 sm:grid-cols-3">
                  {AVATAR_TONES.map((tone) => (
                    <div key={tone.label} className="rounded-[var(--radius-inner)] border border-border/70 bg-background/70 p-3">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold", tone.shellClass)}>{tone.glyph}</span>
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold", tone.fallbackClass)}>{tone.glyph}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{tone.label}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <SectionCard title="Kanban Status Surfaces" description="Column accents для estimates/design kanban surfaces.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {KANBAN_SWATCHES.map((item) => (
                    <KanbanChip key={item.label} {...item} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Leaderboard Tokens" description="Акценти для player/team leader cards та окремих performance-модулів.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {LEADER_SWATCHES.map((item) => (
                    <VarPanel key={item.label} label={item.label} bg={item.bg} border={item.border} color={item.color}>
                      Leader accent family
                    </VarPanel>
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Rating Gradients" description="Градієнти для рейтингів і achievement-like surfaces.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {RATING_SWATCHES.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[var(--radius-inner)] border px-4 py-4"
                    style={{
                      borderColor: item.border,
                      color: item.color,
                      backgroundImage: `linear-gradient(135deg, ${item.from}, ${item.mid}, ${item.to})`,
                    }}
                  >
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="mt-1 text-xs opacity-90">Rating gradient</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="badges" className="mt-6">
            <SectionCard
              title="Badge Registry"
              description={`Зведений інвентар badge-like елементів у проєкті. Зараз у каталозі ${BADGE_CATALOG_ITEM_COUNT} варіантів, включно з badges, chips і pill/tags, згрупованих по доменах і прив'язаних до source files.`}
            >
              <Tabs value={catalogTab} onValueChange={setCatalogTab}>
                <TabsList className="h-auto flex-wrap justify-start">
                  {BADGE_CATALOG_TABS.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id} className="min-w-[7rem]">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {BADGE_CATALOG_TABS.map((tab) => (
                  <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-4">
                    <div className="rounded-[var(--radius-inner)] border border-border/70 bg-background/70 px-4 py-3">
                      <div className="text-sm font-semibold text-foreground">{tab.label}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{tab.description}</p>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      {tab.groups.map((group) => (
                        <div key={group.id} className="rounded-[var(--radius-inner)] border border-border/70 bg-background/70 p-4">
                          <div className="space-y-1">
                            <div className="text-base font-semibold text-foreground">{group.label}</div>
                            <p className="text-sm text-muted-foreground">{group.description}</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {group.items.map((item) => (
                              <CatalogBadgePreview key={`${group.id}-${item.label}`} item={item} />
                            ))}
                          </div>

                          <div className="mt-4 space-y-2">
                            {group.items.map((item) => (
                              <div
                                key={`${group.id}-${item.label}-meta`}
                                className="rounded-xl border border-border/60 bg-card/60 px-3 py-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                                    <p className="text-xs leading-5 text-muted-foreground">{item.note}</p>
                                  </div>
                                  <CatalogBadgePreview item={item} />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.source.map((source) => (
                                    <code
                                      key={`${group.id}-${item.label}-${source}`}
                                      className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
                                    >
                                      {source}
                                    </code>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
