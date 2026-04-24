import {
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Bot,
  Building2,
  Calculator,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Factory,
  FileText,
  ImageIcon,
  Layers3,
  Loader2,
  MessageSquare,
  Paperclip,
  PanelsTopLeft,
  Palette,
  Presentation,
  Plus,
  Route,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { EntityAvatar, PlayerAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { uploadAttachmentWithVariants, removeAttachmentWithVariants } from "@/lib/attachmentPreview";
import { cn } from "@/lib/utils";
import {
  buildToShoAiRouteContext,
  callToShoAiApi,
  callToShoAiMentionSuggestions,
  readToShoAiLastContext,
  type ToShoAiAttachment,
  type ToShoAiApiResponse,
  type ToShoAiKnowledgeItem,
  type ToShoAiMentionKind,
  type ToShoAiMentionSuggestion,
  type ToShoAiMessage,
  type ToShoAiMode,
  type ToShoAiRequestSummary,
  type ToShoAiRouteContext,
  type ToShoAiSnapshot,
} from "@/lib/toshoAi";

type ToShoAiConsoleProps = {
  active?: boolean;
  surface?: "page" | "sheet";
  initialContext?: ToShoAiRouteContext | null;
  initialRequestId?: string | null;
};

type KnowledgeDraft = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  tags: string;
  keywords: string;
  sourceLabel: string;
  sourceHref: string;
  status: "active" | "draft" | "archived";
};

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type PromptSuggestion = {
  label: string;
  text: string;
};

type PromptSuggestionGroup = {
  id: "managers" | "designers" | "customers" | "employees";
  label: string;
  description: string;
  tone: "design" | "orders" | "customers" | "team" | "general";
  prompts: PromptSuggestion[];
};

type PersonalPromptSuggestion = {
  label: string;
  text: string;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
  kind: ToShoAiMentionKind | null;
  marker: string;
};

type AnalyticsBadge = {
  label: string;
  value: number | string;
};

type AnalyticsRow = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  primary: string;
  secondary?: string | null;
  badges?: AnalyticsBadge[];
};

type AnalyticsPayload = {
  kind: "people" | "entity";
  title: string;
  caption: string;
  avatarUrl?: string | null;
  metricLabel: string;
  rows: AnalyticsRow[];
  note?: string | null;
};

type SuggestedAction = {
  label: string;
  text: string;
};

type ToShoAiComposerIntent = ToShoAiMode | "auto";

const SUPPORT_ATTACHMENT_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined)?.trim() || "attachments";
const MAX_SUPPORT_ATTACHMENTS = 4;
const MAX_SUPPORT_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

const MODE_META: Record<
  ToShoAiMode,
  {
    label: string;
    hint: string;
    placeholder: string;
    icon: typeof Sparkles;
    tone: "info" | "warning" | "success" | "accent";
    prompts: string[];
  }
> = {
  ask: {
    label: "Поясни",
    hint: "Шо це і як це працює",
    placeholder: "Напиши питання або опиши, що треба зробити.",
    icon: Sparkles,
    tone: "info",
    prompts: [
      "Як тут правильно провести замовника від ліда до прорахунку?",
      "Поясни, що саме відбувається на цій сторінці.",
      "Покажи, де тут найчастіше помиляються.",
    ],
  },
  fix: {
    label: "Полагодь",
    hint: "Шось не те? Знайду, де болить",
    placeholder: "Опиши проблему: що сталося і що мало бути.",
    icon: Wrench,
    tone: "warning",
    prompts: [
      "Не зберігається форма після натискання кнопки.",
      "Сторінка відкривається, але дані не підтягуються.",
      "Після зміни статусу нічого не відбувається.",
    ],
  },
  route: {
    label: "Передай",
    hint: "Зберу контекст і закину кому треба",
    placeholder: "Опиши запит, який треба передати далі.",
    icon: Route,
    tone: "accent",
    prompts: [
      "Перекинь це в дизайн з нормальним брифом.",
      "Потрібно передати це менеджеру по логістиці.",
      "Зроби з цього нормальний support case.",
    ],
  },
  resolve: {
    label: "Дотисни",
    hint: "Не загублю, не відпущу, доведу",
    placeholder: "Опиши задачу, яку треба довести до результату.",
    icon: CheckCheck,
    tone: "success",
    prompts: [
      "Дотисни кейс до нормального маршруту і пріоритету.",
      "Підсумуй, що треба зробити далі і хто власник.",
      "Перетвори це на чіткий план дій.",
    ],
  },
};

const AUTO_MODE_META = {
  label: "Авто",
  hint: "ToSho AI сам вирішить, що з цим робити",
  placeholder: "Напиши питання, проблему або задачу.",
  prompts: [
    "Що тут зараз відбувається?",
    "Щось не працює, допоможи розібратись.",
    "Потрібно передати це далі з нормальним контекстом.",
  ],
} as const;

const EMPTY_DRAFT: KnowledgeDraft = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  tags: "",
  keywords: "",
  sourceLabel: "",
  sourceHref: "",
  status: "active",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Щойно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Щойно";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(value?: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function isPreviewableAttachment(attachment: Pick<ToShoAiAttachment, "mimeType" | "url">) {
  return Boolean(attachment.url && attachment.mimeType?.startsWith("image/"));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function mentionKindFromMarker(value: string): ToShoAiMentionKind | null {
  const normalized = normalizeSearch(value);
  if (["замовник", "замовники", "клієнт", "клієнти", "customer"].includes(normalized)) return "customer";
  if (["лід", "ліди", "lead"].includes(normalized)) return "lead";
  if (["менеджер", "менеджери", "manager"].includes(normalized)) return "manager";
  if (["дизайнер", "дизайнери", "designer"].includes(normalized)) return "designer";
  if (["співробітник", "співробітники", "користувач", "користувачі", "employee", "user"].includes(normalized)) {
    return "employee";
  }
  return null;
}

function getMentionKindLabel(kind: ToShoAiMentionKind | null) {
  if (kind === "customer") return "замовника";
  if (kind === "lead") return "ліда";
  if (kind === "manager") return "менеджера";
  if (kind === "designer") return "дизайнера";
  if (kind === "employee") return "співробітника";
  return "з CRM";
}

function getActiveMention(value: string, cursorPosition: number | null | undefined): ActiveMention | null {
  if (typeof cursorPosition !== "number") return null;
  const beforeCursor = value.slice(0, cursorPosition);
  const start = beforeCursor.lastIndexOf("@");
  if (start < 0) return null;
  const fragment = beforeCursor.slice(start);
  if (fragment.length > 80 || /[\n?!]/u.test(fragment)) return null;
  const raw = fragment.slice(1);
  const colonIndex = raw.indexOf(":");
  const marker = colonIndex >= 0 ? raw.slice(0, colonIndex) : "";
  const query = colonIndex >= 0 ? raw.slice(colonIndex + 1) : raw;
  const kind = colonIndex >= 0 ? mentionKindFromMarker(marker) : null;
  if (colonIndex >= 0 && marker && !kind) return null;
  if (query.includes("@")) return null;
  return {
    start,
    end: cursorPosition,
    query: query.trimStart(),
    kind,
    marker,
  };
}

function formatAssistantMessageBody(body: string) {
  return body
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readAnalyticsPayload(metadata: Record<string, unknown> | null): AnalyticsPayload | null {
  const analytics = metadata?.analytics;
  if (!isRecord(analytics)) return null;
  const rows = Array.isArray(analytics.rows) ? analytics.rows : [];
  const parsedRows = rows.flatMap((row): AnalyticsRow[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string") return [];
    const badges = Array.isArray(row.badges)
      ? row.badges.flatMap((badge): AnalyticsBadge[] => {
          if (!isRecord(badge) || typeof badge.label !== "string") return [];
          const value = badge.value;
          if (typeof value !== "string" && typeof value !== "number") return [];
          return [{ label: badge.label, value }];
        })
      : [];
    return [
      {
        id: row.id,
        label: row.label,
        avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
        primary: typeof row.primary === "string" ? row.primary : String(row.primary ?? ""),
        secondary: typeof row.secondary === "string" ? row.secondary : null,
        badges,
      },
    ];
  });

  const kind = analytics.kind === "entity" ? "entity" : "people";
  const title = typeof analytics.title === "string" ? analytics.title : "";
  const caption = typeof analytics.caption === "string" ? analytics.caption : "";
  const avatarUrl = typeof analytics.avatarUrl === "string" ? analytics.avatarUrl : null;
  const metricLabel = typeof analytics.metricLabel === "string" ? analytics.metricLabel : "Показник";
  if (!title && parsedRows.length === 0) return null;

  return {
    kind,
    title: title || "Підрахунок",
    caption,
    avatarUrl,
    metricLabel,
    rows: parsedRows,
    note: typeof analytics.note === "string" ? analytics.note : null,
  };
}

function readSuggestedActions(metadata: Record<string, unknown> | null): SuggestedAction[] {
  const raw = metadata?.suggestedActions;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .flatMap((action): SuggestedAction[] => {
      if (!isRecord(action) || typeof action.label !== "string" || typeof action.text !== "string") return [];
      const label = action.label.trim();
      const text = action.text.trim();
      if (!label || !text) return [];
      return [{ label, text }];
    })
    .filter((action) => {
      const key = action.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function readAiDiagnostics(metadata: Record<string, unknown> | null) {
  const openAi = isRecord(metadata?.openAi) ? metadata.openAi : null;
  const retrieval = isRecord(metadata?.knowledgeRetrieval) ? metadata.knowledgeRetrieval : null;
  const tools = isRecord(metadata?.crmTools) ? metadata.crmTools : null;
  if (!openAi && !retrieval && !tools) return null;

  const numberValue = (source: Record<string, unknown> | null, key: string) => {
    const value = source?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const stringValue = (source: Record<string, unknown> | null, key: string) => {
    const value = source?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const stringList = (source: Record<string, unknown> | null, key: string) =>
    Array.isArray(source?.[key]) ? (source?.[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];

  return {
    openAi: openAi
      ? {
          ok: openAi.ok === true,
          model: stringValue(openAi, "model"),
          latencyMs: numberValue(openAi, "latencyMs"),
          inputTokens: numberValue(openAi, "inputTokens"),
          outputTokens: numberValue(openAi, "outputTokens"),
          totalTokens: numberValue(openAi, "totalTokens"),
          imageInputs: numberValue(openAi, "usedImageInputs"),
          responseId: stringValue(openAi, "responseId"),
          error: stringValue(openAi, "error"),
        }
      : null,
    retrieval: retrieval
      ? {
          strategy: stringValue(retrieval, "strategy"),
          model: stringValue(retrieval, "model"),
          candidateCount: numberValue(retrieval, "candidateCount"),
          selectedCount: numberValue(retrieval, "selectedCount"),
          persistedCount: numberValue(retrieval, "persistedCount"),
          refreshedCount: numberValue(retrieval, "refreshedCount"),
          latencyMs: numberValue(retrieval, "latencyMs"),
          totalTokens: numberValue(retrieval, "totalTokens"),
          error: stringValue(retrieval, "error"),
        }
      : null,
    tools: tools
      ? {
          requested: stringList(tools, "requested"),
          executed: stringList(tools, "executed"),
          latencyMs: numberValue(tools, "latencyMs"),
          error: stringValue(tools, "error"),
        }
      : null,
  };
}

function getAnalyticsBadgeIcon(label: string) {
  const normalized = normalizeSearch(label);
  if (normalized.includes("візуал +")) return Layers3;
  if (normalized.includes("візуал")) return ImageIcon;
  if (normalized.includes("презентац")) return Presentation;
  if (normalized.includes("креатив")) return Sparkles;
  if (normalized.includes("адаптац")) return Copy;
  if (normalized.includes("макет")) return PanelsTopLeft;
  return null;
}

function getAnalyticsRowIcon(label: string, metricLabel?: string | null) {
  const normalized = normalizeSearch(`${label} ${metricLabel ?? ""}`);
  if (normalized.includes("прорах")) return Calculator;
  if (normalized.includes("замовл")) return Factory;
  if (normalized.includes("дизайн") || normalized.includes("задач") || normalized.includes("таск")) return Palette;
  return Building2;
}

function formatShortDisplayName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return value;
  return `${parts[0]} ${parts[1][0]}.`;
}

function normalizeRoleText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function buildPromptSuggestionGroups(input: {
  jobRole?: string | null;
  canManageQueue?: boolean;
  domainHint: ToShoAiRouteContext["domainHint"];
}): PromptSuggestionGroup[] {
  const jobRole = normalizeRoleText(input.jobRole);
  const isDesigner = jobRole === "designer" || jobRole === "дизайнер" || input.domainHint === "design";
  const isManager = ["manager", "менеджер", "sales_manager", "junior_sales_manager"].includes(jobRole);
  const isOps = jobRole === "pm" || jobRole === "logistics";
  const isAdminLike = input.canManageQueue || jobRole === "seo";
  const groups: PromptSuggestionGroup[] = [
    {
      id: "managers",
      label: "Менеджери",
      description: "Прорахунки, замовлення, клієнти по менеджерах.",
      tone: "orders",
      prompts: [
        {
          label: "Прорахунки за тиждень",
          text: "дай зріз по менеджерах скільки прорахунків за останній тиждень",
        },
        {
          label: "Замовлення за тиждень",
          text: "скільки замовлень по менеджерах за останній тиждень?",
        },
        {
          label: "Клієнти менеджера",
          text: "скільки замовників у @менеджер: за місяць?",
        },
        {
          label: "Прорахунки менеджера",
          text: "скільки прорахунків у @менеджер: за місяць?",
        },
      ],
    },
    {
      id: "designers",
      label: "Дизайнери",
      description: "Закриті дизайн-задачі, типи робіт, статистика по дизайнеру.",
      tone: "design",
      prompts: [
        {
          label: "Таски за місяць",
          text: "скільки тасок зробив кожен дизайнер за останній місяць?",
        },
        {
          label: "Дизайнер за місяць",
          text: "скільки дизайнів зробив/зробила @дизайнер: за місяць?",
        },
        {
          label: "Візуали та адаптації",
          text: "скільки візуалізацій і адаптацій зробили дизайнери за місяць?",
        },
        {
          label: "Дизайн за тиждень",
          text: "скільки дизайн-задач закрили за тиждень?",
        },
      ],
    },
    {
      id: "customers",
      label: "Замовники",
      description: "Хто дає найбільше прорахунків, замовлень і активності.",
      tone: "customers",
      prompts: [
        {
          label: "Топ по прорахунках",
          text: "у якого замовника найбільше прорахунків за тиждень?",
        },
        {
          label: "Конкретний замовник",
          text: "скільки прорахунків у замовника @замовник: за місяць?",
        },
        {
          label: "Прорахунки і замовлення",
          text: "скільки у замовника @замовник: прорахунків і замовлень?",
        },
        {
          label: "Без лого",
          text: "Покажи замовників і лідів без логотипа.",
        },
        {
          label: "Зріз по замовниках",
          text: "покажи прорахунки по замовниках за місяць",
        },
      ],
    },
    {
      id: "employees",
      label: "Співробітник",
      description: "Запити по конкретному імені, ролі або активності.",
      tone: "team",
      prompts: [
        {
          label: "Статистика",
          text: "дай статистику по @співробітник: за місяць",
        },
        {
          label: "Як менеджер",
          text: "скільки прорахунків у @менеджер: за місяць?",
        },
        {
          label: "Як дизайнер",
          text: "скільки дизайнів зробив/зробила @дизайнер: за тиждень?",
        },
        {
          label: "Клієнти менеджера",
          text: "скільки замовників у @менеджер: за місяць?",
        },
      ],
    },
  ];

  if (isDesigner) {
    return [groups[1], groups[3], groups[2], groups[0]];
  }

  if (isManager) {
    return [groups[0], groups[2], groups[3], groups[1]];
  }

  if (isOps) {
    return [groups[0], groups[2], groups[1], groups[3]];
  }

  if (isAdminLike) {
    return groups;
  }

  return [groups[0], groups[2], groups[1], groups[3]];
}

function buildPersonalPromptSuggestions(input: {
  jobRole?: string | null;
  canManageQueue?: boolean;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  isSeo?: boolean;
  domainHint: ToShoAiRouteContext["domainHint"];
}): PersonalPromptSuggestion[] {
  const jobRole = normalizeRoleText(input.jobRole);
  const isDesigner = jobRole === "designer" || jobRole === "дизайнер" || input.domainHint === "design";
  const isLogistics = jobRole === "logistics" || jobRole === "head_of_logistics" || input.domainHint === "logistics";
  const isManager = ["manager", "менеджер", "sales_manager", "junior_sales_manager", "pm"].includes(jobRole) || input.domainHint === "orders";
  const isAdminLike = input.isSuperAdmin || input.isAdmin || input.isSeo;

  if (isAdminLike) {
    return [
      { label: "Що сьогодні?", text: "дай адмін-зріз по дню: баги, observability і ризики" },
      { label: "Чи є баги?", text: "чи є сьогодні баги або runtime errors?" },
      { label: "Перформанс", text: "покажи стан перформансу і бази сьогодні" },
      { label: "Сховище", text: "що зі сховищем і вкладеннями сьогодні?" },
      { label: "Бекапи", text: "покажи стан storage backup і database backup" },
    ];
  }

  if (isDesigner) {
    return [
      { label: "Що робити?", text: "що мені робити сьогодні?" },
      { label: "План на день", text: "дай мені план на день" },
      { label: "Що горить?", text: "що горить у моїй черзі?" },
      { label: "Що дотиснути?", text: "що мені дотиснути сьогодні?" },
    ];
  }

  if (isLogistics) {
    return [
      { label: "Що робити?", text: "що мені робити сьогодні?" },
      { label: "План логістики", text: "дай мені план по логістиці на день" },
      { label: "Що відвантажити?", text: "що сьогодні треба відвантажити?" },
      { label: "Ризики доставки", text: "які ризики по доставці?" },
    ];
  }

  if (isManager || input.canManageQueue) {
    return [
      { label: "Що робити?", text: "що мені робити сьогодні?" },
      { label: "План на день", text: "дай мені план на день" },
      { label: "Клієнти зависли", text: "мої клієнти зависли?" },
      { label: "Кому написати?", text: "кому мені сьогодні написати?" },
    ];
  }

  return [
    { label: "Що робити?", text: "що мені робити сьогодні?" },
    { label: "План на день", text: "дай мені план на день" },
    { label: "Моя роль", text: "що я можу тут робити?" },
  ];
}

function inferComposerMode(input: {
  composerValue: string;
  hasAttachments: boolean;
  routeLabel: string;
  domainHint: ToShoAiRouteContext["domainHint"];
}): ToShoAiMode {
  const normalized = input.composerValue.trim().toLowerCase();
  if (!normalized && input.hasAttachments) return "fix";
  if (/не працю|злам|помилк|error|bug|не зберіга|не відкрива|збій/u.test(normalized)) return "fix";
  if (/передай|ескал|закинь|перекинь|кому треба|в роботу/u.test(normalized)) return "route";
  if (/дотис|доведи|що далі|план|хто відповідальний|підсум/u.test(normalized)) return "resolve";
  if (input.domainHint === "design" && /бриф|дизайн|макет|правк/u.test(normalized)) return "route";
  if (/як|де|що це|поясни|покажи|розкажи/u.test(normalized)) return "ask";
  if (input.routeLabel === "Огляд" && !normalized) return "ask";
  return "ask";
}

function toDraft(item?: ToShoAiKnowledgeItem | null): KnowledgeDraft {
  if (!item) return EMPTY_DRAFT;
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    summary: item.summary ?? "",
    body: item.body,
    tags: item.tags.join(", "),
    keywords: item.keywords.join(", "),
    sourceLabel: item.sourceLabel ?? "",
    sourceHref: item.sourceHref ?? "",
    status: item.status,
  };
}

export function ToShoAiWordmark() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E6007E]/12 text-[#E6007E] ring-1 ring-[#E6007E]/18">
        <svg
          viewBox="0 0 33 33"
          className="h-[18px] w-[18px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M13.9446 6.46076C14.2193 5.34828 15.8008 5.34828 16.0754 6.46076C17.2477 11.2094 20.9555 14.9171 25.7041 16.0893C26.8167 16.3639 26.8167 17.9455 25.7041 18.2201C20.9555 19.3924 17.2477 23.1 16.0754 27.8487C15.8008 28.9611 14.2193 28.9611 13.9446 27.8487C12.7723 23.1 9.06455 19.3924 4.31589 18.2201C3.20337 17.9455 3.20337 16.3639 4.31589 16.0893C9.06455 14.9171 12.7723 11.2094 13.9446 6.46076Z"
            fill="currentColor"
          />
          <path
            d="M25.6579 1.74675C25.7691 1.29646 26.4092 1.29646 26.5204 1.74675C26.9949 3.66882 28.4957 5.16953 30.4177 5.64401C30.868 5.75518 30.868 6.39533 30.4177 6.50649C28.4957 6.98097 26.9949 8.48169 26.5204 10.4038C26.4092 10.854 25.7691 10.854 25.6579 10.4038C25.1834 8.48169 23.6827 6.98097 21.7606 6.50649C21.3103 6.39533 21.3103 5.75518 21.7606 5.64401C23.6827 5.16953 25.1834 3.66882 25.6579 1.74675Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <span className="text-[18px] font-semibold tracking-[-0.03em] text-[#E6007E] md:text-[20px]">ToSho AI</span>
    </div>
  );
}

function ThreadCard({
  item,
  active,
  onSelect,
}: {
  item: ToShoAiRequestSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-[22px] border px-4 py-4 text-left transition-colors",
        active
          ? "border-foreground/20 bg-foreground/5 text-foreground shadow-[var(--shadow-elevated-sm)]"
          : "border-border/60 bg-card/60 text-foreground hover:bg-muted/35"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="truncate text-[15px] font-semibold leading-5">{item.title}</div>
          {item.summary ? (
            <div className="line-clamp-2 text-sm leading-5 text-muted-foreground">{item.summary}</div>
          ) : null}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{item.routeLabel || "Без контексту сторінки"}</span>
        <span>•</span>
        <span>{formatDateTime(item.updatedAt)}</span>
      </div>
    </button>
  );
}

function AnalyticsResultTable({ analytics }: { analytics: AnalyticsPayload }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-border/65 bg-background/55">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/55 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {analytics.kind === "entity" ? (
            <EntityAvatar
              src={analytics.avatarUrl ?? null}
              name={analytics.title}
              size={34}
              className="ring-1 ring-border/60"
              fallbackClassName="text-[11px] font-semibold"
            />
          ) : null}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{analytics.title}</div>
            {analytics.caption ? <div className="mt-0.5 text-xs text-muted-foreground">{analytics.caption}</div> : null}
          </div>
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {analytics.metricLabel}
        </div>
      </div>

      {analytics.rows.length > 0 ? (
        <div className="divide-y divide-border/45">
          {analytics.rows.map((row) => {
            const displayLabel = analytics.kind === "people" ? formatShortDisplayName(row.label) : row.label;
            const secondaryIsBadgeDuplicate =
              Boolean(row.secondary) &&
              Boolean(row.badges?.length) &&
              row.badges!.every((badge) => row.secondary?.includes(badge.label));
            const RowIcon = getAnalyticsRowIcon(row.label, analytics.metricLabel);
            return (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  {analytics.kind === "people" ? (
                    <PlayerAvatar
                      src={row.avatarUrl ?? null}
                      name={displayLabel}
                      size={34}
                      className="mt-0.5 shrink-0 ring-1 ring-border/60"
                      fallbackClassName="text-[11px] font-semibold"
                    />
                  ) : row.avatarUrl ? (
                    <EntityAvatar
                      src={row.avatarUrl}
                      name={displayLabel}
                      size={34}
                      className="mt-0.5 ring-1 ring-border/60"
                      fallbackClassName="text-[11px] font-semibold"
                    />
                  ) : (
                    <div className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-muted-foreground">
                      <RowIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{displayLabel}</div>
                    {row.secondary && !secondaryIsBadgeDuplicate ? (
                      <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.secondary}</div>
                    ) : null}
                    {row.badges && row.badges.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.badges.map((badge) => {
                          const BadgeIcon = getAnalyticsBadgeIcon(badge.label);
                          return (
                            <span
                              key={`${row.id}:${badge.label}`}
                              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 text-[11px] font-medium text-primary"
                            >
                              {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5" /> : null}
                              <span>{badge.label}</span>
                              <span className="font-semibold">{badge.value}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-foreground">{row.primary}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3.5 py-5 text-sm text-muted-foreground">Немає рядків для цього підрахунку.</div>
      )}

      {analytics.note ? (
        <div className="border-t border-border/45 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
          {analytics.note}
        </div>
      ) : null}
    </div>
  );
}

function buildMagicThinkingSteps(message: string) {
  const normalized = normalizeSearch(message);
  if (/(лого|логотип|logo|бренд|аватар)/u.test(normalized)) {
    return ["Сканую замовників", "Звіряю logo_url", "Готую список"];
  }
  if (/(дизайнер|дизайн|таск|задач)/u.test(normalized)) {
    return ["Читаю дизайн-задачі", "Групую виконавців", "Збираю рейтинг"];
  }
  if (/(backup|бекап|сховище|storage|observability|runtime|баг)/u.test(normalized)) {
    return ["Читаю observability", "Звіряю backup", "Підсвічую ризики"];
  }
  if (/(прорах|quote|замовник|клієнт|лід|менеджер)/u.test(normalized)) {
    return ["Збираю CRM-зріз", "Перевіряю записи", "Форматую таблицю"];
  }
  return ["Збираю контекст", "Перевіряю CRM", "Форматую відповідь"];
}

function MagicThinkingCard({ message }: { message: string }) {
  const steps = buildMagicThinkingSteps(message);

  return (
    <div className="flex w-full min-w-0 justify-start overflow-hidden px-0.5">
      <div className="max-w-[calc(100%-0.25rem)] min-w-0 space-y-2 sm:max-w-[88%]">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6007E]/18 bg-[#E6007E]/10 text-[#E6007E]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-foreground/80">ToSho AI</span>
            <span className="shrink-0">збирає відповідь</span>
          </div>
        </div>
        <div className="tosho-ai-magic-card rounded-[24px] border px-3.5 py-3 shadow-[var(--shadow-elevated-sm)] sm:rounded-[28px] sm:px-4 sm:py-3.5">
          <div className="tosho-ai-magic-scan" aria-hidden="true" />
          <div className="relative flex items-start gap-3">
            <div className="tosho-ai-magic-pulse mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E6007E]/22 bg-[#E6007E]/10 text-[#E6007E]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">Шукаю корисне в CRM</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Не просто чекаю відповідь, а збираю потрібні дані і перевіряю контекст.
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className="tosho-ai-magic-step rounded-full border border-border/55 bg-background/55 px-3 py-2 text-xs font-medium text-foreground/85"
                    style={{ animationDelay: `${index * 220}ms` }}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChatSuggestions({
  groups,
  onSelect,
}: {
  groups: PromptSuggestionGroup[];
  onSelect: (value: string) => void;
}) {
  const [activeGroupId, setActiveGroupId] = useState<PromptSuggestionGroup["id"] | null>(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const toneClass: Record<PromptSuggestionGroup["tone"], { idle: string; active: string }> = {
    design: {
      idle: "border-violet-500/25 bg-violet-500/10 text-violet-600 hover:bg-violet-500/14 dark:text-violet-300",
      active: "border-violet-500/35 bg-violet-500/18 text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-200",
    },
    orders: {
      idle: "border-info-soft-border bg-info-soft text-info-foreground hover:bg-info-soft/80",
      active: "border-info-soft-border bg-info-soft/90 text-info-foreground ring-1 ring-info-soft-border",
    },
    customers: {
      idle: "border-success-soft-border bg-success-soft text-success-foreground hover:bg-success-soft/80",
      active: "border-success-soft-border bg-success-soft/90 text-success-foreground ring-1 ring-success-soft-border",
    },
    team: {
      idle: "border-warning-soft-border bg-warning-soft text-warning-foreground hover:bg-warning-soft/80",
      active: "border-warning-soft-border bg-warning-soft/90 text-warning-foreground ring-1 ring-warning-soft-border",
    },
    general: {
      idle: "border-border/60 bg-card/70 text-foreground hover:bg-muted/35",
      active: "border-foreground/18 bg-foreground/8 text-foreground ring-1 ring-foreground/10",
    },
  };

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[26px] border border-border/60 bg-card/72 p-4 shadow-[var(--shadow-elevated-sm)]">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E6007E]/18 bg-[#E6007E]/10 text-[#E6007E]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Можна спитати</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Обери тему, а питання підставлю в поле.</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          const styles = toneClass[group.tone];
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(isActive ? null : group.id)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 py-2 text-left text-sm font-semibold transition-colors",
                isActive ? styles.active : styles.idle
              )}
            >
              {group.label}
            </button>
          );
        })}
      </div>
      {activeGroup ? (
        <div className="mt-3 rounded-[20px] border border-border/50 bg-background/45 p-3">
          <div className="text-xs leading-5 text-muted-foreground">{activeGroup.description}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeGroup.prompts.map((suggestion) => (
              <button
                key={`${activeGroup.id}:${suggestion.label}:${suggestion.text}`}
                type="button"
                onClick={() => onSelect(suggestion.text)}
                className={
                  "inline-flex min-h-8 items-center rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/35"
                }
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonalQuickPrompts({
  prompts,
  disabled,
  onSelect,
}: {
  prompts: PersonalPromptSuggestion[];
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  if (prompts.length === 0) return null;

  return (
    <div className="flex max-w-full gap-2 overflow-x-auto px-0 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {prompts.map((prompt) => (
        <button
          key={`${prompt.label}:${prompt.text}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt.text)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:px-3.5 sm:text-sm",
            "border-border/70 bg-muted/35 text-foreground/85 hover:bg-muted/55"
          )}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

function MessageCard({
  message,
  onFeedback,
  onSelectAction,
  showDiagnostics,
}: {
  message: ToShoAiMessage;
  onFeedback: (messageId: string, value: "helpful" | "not_helpful") => void;
  onSelectAction: (value: string) => void;
  showDiagnostics: boolean;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const displayBody = isAssistant ? formatAssistantMessageBody(message.body) : message.body;
  const analytics = isAssistant ? readAnalyticsPayload(message.metadata) : null;
  const suggestedActions = isAssistant ? readSuggestedActions(message.metadata) : [];
  const diagnostics = isAssistant && showDiagnostics ? readAiDiagnostics(message.metadata) : null;

  return (
    <div className={cn("flex w-full min-w-0 overflow-hidden px-0.5", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[calc(100%-0.25rem)] min-w-0 space-y-2 sm:max-w-[88%]", isUser && "items-end")}>
        <div className={cn("flex min-w-0 items-center gap-2 text-xs text-muted-foreground", isUser ? "justify-end" : "justify-start")}>
          {!isUser ? (
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
                isAssistant
                  ? "border-[#E6007E]/18 bg-[#E6007E]/10 text-[#E6007E]"
                  : "border-border/60 bg-background/80 text-foreground"
              )}
            >
              {isAssistant ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </div>
          ) : null}
          <div className={cn("flex min-w-0 items-center gap-2", isUser && "flex-row-reverse")}>
            <span className="truncate font-medium text-foreground/80">
              {message.actorLabel || (isAssistant ? "ToSho AI" : "Користувач")}
            </span>
            <span className="shrink-0">{formatDateTime(message.createdAt)}</span>
          </div>
        </div>
        <div
          className={cn(
            "rounded-[24px] border px-3.5 py-3 text-[15px] shadow-[var(--shadow-elevated-sm)] sm:rounded-[28px] sm:px-4 sm:py-3.5",
            isUser
              ? "border-[#E6007E]/18 bg-[#E6007E]/12"
              : "border-border/60 bg-card/88"
          )}
        >
          <div className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground [overflow-wrap:anywhere]">{displayBody}</div>

          {analytics ? <AnalyticsResultTable analytics={analytics} /> : null}

          {message.attachments.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Вкладення</div>
              <div className="grid gap-2">
                {message.attachments.map((attachment) => (
                  <a
                    key={`${message.id}:${attachment.id}`}
                    href={attachment.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3 transition-colors hover:bg-muted/25"
                  >
                    <div className="flex items-start gap-3">
                      {isPreviewableAttachment(attachment) ? (
                        <img
                          src={attachment.url ?? undefined}
                          alt={attachment.fileName}
                          className="h-14 w-14 rounded-xl border border-border/50 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-muted-foreground">
                          {attachment.mimeType?.startsWith("image/") ? (
                            <ImageIcon className="h-5 w-5" />
                          ) : (
                            <FileText className="h-5 w-5" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{attachment.fileName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[attachment.mimeType || "file", formatBytes(attachment.fileSize)].filter(Boolean).join(" • ")}
                        </div>
                      </div>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {message.sources.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Джерела</div>
              <div className="grid gap-2">
                {message.sources.map((source) => (
                  <div
                    key={`${message.id}:${source.id}`}
                    className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3"
                  >
                    <div className="text-sm font-medium text-foreground">{source.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{source.sourceLabel || "Внутрішня база знань"}</span>
                      {source.sourceHref ? (
                        <a
                          href={source.sourceHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-foreground hover:underline"
                        >
                          Джерело
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {suggestedActions.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestedActions.map((action) => (
                <button
                  key={`${message.id}:${action.label}:${action.text}`}
                  type="button"
                  onClick={() => onSelectAction(action.text)}
                  className="inline-flex min-h-8 items-center rounded-full border border-border/65 bg-background/65 px-3 py-1.5 text-left text-xs font-semibold text-foreground/85 transition-colors hover:bg-muted/45"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          {diagnostics ? (
            <details className="mt-4 rounded-2xl border border-border/60 bg-background/65 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-semibold text-foreground/75">AI debug</summary>
              <div className="mt-2 grid gap-2">
                {diagnostics.openAi ? (
                  <div>
                    <div className="font-semibold text-foreground/75">OpenAI</div>
                    <div className="mt-1">
                      {[
                        diagnostics.openAi.model,
                        diagnostics.openAi.ok ? "ok" : "fallback",
                        diagnostics.openAi.latencyMs !== null ? `${diagnostics.openAi.latencyMs} ms` : null,
                        diagnostics.openAi.inputTokens !== null && diagnostics.openAi.outputTokens !== null
                          ? `${diagnostics.openAi.inputTokens} in / ${diagnostics.openAi.outputTokens} out`
                          : null,
                        diagnostics.openAi.totalTokens !== null ? `${diagnostics.openAi.totalTokens} tokens` : null,
                        diagnostics.openAi.imageInputs ? `${diagnostics.openAi.imageInputs} images` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {diagnostics.openAi.error ? <div className="mt-1 text-danger-foreground">{diagnostics.openAi.error}</div> : null}
                    {diagnostics.openAi.responseId ? <div className="mt-1 truncate">response: {diagnostics.openAi.responseId}</div> : null}
                  </div>
                ) : null}
                {diagnostics.retrieval ? (
                  <div>
                    <div className="font-semibold text-foreground/75">Knowledge retrieval</div>
                    <div className="mt-1">
                      {[
                        diagnostics.retrieval.strategy,
                        diagnostics.retrieval.model,
                        diagnostics.retrieval.latencyMs !== null ? `${diagnostics.retrieval.latencyMs} ms` : null,
                        diagnostics.retrieval.selectedCount !== null
                          ? `${diagnostics.retrieval.selectedCount}/${diagnostics.retrieval.candidateCount ?? 0} selected`
                          : null,
                        diagnostics.retrieval.persistedCount !== null ? `${diagnostics.retrieval.persistedCount} persisted` : null,
                        diagnostics.retrieval.refreshedCount ? `${diagnostics.retrieval.refreshedCount} refreshed` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {diagnostics.retrieval.error ? <div className="mt-1 text-warning-foreground">{diagnostics.retrieval.error}</div> : null}
                  </div>
                ) : null}
                {diagnostics.tools ? (
                  <div>
                    <div className="font-semibold text-foreground/75">CRM tools</div>
                    <div className="mt-1">
                      {[
                        diagnostics.tools.requested.length ? `requested: ${diagnostics.tools.requested.join(", ")}` : "no tool",
                        diagnostics.tools.executed.length ? `executed: ${diagnostics.tools.executed.join(", ")}` : null,
                        diagnostics.tools.latencyMs !== null ? `${diagnostics.tools.latencyMs} ms` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {diagnostics.tools.error ? <div className="mt-1 text-warning-foreground">{diagnostics.tools.error}</div> : null}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>

        {isAssistant ? (
          <div className="flex items-center justify-start gap-2 pl-4">
            <button
              type="button"
              className="tosho-ai-feedback-control tosho-ai-feedback-control--helpful"
              data-state={message.feedback === "helpful" ? "active" : "inactive"}
              aria-label="Допомогло"
              title="Допомогло"
              onClick={() => onFeedback(message.id, "helpful")}
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="tosho-ai-feedback-control tosho-ai-feedback-control--not-helpful"
              data-state={message.feedback === "not_helpful" ? "active" : "inactive"}
              aria-label="Не допомогло"
              title="Не допомогло"
              onClick={() => onFeedback(message.id, "not_helpful")}
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ToShoAiConsole({
  active = true,
  surface = "page",
  initialContext,
  initialRequestId = null,
}: ToShoAiConsoleProps) {
  const compact = surface === "sheet";
  const { teamId, userId, jobRole, permissions } = useAuth();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const historyLoadedRef = useRef(false);
  const knowledgeLoadedRef = useRef(false);
  const historyLoadingRef = useRef(false);
  const knowledgeLoadingRef = useRef(false);
  const resolvedContext = useMemo(
    () => {
      const currentRouteContext =
        typeof window === "undefined"
          ? buildToShoAiRouteContext({ pathname: "/", title: "Поточна сторінка" })
          : buildToShoAiRouteContext({
              pathname: window.location.pathname,
              search: window.location.search,
              title: document.title || "Поточна сторінка",
            });

      return initialContext ?? readToShoAiLastContext() ?? currentRouteContext;
    },
    [initialContext]
  );

  const [snapshot, setSnapshot] = useState<ToShoAiSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [composerIntent, setComposerIntent] = useState<ToShoAiComposerIntent>("auto");
  const [composerValue, setComposerValue] = useState("");
  const [pendingMagicMessage, setPendingMagicMessage] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<ToShoAiMentionSuggestion[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const deferredQueueSearch = useDeferredValue(queueSearch);
  const [showRequestList, setShowRequestList] = useState(false);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [knowledgeLoaded, setKnowledgeLoaded] = useState(false);
  const [historyPanelLoading, setHistoryPanelLoading] = useState(false);
  const [knowledgePanelLoading, setKnowledgePanelLoading] = useState(false);
  const [knowledgeDialogOpen, setKnowledgeDialogOpen] = useState(false);
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>(EMPTY_DRAFT);
  const [expandedKnowledgeId, setExpandedKnowledgeId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isMobileComposer, setIsMobileComposer] = useState(false);

  const selectedThread = snapshot?.selectedThread ?? null;
  const queueSearchValue = normalizeSearch(deferredQueueSearch);
  const isAiUnavailable = !snapshot && Boolean(loadError);
  const canSendMessage = Boolean((composerValue.trim() || pendingAttachments.length > 0) && !isAiUnavailable);

  const threadItems = useMemo(() => snapshot?.recentRequests ?? [], [snapshot?.recentRequests]);

  const filteredThreads = useMemo(() => {
    if (!queueSearchValue) return threadItems;
    return threadItems.filter((item) => {
      const haystack = normalizeSearch(
        `${item.title} ${item.summary ?? ""} ${item.routeLabel ?? ""}`
      );
      return haystack.includes(queueSearchValue);
    });
  }, [queueSearchValue, threadItems]);

  const promptSuggestionGroups = useMemo(
    () =>
      buildPromptSuggestionGroups({
        jobRole,
        canManageQueue: snapshot?.permissions.canManageQueue ?? permissions.canManageMembers,
        domainHint: resolvedContext.domainHint,
      }),
    [jobRole, permissions.canManageMembers, resolvedContext.domainHint, snapshot?.permissions.canManageQueue]
  );

  const personalPromptSuggestions = useMemo(
    () =>
      buildPersonalPromptSuggestions({
        jobRole,
        canManageQueue: snapshot?.permissions.canManageQueue ?? permissions.canManageMembers,
        isSuperAdmin: permissions.isSuperAdmin,
        isAdmin: permissions.isAdmin,
        isSeo: permissions.isSeo,
        domainHint: resolvedContext.domainHint,
      }),
    [
      jobRole,
      permissions.canManageMembers,
      permissions.isAdmin,
      permissions.isSeo,
      permissions.isSuperAdmin,
      resolvedContext.domainHint,
      snapshot?.permissions.canManageQueue,
    ]
  );

  useEffect(() => {
    historyLoadedRef.current = historyLoaded;
  }, [historyLoaded]);

  useEffect(() => {
    knowledgeLoadedRef.current = knowledgeLoaded;
  }, [knowledgeLoaded]);

  const loadSnapshot = useCallback(
    async (
      requestId: string | null = null,
      options: { includeHistory?: boolean; includeKnowledge?: boolean } = {}
    ) => {
      if (!active) return;
      const includeHistory = options.includeHistory ?? historyLoadedRef.current;
      const includeKnowledge = options.includeKnowledge ?? knowledgeLoadedRef.current;
      setLoading(true);
      try {
        setLoadError(null);
        const response = await callToShoAiApi("bootstrap", {
          requestId,
          routeContext: resolvedContext,
          includeHistory,
          includeKnowledge,
        });
        if (includeHistory) {
          historyLoadedRef.current = true;
          setHistoryLoaded(true);
        }
        if (includeKnowledge) {
          knowledgeLoadedRef.current = true;
          setKnowledgeLoaded(true);
        }
        setSnapshot(response.snapshot);
        setSelectedThreadId(response.snapshot.selectedThread?.id ?? null);
      } catch (error) {
        if (includeHistory) {
          historyLoadedRef.current = false;
          setHistoryLoaded(false);
        }
        if (includeKnowledge) {
          knowledgeLoadedRef.current = false;
          setKnowledgeLoaded(false);
        }
        const message = error instanceof Error ? error.message : "Не вдалося завантажити ToSho AI.";
        setLoadError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [active, resolvedContext]
  );

  useEffect(() => {
    if (!active) return;
    historyLoadedRef.current = false;
    knowledgeLoadedRef.current = false;
    historyLoadingRef.current = false;
    knowledgeLoadingRef.current = false;
    setHistoryLoaded(false);
    setKnowledgeLoaded(false);
    setHistoryPanelLoading(false);
    setKnowledgePanelLoading(false);
    setShowRequestList(false);
    setKnowledgeExpanded(false);
    setSelectedThreadId(initialRequestId ?? null);
    setSnapshot((prev) => (prev?.selectedThread ? { ...prev, selectedThread: null } : prev));
    void loadSnapshot(initialRequestId ?? null, { includeHistory: false, includeKnowledge: false });
  }, [active, initialRequestId, loadSnapshot, resolvedContext.href]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const syncMobileComposer = () => setIsMobileComposer(mediaQuery.matches);
    syncMobileComposer();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMobileComposer);
      return () => mediaQuery.removeEventListener("change", syncMobileComposer);
    }
    mediaQuery.addListener(syncMobileComposer);
    return () => mediaQuery.removeListener(syncMobileComposer);
  }, []);

  useEffect(() => {
    if (selectedThread?.mode) {
      setComposerIntent(selectedThread.mode);
    }
  }, [selectedThread?.id, selectedThread?.mode]);

  const applySnapshotResponse = useCallback((response: ToShoAiApiResponse) => {
    setSnapshot(response.snapshot);
    setSelectedThreadId(response.snapshot.selectedThread?.id ?? null);
  }, []);

  const ensureHistoryLoaded = useCallback(
    (requestId: string | null = selectedThreadId) => {
      if (historyLoadedRef.current || historyLoadingRef.current) return;
      historyLoadingRef.current = true;
      setHistoryPanelLoading(true);
      void loadSnapshot(requestId, {
        includeHistory: true,
        includeKnowledge: knowledgeLoadedRef.current,
      }).finally(() => {
        historyLoadingRef.current = false;
        setHistoryPanelLoading(false);
      });
    },
    [loadSnapshot, selectedThreadId]
  );

  const ensureKnowledgeLoaded = useCallback(
    (requestId: string | null = selectedThreadId) => {
      if (knowledgeLoadedRef.current || knowledgeLoadingRef.current) return;
      knowledgeLoadingRef.current = true;
      setKnowledgePanelLoading(true);
      void loadSnapshot(requestId, {
        includeHistory: historyLoadedRef.current,
        includeKnowledge: true,
      }).finally(() => {
        knowledgeLoadingRef.current = false;
        setKnowledgePanelLoading(false);
      });
    },
    [loadSnapshot, selectedThreadId]
  );

  const handleToggleRequestList = useCallback(() => {
    const next = !showRequestList;
    setShowRequestList(next);
    setKnowledgeExpanded(false);
    if (next) ensureHistoryLoaded(selectedThreadId);
  }, [ensureHistoryLoaded, selectedThreadId, showRequestList]);

  const handleToggleKnowledge = useCallback(() => {
    const next = !knowledgeExpanded;
    setKnowledgeExpanded(next);
    setShowRequestList(false);
    if (next) ensureKnowledgeLoaded(selectedThreadId);
  }, [ensureKnowledgeLoaded, knowledgeExpanded, selectedThreadId]);

  const handleSelectThread = useCallback(
    (requestId: string) => {
      startTransition(() => {
        setSelectedThreadId(requestId);
      });
      void loadSnapshot(requestId, {
        includeHistory: true,
        includeKnowledge: knowledgeLoadedRef.current,
      });
    },
    [loadSnapshot]
  );

  const handleStartNewThread = useCallback(() => {
    startTransition(() => {
      setSelectedThreadId(null);
    });
    setSnapshot((prev) => (prev?.selectedThread ? { ...prev, selectedThread: null } : prev));
    setComposerIntent("auto");
  }, []);

  const syncActiveMention = useCallback((value: string, cursorPosition?: number | null) => {
    setActiveMention(getActiveMention(value, cursorPosition));
  }, []);

  const handleComposerChange = useCallback(
    (event: ReactChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setComposerValue(nextValue);
      syncActiveMention(nextValue, event.target.selectionStart);
    },
    [syncActiveMention]
  );

  const handleComposerCursorActivity = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    syncActiveMention(textarea.value, textarea.selectionStart);
  }, [syncActiveMention]);

  useEffect(() => {
    if (!activeMention) {
      setMentionSuggestions([]);
      setMentionLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setMentionLoading(true);
      callToShoAiMentionSuggestions({
        query: activeMention.query,
        kind: activeMention.kind,
        routeContext: resolvedContext,
      })
        .then((response) => {
          if (!cancelled) setMentionSuggestions(response.suggestions);
        })
        .catch(() => {
          if (!cancelled) setMentionSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setMentionLoading(false);
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeMention, resolvedContext]);

  const handleSelectMentionSuggestion = useCallback(
    (suggestion: ToShoAiMentionSuggestion) => {
      if (!activeMention) return;
      const nextValue = `${composerValue.slice(0, activeMention.start)}${suggestion.insertText}${composerValue.slice(activeMention.end)}`;
      const nextCursor = activeMention.start + suggestion.insertText.length;
      setComposerValue(nextValue);
      setActiveMention(null);
      setMentionSuggestions([]);
      window.requestAnimationFrame(() => {
        composerInputRef.current?.focus();
        composerInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [activeMention, composerValue]
  );

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 220);
    const minHeight = compact && typeof window !== "undefined" && window.innerWidth < 640 ? 44 : 48;
    textarea.style.height = `${Math.max(minHeight, nextHeight)}px`;
  }, [composerValue, compact]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedThread?.id, selectedThread?.messages.length, actionBusy]);

  const handleRemovePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((prev) => {
      const next = prev.filter((attachment) => {
        const shouldKeep = attachment.id !== attachmentId;
        if (!shouldKeep && attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
        return shouldKeep;
      });
      return next;
    });
  }, []);

  const handlePickAttachments = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    setPendingAttachments((prev) => {
      const remainingSlots = Math.max(0, MAX_SUPPORT_ATTACHMENTS - prev.length);
      if (remainingSlots === 0) {
        toast.error(`Можна прикріпити не більше ${MAX_SUPPORT_ATTACHMENTS} файлів.`);
        return prev;
      }

      const selected = Array.from(files).slice(0, remainingSlots);
      const oversized = selected.filter((file) => file.size > MAX_SUPPORT_ATTACHMENT_SIZE_BYTES);
      const allowed = selected.filter((file) => file.size <= MAX_SUPPORT_ATTACHMENT_SIZE_BYTES);

      if (oversized.length > 0) {
        toast.error("Деякі файли завеликі. Максимум 50 MB на файл.");
      }

      const additions = allowed.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));

      return [...prev, ...additions];
    });

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, []);

  const uploadPendingAttachments = useCallback(async () => {
    if (pendingAttachments.length === 0) return { attachments: [], uploaded: [] as Array<{ bucket: string; path: string }> };
    if (!teamId || !userId) {
      throw new Error("Немає team/user context для завантаження вкладень.");
    }

    const uploaded: Array<{ bucket: string; path: string }> = [];
    try {
      const attachments = [];
      for (const pending of pendingAttachments) {
        const safeName = pending.file.name.replace(/[^\w.-]+/g, "_");
        const storagePath = `teams/${teamId}/support-attachments/${userId}/${Date.now()}-${pending.id}-${safeName}`;
        const uploadResult = await uploadAttachmentWithVariants({
          bucket: SUPPORT_ATTACHMENT_BUCKET,
          storagePath,
          file: pending.file,
          cacheControl: "31536000, immutable",
        });

        uploaded.push({ bucket: SUPPORT_ATTACHMENT_BUCKET, path: uploadResult.storagePath });
        attachments.push({
          id: pending.id,
          fileName: pending.file.name,
          mimeType: uploadResult.contentType || pending.file.type || null,
          fileSize: uploadResult.size || pending.file.size,
          storageBucket: SUPPORT_ATTACHMENT_BUCKET,
          storagePath: uploadResult.storagePath,
        });
      }

      return { attachments, uploaded };
    } catch (error) {
      await Promise.all(
        uploaded.map((item) =>
          removeAttachmentWithVariants(item.bucket, item.path).catch(() => undefined)
        )
      );
      throw error;
    }
  }, [pendingAttachments, teamId, userId]);

  const handleSend = useCallback(async (messageOverride?: string, forceAutoMode = false) => {
    if (actionBusy === "send") return;
    const outgoingMessage = messageOverride ?? composerValue;
    if (!outgoingMessage.trim() && pendingAttachments.length === 0) {
      toast.error("Напиши запит або прикріпи файл для ToSho AI.");
      return;
    }

    setActionBusy("send");
    setPendingMagicMessage(outgoingMessage);
    let uploadedStorageFiles: Array<{ bucket: string; path: string }> = [];
    try {
      const uploaded = await uploadPendingAttachments();
      uploadedStorageFiles = uploaded.uploaded;
      const outgoingMode =
        forceAutoMode || composerIntent === "auto"
          ? inferComposerMode({
              composerValue: outgoingMessage,
              hasAttachments: pendingAttachments.length > 0,
              routeLabel: resolvedContext.routeLabel,
              domainHint: resolvedContext.domainHint,
            })
          : composerIntent;
      const response = await callToShoAiApi("send", {
        requestId: selectedThread?.id ?? selectedThreadId,
        message: outgoingMessage,
        mode: outgoingMode,
        routeContext: resolvedContext,
        attachments: uploaded.attachments,
        includeHistory: historyLoadedRef.current,
        includeKnowledge: knowledgeLoadedRef.current,
      });
      applySnapshotResponse(response);
      setComposerValue("");
      setActiveMention(null);
      setMentionSuggestions([]);
      setPendingAttachments((prev) => {
        prev.forEach((attachment) => {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });
        return [];
      });
      const description =
        response.meta?.info ||
        (response.meta?.requestCreated
          ? "Запит зафіксовано і зібрано в окремий тред."
          : "ToSho AI оновив тред і дотиснув контекст.");
      toast.success("ToSho AI відпрацював", { description });
    } catch (error) {
      if (uploadedStorageFiles.length > 0) {
        await Promise.all(
          uploadedStorageFiles.map((item) =>
            removeAttachmentWithVariants(item.bucket, item.path).catch(() => undefined)
          )
        );
      }
      toast.error(error instanceof Error ? error.message : "Не вдалося відправити запит.");
    } finally {
      setActionBusy(null);
      setPendingMagicMessage("");
    }
  }, [
    actionBusy,
    applySnapshotResponse,
    composerIntent,
    composerValue,
    pendingAttachments.length,
    resolvedContext,
    selectedThread?.id,
    selectedThreadId,
    uploadPendingAttachments,
  ]);

  const handleSelectPromptSuggestion = useCallback(
    (value: string) => {
      setComposerIntent("auto");
      setComposerValue(value);
      composerInputRef.current?.focus();
      window.requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        textarea?.focus();
        const mentionMatch = /@(?:замовник|клієнт|лід|менеджер|дизайнер|співробітник|користувач):/iu.exec(value);
        if (mentionMatch && textarea) {
          const cursor = mentionMatch.index + mentionMatch[0].length;
          textarea.setSelectionRange(cursor, cursor);
          syncActiveMention(value, cursor);
          return;
        }
        textarea?.setSelectionRange(value.length, value.length);
        syncActiveMention(value, value.length);
      });
    },
    [syncActiveMention]
  );

  const handleSelectPersonalPrompt = useCallback(
    (value: string) => {
      setComposerIntent("auto");
      setComposerValue("");
      setActiveMention(null);
      setMentionSuggestions([]);
      void handleSend(value, true);
    },
    [handleSend]
  );

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (actionBusy === "send") return;
      void handleSend();
    },
    [actionBusy, handleSend]
  );

  const handleFeedback = useCallback(
    async (messageId: string, value: "helpful" | "not_helpful") => {
      if (!selectedThread) return;
      const previousSnapshot = snapshot;
      setSnapshot((prev) => {
        if (!prev?.selectedThread || prev.selectedThread.id !== selectedThread.id) return prev;
        return {
          ...prev,
          selectedThread: {
            ...prev.selectedThread,
            messages: prev.selectedThread.messages.map((message) =>
              message.id === messageId ? { ...message, feedback: value } : message
            ),
          },
        };
      });
      try {
        const response = await callToShoAiApi("feedback", {
          requestId: selectedThread.id,
          messageId,
          feedback: value,
          routeContext: resolvedContext,
          includeHistory: historyLoadedRef.current,
          includeKnowledge: knowledgeLoadedRef.current,
        });
        applySnapshotResponse(response);
      } catch (error) {
        setSnapshot(previousSnapshot);
        toast.error(error instanceof Error ? error.message : "Не вдалося зберегти feedback.");
      }
    },
    [applySnapshotResponse, resolvedContext, selectedThread, snapshot]
  );

  const openKnowledgeDialog = useCallback((item?: ToShoAiKnowledgeItem | null) => {
    setKnowledgeDraft(toDraft(item));
    setKnowledgeDialogOpen(true);
  }, []);

  const handleSaveKnowledge = useCallback(async () => {
    setActionBusy("save-knowledge");
    try {
      const response = await callToShoAiApi("upsert_knowledge", {
        requestId: selectedThread?.id ?? null,
        routeContext: resolvedContext,
        includeHistory: historyLoadedRef.current,
        includeKnowledge: true,
        knowledge: {
          id: knowledgeDraft.id,
          title: knowledgeDraft.title,
          slug: knowledgeDraft.slug,
          summary: knowledgeDraft.summary,
          body: knowledgeDraft.body,
          tags: knowledgeDraft.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          keywords: knowledgeDraft.keywords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          status: knowledgeDraft.status,
          sourceLabel: knowledgeDraft.sourceLabel,
          sourceHref: knowledgeDraft.sourceHref,
        },
      });
      applySnapshotResponse(response);
      setKnowledgeDialogOpen(false);
      toast.success(knowledgeDraft.id ? "Картку знань оновлено." : "Нову картку знань створено.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти картку знань.");
    } finally {
      setActionBusy(null);
    }
  }, [applySnapshotResponse, knowledgeDraft, resolvedContext, selectedThread?.id]);

  const handleDeleteKnowledge = useCallback(
    async (item: ToShoAiKnowledgeItem) => {
      setActionBusy(`delete-knowledge:${item.id}`);
      try {
        const response = await callToShoAiApi("delete_knowledge", {
          requestId: selectedThread?.id ?? null,
          routeContext: resolvedContext,
          includeHistory: historyLoadedRef.current,
          includeKnowledge: true,
          knowledge: { id: item.id },
        });
        applySnapshotResponse(response);
        toast.success("Картку знань видалено.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не вдалося видалити картку.");
      } finally {
        setActionBusy(null);
      }
    },
    [applySnapshotResponse, resolvedContext, selectedThread?.id]
  );

  const intentMeta = composerIntent === "auto" ? AUTO_MODE_META : MODE_META[composerIntent];
  const composerPlaceholder = isMobileComposer ? "Напиши запит..." : intentMeta.placeholder;

  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="flex min-h-full w-full min-w-0 max-w-full flex-col gap-3 px-3 pb-3 pt-2 sm:gap-4 sm:px-4 sm:pb-4 sm:pt-3 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {selectedThread ? (
                <div className="flex min-w-0 items-center rounded-full border border-border/60 bg-card/55 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleStartNewThread}
                    className="h-8 rounded-full px-2.5 sm:px-3"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden min-[420px]:inline">Новий чат</span>
                    <span className="min-[420px]:hidden">Новий</span>
                  </Button>
                </div>
              ) : null}
              <div className="ml-auto flex min-w-0 items-center rounded-full border border-border/60 bg-card/55 p-1">
                <Button
                  type="button"
                  variant={showRequestList ? "secondary" : "ghost"}
                  size="sm"
                  onClick={handleToggleRequestList}
                  className="h-8 rounded-full px-2.5 sm:px-3"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden min-[380px]:inline">Історія</span>
                </Button>
                <Button
                  type="button"
                  variant={knowledgeExpanded ? "secondary" : "ghost"}
                  size="sm"
                  onClick={handleToggleKnowledge}
                  className="h-8 rounded-full px-2.5 sm:px-3"
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden min-[380px]:inline">Знання</span>
                </Button>
              </div>
            </div>

            {showRequestList ? (
              <div className="rounded-[26px] border border-border/60 bg-card/88 p-4 shadow-[var(--shadow-elevated-sm)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Попередні чати</div>
                    <div className="mt-1 text-sm text-muted-foreground">Тільки твої діалоги з ToSho AI.</div>
                  </div>
                  <Badge tone="neutral" size="sm" pill>
                    Мої чати
                  </Badge>
                </div>
                <Input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Пошук по чатах"
                  disabled={historyPanelLoading && !historyLoaded}
                  className="mt-3 rounded-2xl border-border/60 bg-background/70"
                />
                <div className="mt-3 space-y-3">
                  {historyPanelLoading && !historyLoaded ? (
                    <HistoryListSkeleton />
                  ) : filteredThreads.length > 0 ? (
                    filteredThreads.map((item) => (
                      <ThreadCard
                        key={item.id}
                        item={item}
                        active={selectedThread?.id === item.id}
                        onSelect={() => handleSelectThread(item.id)}
                      />
                    ))
                  ) : (
                    <EmptyPanel
                      icon={<MessageSquare className="h-5 w-5" />}
                      title={queueSearchValue ? "Нічого не знайдено" : "Поки тихо"}
                      description={
                        queueSearchValue
                          ? "Спробуй інший пошук."
                          : "Щойно з’явиться перший чат, він буде тут."
                      }
                    />
                  )}
                </div>
              </div>
            ) : null}

            {knowledgeExpanded ? (
              <div className="rounded-[26px] border border-border/60 bg-card/88 p-4 shadow-[var(--shadow-elevated-sm)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">База знань</div>
                    <div className="mt-1 text-sm text-muted-foreground">Що вже знає ToSho AI і звідки він це бере.</div>
                  </div>
                  <Badge tone="neutral" size="sm" pill>
                    {knowledgePanelLoading && !knowledgeLoaded
                      ? "Завантаження"
                      : `Активних: ${snapshot?.stats.knowledgeActiveCount ?? 0}`}
                  </Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {knowledgePanelLoading && !knowledgeLoaded ? (
                    <KnowledgeListSkeleton />
                  ) : (snapshot?.knowledgeItems ?? []).length > 0 ? (
                    (snapshot?.knowledgeItems ?? []).map((item) => (
                      <div key={item.id} className="rounded-[22px] border border-border/60 bg-background/65 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                tone={
                                  item.status === "active" ? "success" : item.status === "draft" ? "warning" : "neutral"
                                }
                                size="sm"
                                pill
                              >
                                {item.status === "active" ? "Активна" : item.status === "draft" ? "Чернетка" : "Архів"}
                              </Badge>
                              {item.tags.slice(0, 3).map((tag) => (
                                <Badge key={`${item.id}:${tag}`} tone="neutral" size="sm" pill>
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            <div className="text-[15px] font-semibold leading-5 text-foreground">{item.title}</div>
                            <div className="text-sm leading-6 text-muted-foreground">
                              {item.summary || item.body.slice(0, compact ? 120 : 190)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setExpandedKnowledgeId((prev) => (prev === item.id ? null : item.id))}
                            >
                              {expandedKnowledgeId === item.id ? "Сховати" : "Читати"}
                              <ChevronDown
                                className={cn("h-4 w-4 transition-transform", expandedKnowledgeId === item.id && "rotate-180")}
                              />
                            </Button>
                            {item.sourceHref ? (
                              <Button type="button" variant="outline" size="sm" asChild>
                                <a href={item.sourceHref} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {expandedKnowledgeId === item.id ? (
                          <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                            <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{item.body}</div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-xs text-muted-foreground">
                                {item.sourceLabel ? `Основа: ${item.sourceLabel}` : "Внутрішня база знань"}
                              </div>
                              {snapshot?.permissions.canManageKnowledge ? (
                                <div className="flex items-center gap-2">
                                  <Button type="button" variant="ghost" size="sm" onClick={() => openKnowledgeDialog(item)}>
                                    Редагувати
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={actionBusy === `delete-knowledge:${item.id}`}
                                    onClick={() => void handleDeleteKnowledge(item)}
                                  >
                                    Видалити
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <EmptyPanel
                      icon={<BookOpen className="h-5 w-5" />}
                      title="База знань поки порожня"
                      description="Додай перші картки по найчастіших питаннях команди, і ToSho AI почне відповідати сильніше."
                    />
                  )}
                </div>
              </div>
            ) : null}

            {!snapshot && !loading && loadError ? (
              <div className="rounded-[26px] border border-border/60 bg-card/70 p-4 shadow-[var(--shadow-elevated-sm)]">
                <EmptyPanel
                  icon={<Bot className="h-5 w-5" />}
                  title="ToSho AI тимчасово недоступний"
                  description={loadError}
                />
                <div className="mt-3 flex justify-center">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadSnapshot(selectedThreadId)}>
                    Спробувати ще раз
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4">
              {selectedThread ? (
                <div className="space-y-4">
                  <div className="space-y-4">
                    {selectedThread.messages.map((message) => (
                      <MessageCard
                        key={message.id}
                        message={message}
                        onFeedback={handleFeedback}
                        onSelectAction={handleSelectPromptSuggestion}
                        showDiagnostics={Boolean(snapshot?.permissions.canManageQueue || snapshot?.permissions.canManageKnowledge)}
                      />
                    ))}
                    {actionBusy === "send" ? <MagicThinkingCard message={pendingMagicMessage || composerValue} /> : null}
                    <div ref={chatBottomRef} />
                  </div>

                </div>
              ) : (
                <div className="space-y-4">
                  {!showRequestList && !knowledgeExpanded && !isAiUnavailable ? (
                    <EmptyChatSuggestions groups={promptSuggestionGroups} onSelect={handleSelectPromptSuggestion} />
                  ) : null}
                  {actionBusy === "send" ? <MagicThinkingCard message={pendingMagicMessage || composerValue} /> : null}
                  <div ref={chatBottomRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 bg-background/95 px-3 pb-[calc(max(1.25rem,env(safe-area-inset-bottom))+0.25rem)] pt-2.5 backdrop-blur sm:px-4 sm:pb-4 sm:pt-3 md:px-5">
          <div className="w-full min-w-0 max-w-full space-y-3 overflow-hidden px-0">
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => handlePickAttachments(event.target.files)}
            />

            {pendingAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-0 pt-1">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-full border border-border/60 bg-card/75 px-3 py-2"
                  >
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.file.name}
                        className="h-7 w-7 rounded-full border border-border/50 object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-muted/30 text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <span className="max-w-[180px] truncate text-sm text-foreground">{attachment.file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      onClick={() => handleRemovePendingAttachment(attachment.id)}
                      aria-label={`Прибрати ${attachment.file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {!isAiUnavailable ? (
              <PersonalQuickPrompts
                prompts={personalPromptSuggestions}
                disabled={actionBusy === "send"}
                onSelect={handleSelectPersonalPrompt}
              />
            ) : null}

            {activeMention ? (
              <MentionSuggestionPanel
                activeMention={activeMention}
                loading={mentionLoading}
                suggestions={mentionSuggestions}
                onSelect={handleSelectMentionSuggestion}
              />
            ) : null}

            <div className="flex min-w-0 max-w-full items-end gap-2 overflow-hidden px-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => attachmentInputRef.current?.click()}
                className="h-11 w-11 shrink-0 rounded-full p-0 sm:h-12 sm:w-12"
                aria-label="Прикріпити файл"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                ref={composerInputRef}
                value={composerValue}
                onChange={handleComposerChange}
                onKeyDown={handleComposerKeyDown}
                onKeyUp={handleComposerCursorActivity}
                onClick={handleComposerCursorActivity}
                onSelect={handleComposerCursorActivity}
                enterKeyHint="send"
                rows={1}
                placeholder={composerPlaceholder}
                className="h-11 max-h-[150px] min-h-[44px] w-0 min-w-0 max-w-full flex-[1_1_0%] resize-none overflow-x-hidden overflow-y-auto rounded-[22px] border-border/60 bg-card/88 px-3.5 py-2.5 text-base leading-6 shadow-inner [overflow-wrap:anywhere] sm:h-12 sm:max-h-[220px] sm:min-h-[48px] sm:rounded-[24px] sm:px-4 sm:py-3 sm:text-sm sm:leading-5"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSend()}
                disabled={actionBusy === "send" || !canSendMessage}
                className="h-11 w-11 shrink-0 rounded-full p-0 sm:h-12 sm:w-12"
                aria-label="Надіслати"
              >
                {actionBusy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>


      <Dialog open={knowledgeDialogOpen} onOpenChange={setKnowledgeDialogOpen}>
        <DialogContent className="max-w-[780px]">
          <DialogHeader>
            <DialogTitle>{knowledgeDraft.id ? "Редагувати картку знань" : "Нова картка знань"}</DialogTitle>
            <DialogDescription>
              Це curated source для ToSho AI. Чим чіткіша картка, тим менше фантазій у відповідях.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Назва</Label>
              <Input
                value={knowledgeDraft.title}
                onChange={(event) =>
                  setKnowledgeDraft((prev) => ({
                    ...prev,
                    title: event.target.value,
                    slug: prev.slug || event.target.value.toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={knowledgeDraft.slug}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, slug: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Короткий summary</Label>
              <Textarea
                rows={3}
                value={knowledgeDraft.summary}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Зміст</Label>
              <Textarea
                rows={10}
                value={knowledgeDraft.body}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, body: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Теги через кому</Label>
              <Input
                value={knowledgeDraft.tags}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, tags: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Keywords через кому</Label>
              <Input
                value={knowledgeDraft.keywords}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, keywords: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Source label</Label>
              <Input
                value={knowledgeDraft.sourceLabel}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, sourceLabel: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Source href</Label>
              <Input
                value={knowledgeDraft.sourceHref}
                onChange={(event) => setKnowledgeDraft((prev) => ({ ...prev, sourceHref: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <div className="flex flex-wrap gap-2">
                {(["active", "draft", "archived"] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={knowledgeDraft.status === status ? "primary" : "outline"}
                    onClick={() => setKnowledgeDraft((prev) => ({ ...prev, status }))}
                  >
                    {status === "active" ? "Активна" : status === "draft" ? "Чернетка" : "Архів"}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKnowledgeDialogOpen(false)}>
              Закрити
            </Button>
            <Button type="button" onClick={() => void handleSaveKnowledge()} disabled={actionBusy === "save-knowledge"}>
              {actionBusy === "save-knowledge" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-border/70 bg-background/45 px-4 py-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
        {icon}
      </div>
      <div className="mt-3 text-[15px] font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
    </div>
  );
}

function MentionSuggestionPanel({
  activeMention,
  suggestions,
  loading,
  onSelect,
}: {
  activeMention: ActiveMention;
  suggestions: ToShoAiMentionSuggestion[];
  loading: boolean;
  onSelect: (suggestion: ToShoAiMentionSuggestion) => void;
}) {
  const title = `Підставити ${getMentionKindLabel(activeMention.kind)}`;
  return (
    <div className="rounded-[20px] border border-border/60 bg-card/95 p-2 shadow-[var(--shadow-elevated-sm)]">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </div>
      <div className="max-h-[220px] space-y-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={`mention-loading:${index}`} className="flex items-center gap-2 rounded-2xl px-2 py-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
            </div>
          ))
        ) : suggestions.length > 0 ? (
          suggestions.map((suggestion) => {
            const isPerson = suggestion.kind === "manager" || suggestion.kind === "designer" || suggestion.kind === "employee";
            return (
              <button
                key={`${suggestion.kind}:${suggestion.id}`}
                type="button"
                onClick={() => onSelect(suggestion)}
                className="flex w-full min-w-0 items-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted/35"
              >
                {isPerson ? (
                  <PlayerAvatar
                    src={suggestion.avatarUrl}
                    name={suggestion.label}
                    size={32}
                    className="shrink-0 ring-1 ring-border/60"
                    fallbackClassName="text-[11px] font-semibold"
                  />
                ) : (
                  <EntityAvatar
                    src={suggestion.avatarUrl}
                    name={suggestion.label}
                    size={32}
                    className="shrink-0 ring-1 ring-border/60"
                    fallbackClassName="text-[11px] font-semibold"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{suggestion.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{suggestion.subtitle ?? "CRM"}</div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            Немає збігів. Допиши ще кілька символів.
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Завантаження історії">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`history-skeleton:${index}`}
          className="rounded-[22px] border border-border/60 bg-background/55 px-4 py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
              <Skeleton className="h-4 w-3/5 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-4/5 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Завантаження бази знань">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={`knowledge-skeleton:${index}`}
          className="rounded-[22px] border border-border/60 bg-background/55 px-4 py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
