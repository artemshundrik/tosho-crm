import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  BellRing,
  Cake,
  CalendarRange,
  MonitorSmartphone,
  PlaneTakeoff,
  PartyPopper,
  Settings2,
  ShieldAlert,
  Volume2,
  X as CloseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import {
  disableRealtimeForSession,
  enableRealtimeForSession,
  isRealtimeDisabledForSession,
  supabase,
} from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER, TOOLBAR_ACTION_BUTTON } from "@/components/ui/controlStyles";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notificationSound";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import {
  readInAppNotificationPreferences,
  writeInAppNotificationPreferences,
} from "@/lib/inAppNotificationPreferences";

type FilterMode = "all" | "unread";
type SoundDebugState = {
  level: "idle" | "success" | "error";
  message: string;
};

type NotificationsPageCache = {
  notifications: NotificationItem[];
};

type NotificationPartyAvatar = {
  id?: string | null;
  entityType?: "customer" | "lead" | null;
  name: string;
  logoUrl: string | null;
};

type NotificationQuoteAvatar = {
  quoteNumber: string;
  customerId: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
};

type NotificationDesignTaskAvatar = {
  taskId: string;
  quoteId: string | null;
  quoteNumber: string | null;
  customerId: string | null;
  customerType: "customer" | "lead" | null;
  customerName: string | null;
  customerLogoUrl: string | null;
};

const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

type SettingsTone = "active" | "muted" | "inactive";
type PreviewTone = "info" | "success" | "warning";

const IN_APP_NOTIFICATION_TOAST_MS = 6500;
const IN_APP_WARNING_NOTIFICATION_TOAST_MS = 9000;
const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;

function isDocumentVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function getInAppNotificationDuration(tone?: PreviewTone) {
  if (tone === "warning") return IN_APP_WARNING_NOTIFICATION_TOAST_MS;
  return IN_APP_NOTIFICATION_TOAST_MS;
}

function getInAppNotificationIcon(tone?: PreviewTone) {
  if (tone === "warning") return <ShieldAlert className="h-4 w-4 text-warning-foreground" />;
  if (tone === "success") return <BadgeCheck className="h-4 w-4 text-success-foreground" />;
  return <BellRing className="h-4 w-4 text-primary" />;
}

function renderInAppToastContent({
  title,
  description,
  tone,
  actionLabel,
  onClose,
}: {
  title: string;
  description?: string;
  tone?: PreviewTone;
  actionLabel?: string;
  onClose?: () => void;
}) {
  return (
    <div className="w-[min(420px,calc(100vw-32px))] rounded-[24px] border border-border bg-card p-4 text-card-foreground ring-1 ring-[hsl(var(--soft-ring))] shadow-[var(--shadow-elevated-lg)]">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
            tone === "success" && "border-success-soft-border bg-success-soft text-success-foreground",
            tone === "warning" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
            (!tone || tone === "info") && "border-info-soft-border bg-info-soft text-info-foreground"
          )}
        >
          {getInAppNotificationIcon(tone)}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[15px] font-semibold leading-5 text-foreground">{title}</div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Закрити сповіщення"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {description ? <div className="text-sm leading-5 text-muted-foreground">{description}</div> : null}
          <div className="flex items-center justify-end gap-3 pt-1">
            {actionLabel ? (
              <span className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground">
                {actionLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled = false,
  onClick,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        checked && "border-primary/35 bg-primary",
        !checked && "border-border bg-muted/80",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function statusPillClass(tone: SettingsTone) {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors sm:text-sm",
    tone === "active" && "border-primary/25 bg-primary/10 text-primary",
    tone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
    tone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
  );
}

function statusIconButtonClass(tone: SettingsTone) {
  return cn(
    "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
    tone === "active" && "border-primary/25 bg-primary/10 text-primary",
    tone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
    tone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
  );
}

function notificationCardToneClass(item: NotificationItem) {
  const lowerTitle = item.title.toLowerCase();
  if (lowerTitle.includes("день народження")) return item.read ? "bg-card/90" : "tone-accent-subtle";
  if (lowerTitle.includes("відпуст")) return item.read ? "bg-card/90" : "tone-info-subtle";
  if (item.read) return "bg-card/90";
  if (item.tone === "success") return "tone-success-subtle";
  if (item.tone === "warning") return "tone-warning-subtle";
  if (item.tone === "info") return "tone-info-subtle";
  return "tone-neutral-subtle";
}

function extractNotificationName(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  const markerIndex = Math.max(normalized.lastIndexOf(" у "), normalized.lastIndexOf(" в "));
  const subject = markerIndex >= 0 ? normalized.slice(markerIndex + 3).trim() : normalized;
  const clean = subject.replace(/[.,;:!?]+$/g, "");
  const words = clean.split(" ").filter(Boolean).slice(0, 2);
  return words.join(" ").trim() || "CRM";
}

function getInitials(value: string) {
  const words = value.split(" ").filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || "CR";
}

function normalizeNotificationMatchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractMentionActorName(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.+?)\s+згадав(?:\(ла\))?\s+вас\s+у\s+коментарі$/i);
  return match?.[1]?.trim() || null;
}

function extractQuoteNumber(text: string) {
  const match = text.match(/#?(TS-\d{4}-\d{4})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function extractDesignTaskIdFromHref(href: string | null | undefined) {
  if (!href) return null;
  const match = href.match(/^\/design\/([^/?#]+)/i);
  return match?.[1]?.trim() || null;
}

function getNotificationSearchText(item: NotificationItem) {
  return normalizeNotificationMatchText(`${item.title} ${item.description}`.trim());
}

function buildPartyNameVariants(name: string) {
  const normalized = name.trim();
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  variants.add(normalized.replace(/["'«»]/g, "").trim());
  return Array.from(variants)
    .map((value) => normalizeNotificationMatchText(value))
    .filter(Boolean);
}

function findMatchedPartyAvatar(
  item: NotificationItem,
  partyAvatars: NotificationPartyAvatar[]
) {
  const searchText = getNotificationSearchText(item);
  let bestMatch: NotificationPartyAvatar | null = null;
  let bestLength = 0;

  for (const party of partyAvatars) {
    const variants = buildPartyNameVariants(party.name);
    if (variants.some((variant) => variant && searchText.includes(variant))) {
      if (party.name.length > bestLength) {
        bestMatch = party;
        bestLength = party.name.length;
      }
    }
  }

  return bestMatch;
}

function findPartyAvatarByName(name: string | null | undefined, partyAvatars: NotificationPartyAvatar[]) {
  const normalizedTarget = normalizeNotificationMatchText(name ?? "");
  if (!normalizedTarget) return null;

  let bestMatch: NotificationPartyAvatar | null = null;
  let bestLength = 0;

  for (const party of partyAvatars) {
    const variants = buildPartyNameVariants(party.name);
    if (variants.includes(normalizedTarget)) {
      if (party.name.length > bestLength) {
        bestMatch = party;
        bestLength = party.name.length;
      }
    }
  }

  return bestMatch;
}

function findPartyAvatarByTypedId(
  entityType: "customer" | "lead" | null | undefined,
  id: string | null | undefined,
  partyAvatars: NotificationPartyAvatar[]
) {
  if (!entityType || !id) return null;
  return (
    partyAvatars.find((party) => party.entityType === entityType && party.id === id) ??
    null
  );
}

function getNotificationToneClasses(
  tone: "mention" | "birthday" | "vacation" | "success" | "warning" | "default"
) {
  if (tone === "mention") {
    return "border-info-soft-border bg-info-soft text-info-foreground";
  }
  if (tone === "birthday") {
    return "border-danger-soft-border bg-danger-soft text-danger-foreground";
  }
  if (tone === "vacation") {
    return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  }
  if (tone === "success") {
    return "border-success-soft-border bg-success-soft text-success-foreground";
  }
  if (tone === "warning") {
    return "border-warning-soft-border bg-warning-soft text-warning-foreground";
  }
  return "border-border/70 bg-muted/50 text-foreground";
}

function getNotificationAvatarMeta(item: NotificationItem) {
  const lowerTitle = item.title.toLowerCase();
  const name = extractNotificationName(item.title);

  if (lowerTitle.includes("згадав")) {
    return {
      initials: getInitials(name),
      icon: <BellRing className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("mention"),
      badgeClass: getNotificationToneClasses("mention"),
    };
  }

  if (lowerTitle.includes("день народження")) {
    return {
      initials: getInitials(name),
      icon: <PartyPopper className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("birthday"),
      badgeClass: getNotificationToneClasses("birthday"),
    };
  }

  if (lowerTitle.includes("відпуст")) {
    return {
      initials: getInitials(name),
      icon: <PlaneTakeoff className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("vacation"),
      badgeClass: getNotificationToneClasses("vacation"),
    };
  }

  if (item.tone === "success") {
    return {
      initials: "OK",
      icon: <BadgeCheck className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("success"),
      badgeClass: getNotificationToneClasses("success"),
    };
  }

  if (item.tone === "warning") {
    return {
      initials: "AL",
      icon: <ShieldAlert className="h-4 w-4" />,
      avatarClass: getNotificationToneClasses("warning"),
      badgeClass: getNotificationToneClasses("warning"),
    };
  }

  return {
    initials: getInitials(name),
    icon: <BellRing className="h-4 w-4" />,
    avatarClass: getNotificationToneClasses("default"),
    badgeClass: getNotificationToneClasses("default"),
  };
}

function renderNotificationDescription(text: string): ReactNode {
  const parts = text.split(MENTION_TOKEN_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!part.startsWith("@")) return <span key={`part-${index}`}>{part}</span>;
    return (
      <span key={`part-${index}`} className="font-semibold text-primary">
        {part}
      </span>
    );
  });
}

function getCompactNotificationDescription(item: NotificationItem) {
  const title = normalizeNotificationMatchText(item.title.replace(/[.,;:!?]+$/g, ""));
  const description = normalizeNotificationMatchText(item.description.replace(/[.,;:!?]+$/g, ""));
  if (!description) return "";
  if (description === title) return "";
  if (description.startsWith(title) || title.startsWith(description)) return "";
  return item.description;
}

const NOTIFICATION_AVATAR_SIZE = 48;
const NOTIFICATION_BADGE_CLASS =
  "absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm sm:-bottom-2 sm:-right-2 sm:h-7 sm:w-7";
const NOTIFICATION_AVATAR_SHELL_CLASS = "relative mt-0.5 flex h-12 w-12 shrink-0 items-start justify-start";

export default function NotificationsPage() {
  const { userId } = useAuth();
  const push = usePushNotifications(userId);
  const location = useLocation();
  const navigate = useNavigate();
  const { cached, setCache } = usePageCache<NotificationsPageCache>("notifications");
  const hasCache = Boolean(cached);
  
  const [notifications, setNotifications] = useState<NotificationItem[]>(cached?.notifications ?? []);
  const [loading, setLoading] = useState(!hasCache);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [realtimeDisabled, setRealtimeDisabled] = useState(() => isRealtimeDisabledForSession());
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] = useState(() => readInAppNotificationPreferences().enabled);
  const [inAppNotificationSoundEnabled, setInAppNotificationSoundEnabled] = useState(
    () => readInAppNotificationPreferences().soundEnabled
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundDebug, setSoundDebug] = useState<SoundDebugState>({ level: "idle", message: "" });
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberDisplayRow[]>([]);
  const [partyAvatars, setPartyAvatars] = useState<NotificationPartyAvatar[]>([]);
  const [quoteAvatars, setQuoteAvatars] = useState<NotificationQuoteAvatar[]>([]);
  const [designTaskAvatars, setDesignTaskAvatars] = useState<NotificationDesignTaskAvatar[]>([]);

  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);

  const loadNotifications = useCallback(
    async (showLoader = false) => {
      if (!userId) return;
      if (showLoader) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, href, created_at, read_at, type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        const mapped = ((data || []) as NotificationRow[]).map(mapNotificationRow);
        setNotifications(mapped);
        setCache({ notifications: mapped });
      } else {
        setNotifications([]);
        setCache({ notifications: [] });
      }
      if (showLoader) {
        setLoading(false);
      }
    },
    [setCache, userId]
  );

  useEffect(() => {
    void loadNotifications(!hasCache);
  }, [hasCache, loadNotifications]);

  useEffect(() => {
    let active = true;

    const loadAvatarSources = async () => {
      if (!userId) return;
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId || !active) return;

      const quoteNumbers = Array.from(
        new Set(
          notifications
            .map((item) => extractQuoteNumber(`${item.title} ${item.description}`))
            .filter((value): value is string => Boolean(value))
        )
      );
      const designTaskIds = Array.from(
        new Set(
          notifications
            .map((item) => extractDesignTaskIdFromHref(item.href))
            .filter((value): value is string => Boolean(value))
        )
      );

      const [members, customersResult, leadsResult, quotesResult, designTasksResult] = await Promise.all([
        listWorkspaceMembersForDisplay(workspaceId).catch(() => []),
        supabase
          .schema("tosho")
          .from("customers")
          .select("id, name, legal_name, logo_url")
          .eq("team_id", workspaceId)
          .limit(5000),
        supabase
          .schema("tosho")
          .from("leads")
          .select("id, company_name, legal_name, logo_url")
          .eq("team_id", workspaceId)
          .limit(5000),
        quoteNumbers.length > 0
          ? supabase
              .schema("tosho")
              .from("quotes")
              .select("id, number, customer_id, customer_name, customer_logo_url, title")
              .in("number", quoteNumbers)
          : Promise.resolve({ data: [], error: null }),
        designTaskIds.length > 0
          ? supabase
              .from("activity_log")
              .select("id, entity_id, metadata, title")
              .eq("action", "design_task")
              .in("id", designTaskIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      setWorkspaceMembers(members);

      const nextPartyAvatars: NotificationPartyAvatar[] = [];
      for (const row of (customersResult.data ?? []) as Array<{ id?: string | null; name?: string | null; legal_name?: string | null; logo_url?: string | null }>) {
        const name = row.name?.trim() || row.legal_name?.trim() || "";
        if (!name) continue;
        nextPartyAvatars.push({
          id: row.id?.trim() || null,
          entityType: "customer",
          name,
          logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
        });
      }
      for (const row of (leadsResult.data ?? []) as Array<{ id?: string | null; company_name?: string | null; legal_name?: string | null; logo_url?: string | null }>) {
        const name = row.company_name?.trim() || row.legal_name?.trim() || "";
        if (!name) continue;
        nextPartyAvatars.push({
          id: row.id?.trim() || null,
          entityType: "lead",
          name,
          logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
        });
      }
      setPartyAvatars(nextPartyAvatars);
      const nextPartyAvatarByTypedId = new Map<string, NotificationPartyAvatar>();
      for (const party of nextPartyAvatars) {
        if (!party.entityType || !party.id) continue;
        nextPartyAvatarByTypedId.set(`${party.entityType}:${party.id}`, party);
      }

      const nextQuoteAvatars = ((quotesResult.data ?? []) as Array<{
        id?: string | null;
        number?: string | null;
        customer_id?: string | null;
        customer_name?: string | null;
        customer_logo_url?: string | null;
        title?: string | null;
      }>)
        .map((row) => {
          const customerId = row.customer_id?.trim() || null;
          const currentCustomer = customerId
            ? nextPartyAvatarByTypedId.get(`customer:${customerId}`) ?? null
            : null;
          return {
            quoteNumber: row.number?.trim()?.toUpperCase() || "",
            customerId,
            customerName: currentCustomer?.name || row.customer_name?.trim() || row.title?.trim() || null,
            customerLogoUrl: currentCustomer?.logoUrl || normalizeCustomerLogoUrl(row.customer_logo_url ?? null),
          };
        })
        .filter((row) => row.quoteNumber);
      setQuoteAvatars(nextQuoteAvatars);

      const nextDesignTaskAvatars = ((designTasksResult.data ?? []) as Array<{
        id?: string | null;
        entity_id?: string | null;
        title?: string | null;
        metadata?: Record<string, unknown> | null;
      }>)
        .map((row) => {
          const metadata = row.metadata ?? {};
          const customerTypeRaw =
            typeof metadata.customer_type === "string" ? metadata.customer_type.trim().toLowerCase() : "";
          const customerType: "customer" | "lead" | null =
            customerTypeRaw === "customer" || customerTypeRaw === "lead"
              ? customerTypeRaw
              : null;
          const customerId =
            typeof metadata.customer_id === "string" && metadata.customer_id.trim()
              ? metadata.customer_id.trim()
              : null;
          const currentParty = customerType && customerId
            ? nextPartyAvatarByTypedId.get(`${customerType}:${customerId}`) ?? null
            : null;
          return {
            taskId: row.id?.trim() || "",
            quoteId: typeof row.entity_id === "string" && row.entity_id.trim() ? row.entity_id.trim() : null,
            quoteNumber:
              typeof metadata.quote_number === "string" && metadata.quote_number.trim()
                ? metadata.quote_number.trim().toUpperCase()
                : null,
            customerId,
            customerType,
            customerName: currentParty?.name ||
              (typeof metadata.customer_name === "string" && metadata.customer_name.trim()
                ? metadata.customer_name.trim()
                : null),
            customerLogoUrl:
              currentParty?.logoUrl ||
              (typeof metadata.customer_logo_url === "string"
                ? normalizeCustomerLogoUrl(metadata.customer_logo_url)
                : null),
          };
        })
        .filter((row) => row.taskId);
      setDesignTaskAvatars(nextDesignTaskAvatars);
    };

    void loadAvatarSources();
    return () => {
      active = false;
    };
  }, [notifications, userId]);

  const memberByNormalizedName = useMemo(() => {
    const map = new Map<string, WorkspaceMemberDisplayRow>();
    for (const member of workspaceMembers) {
      const candidates = [
        member.displayName,
        member.fullName,
        member.label,
        [member.firstName, member.lastName].filter(Boolean).join(" "),
      ];
      for (const candidate of candidates) {
        const normalized = normalizeNotificationMatchText(candidate ?? "");
        if (normalized && !map.has(normalized)) {
          map.set(normalized, member);
        }
      }
    }
    return map;
  }, [workspaceMembers]);

  useEffect(() => {
    if (!userId) return;
    if (!realtimeDisabled) return;
    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadNotifications(false);
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications, realtimeDisabled, userId]);

  useEffect(() => {
    if (realtimeDisabled) return;
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-page:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" && location.pathname.startsWith("/notifications")) {
            const row = payload.new as NotificationRow;
            const item = mapNotificationRow(row);
            toast(item.title || "Нове сповіщення", {
              description: item.description?.trim() || undefined,
            });
          }
          void loadNotifications(false);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enableRealtimeForSession();
          setRealtimeDisabled(false);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          disableRealtimeForSession();
          setRealtimeDisabled(true);
          void loadNotifications(false);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, location.pathname, realtimeDisabled, userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, filter]);

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      toast.error("Не вдалося оновити сповіщення");
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Усі сповіщення прочитані");
  }, [unreadCount, userId]);

  const showSkeleton = useMinimumLoading(loading);

  const openNotification = async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  };

  const updateInAppNotificationPreferences = (next: { enabled?: boolean; soundEnabled?: boolean }) => {
    const resolved = {
      enabled: next.enabled ?? inAppNotificationsEnabled,
      soundEnabled: next.soundEnabled ?? inAppNotificationSoundEnabled,
    };
    const normalized = {
      enabled: resolved.enabled,
      soundEnabled: resolved.enabled ? resolved.soundEnabled : false,
    };
    setInAppNotificationsEnabled(normalized.enabled);
    setInAppNotificationSoundEnabled(normalized.soundEnabled);
    writeInAppNotificationPreferences(normalized);
  };

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const playInAppNotificationSound = useCallback(async (force = false) => {
    if (!inAppNotificationSoundEnabled) {
      return { ok: false, message: "Звук вимкнений у налаштуваннях" };
    }
    return playNotificationSound({ force });
  }, [inAppNotificationSoundEnabled]);

  const showInAppPreview = useCallback((tone: PreviewTone) => {
    const variants: Record<PreviewTone, { title: string; description: string; actionLabel: string }> = {
      info: {
        title: "Нове сповіщення в CRM",
        description: "Менеджер залишив коментар у задачі. Popup з’явиться так само, як при реальній події.",
        actionLabel: "До задачі",
      },
      success: {
        title: "Задачу оновлено",
        description: "Дизайн переведено в готовий. Так виглядатиме сповіщення про успішну зміну стану.",
        actionLabel: "Відкрити",
      },
      warning: {
        title: "Потрібна увага",
        description: "Замовник повернув правки. Важливі події можуть показуватись довше й з іншим акцентом.",
        actionLabel: "Переглянути",
      },
    };

    const preview = variants[tone];
    toast.custom(
      (t) =>
        renderInAppToastContent({
          title: preview.title,
          description: preview.description,
          tone,
          actionLabel: preview.actionLabel,
          onClose: () => toast.dismiss(t),
        }),
      {
        id: `notification-preview:${tone}:${Date.now()}`,
        position: "top-right",
        duration: getInAppNotificationDuration(tone),
        className: "!border-0 !bg-transparent !p-0 !shadow-none",
      }
    );

    void playInAppNotificationSound();
  }, [playInAppNotificationSound]);

  const pushStatusLabel = !push.supported
    ? "Недоступно"
    : push.enabled
      ? "Увімкнено"
      : push.configured
        ? "Вимкнено"
        : "Потрібен дозвіл";

  const pushStatusTone: SettingsTone = !push.supported
    ? "inactive"
    : push.enabled
      ? "active"
      : "muted";

  const inAppStatusLabel = inAppNotificationsEnabled ? "Увімкнено" : "Вимкнено";
  const inAppStatusTone: SettingsTone = inAppNotificationsEnabled ? "active" : "muted";

  const soundStatusLabel = !inAppNotificationsEnabled
    ? "Недоступно"
    : inAppNotificationSoundEnabled
      ? "Увімкнено"
      : "Вимкнено";

  const soundStatusTone: SettingsTone = !inAppNotificationsEnabled
    ? "inactive"
    : inAppNotificationSoundEnabled
      ? "active"
      : "muted";

  const handlePushPillClick = useCallback(() => {
    if (!push.supported) return;
    if (push.enabled) {
      void push.disable();
      return;
    }
    void push.enable();
  }, [push.disable, push.enable, push.enabled, push.supported]);

  const handleInAppPillClick = useCallback(() => {
    updateInAppNotificationPreferences({ enabled: !inAppNotificationsEnabled });
  }, [inAppNotificationsEnabled]);

  const handleSoundPillClick = useCallback(() => {
    if (!inAppNotificationsEnabled) return;
    updateInAppNotificationPreferences({ soundEnabled: !inAppNotificationSoundEnabled });
  }, [inAppNotificationSoundEnabled, inAppNotificationsEnabled]);

  const notificationsHeaderActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
            <div className="flex items-center gap-2">
              <div className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                  className={SEGMENTED_TRIGGER}
                >
                  Всі
                </Button>
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={filter === "unread"}
                  onClick={() => setFilter("unread")}
                  className={SEGMENTED_TRIGGER}
                >
                  Непрочитані
                </Button>
              </div>
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  type="button"
                  className={cn(statusIconButtonClass(pushStatusTone), "cursor-pointer")}
                  onClick={handlePushPillClick}
                  disabled={!push.supported}
                  aria-label={`Push ${pushStatusLabel}`}
                  title={`Push ${pushStatusLabel}`}
                >
                  <BellRing className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(statusIconButtonClass(inAppStatusTone), "cursor-pointer")}
                  onClick={handleInAppPillClick}
                  aria-label={`Popup ${inAppStatusLabel}`}
                  title={`Popup ${inAppStatusLabel}`}
                >
                  <MonitorSmartphone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(statusIconButtonClass(soundStatusTone), "cursor-pointer")}
                  onClick={handleSoundPillClick}
                  disabled={!inAppNotificationsEnabled}
                  aria-label={`Звук ${soundStatusLabel}`}
                  title={`Звук ${soundStatusLabel}`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="iconMd"
                  className="h-10 w-10 rounded-2xl border-border/60 bg-background/70"
                  onClick={openSettings}
                  title="Налаштування сповіщень"
                  aria-label="Налаштування сповіщень"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="iconMd"
              className="h-10 w-10 rounded-2xl border-border/60 bg-background/70 md:hidden"
              onClick={openSettings}
              title="Налаштування сповіщень"
              aria-label="Налаштування сповіщень"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        }
        topRight={
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="font-semibold text-foreground">
              {filtered.length}
              <span className="ml-1 text-muted-foreground">знайдено</span>
            </div>
            <Button
              variant="secondary"
              className={cn(TOOLBAR_ACTION_BUTTON, "min-h-10 px-4")}
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Позначити всі
            </Button>
          </div>
        }
      />
    ),
    [
      filter,
      filtered.length,
      handleInAppPillClick,
      handlePushPillClick,
      handleSoundPillClick,
      inAppStatusLabel,
      inAppStatusTone,
      inAppNotificationsEnabled,
      markAllRead,
      openSettings,
      push.supported,
      pushStatusLabel,
      pushStatusTone,
      soundStatusLabel,
      soundStatusTone,
      unreadCount,
    ]
  );

  usePageHeaderActions(notificationsHeaderActions, [notificationsHeaderActions]);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-5 px-3 py-3 pb-20 sm:px-5 md:space-y-6 md:pb-6">
        <section className="rounded-[28px] border border-border/60 bg-card/95 p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight text-foreground">Стрічка подій</div>
            </div>
            <div className="text-sm font-semibold text-foreground md:hidden">{filtered.length} знайдено</div>
          </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-0.75rem)] max-w-[760px] overflow-y-auto p-3 sm:max-h-[88dvh] sm:w-auto sm:p-6">
          <DialogHeader>
            <DialogTitle>Налаштування сповіщень</DialogTitle>
            <DialogDescription className="hidden sm:block">
              Тут можна керувати браузерним push, popup-сповіщеннями всередині CRM, звуком і одразу протестувати, як це виглядає.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 sm:space-y-3">
            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-3 py-3 shadow-sm sm:px-4 sm:py-4">
              <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-primary/5 text-primary">
                      <BellRing className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 max-w-2xl">
                      <div className="text-sm font-semibold text-foreground sm:text-base">Push у браузері</div>
                      <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                        Працює, коли вкладка неактивна або браузер згорнутий.
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold md:hidden",
                    pushStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    pushStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                    pushStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                  )}>
                    {pushStatusLabel}
                  </span>
                </div>
                <div className="flex w-full flex-col gap-3 md:min-w-[320px] md:max-w-[320px]">
                  <div className="hidden items-center justify-end gap-3 md:flex">
                    <span className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      pushStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                      pushStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                      pushStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                    )}>
                      {pushStatusLabel}
                    </span>
                  </div>
                  {push.supported && push.configured ? (
                    <div className="flex items-center justify-start gap-3 md:justify-end">
                      <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-start md:justify-end">
                        <Button
                          variant="outline"
                          className="h-9 w-full text-sm sm:h-10 sm:w-auto"
                          onClick={push.sendTest}
                          disabled={push.busy || !push.enabled}
                        >
                          Тест push
                        </Button>
                        <div className="flex items-center gap-3">
                          <Toggle
                            checked={push.enabled}
                            disabled={push.busy}
                            onClick={push.enabled ? push.disable : push.enable}
                            label="Перемкнути push у браузері"
                          />
                          <span className="text-sm font-medium text-foreground">
                            {push.enabled ? "Увімкнено" : "Вимкнено"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs leading-5 text-muted-foreground">
                      Поточний браузер не підтримує push або ще не надано дозвіл.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-3 py-3 shadow-sm sm:px-4 sm:py-4">
              <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-primary/5 text-primary">
                      <MonitorSmartphone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 max-w-2xl">
                      <div className="text-sm font-semibold text-foreground sm:text-base">In-app popup</div>
                      <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                        З’являється у правому верхньому куті, поки ви працюєте всередині CRM.
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold md:hidden",
                    inAppStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    inAppStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground"
                  )}>
                    {inAppStatusLabel}
                  </span>
                </div>
                <div className="flex flex-col items-start gap-3 md:min-w-[280px] md:items-end">
                  <span className={cn(
                    "hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold md:inline-flex",
                    inAppStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    inAppStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground"
                  )}>
                    {inAppStatusLabel}
                  </span>
                  <div className="flex w-full items-center gap-3 md:min-w-[280px] md:justify-end">
                    <Toggle
                      checked={inAppNotificationsEnabled}
                      onClick={() => updateInAppNotificationPreferences({ enabled: !inAppNotificationsEnabled })}
                      label="Перемкнути in-app popup"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {inAppNotificationsEnabled ? "Увімкнено" : "Вимкнено"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-3 py-3 shadow-sm sm:px-4 sm:py-4">
              <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-primary/5 text-primary">
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 max-w-2xl">
                      <div className="text-sm font-semibold text-foreground sm:text-base">Звук</div>
                      <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                        Делікатний сигнал для нових popup-сповіщень усередині CRM.
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold md:hidden",
                    soundStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    soundStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                    soundStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                  )}>
                    {soundStatusLabel}
                  </span>
                </div>
                <div className="flex flex-col items-start gap-3 md:min-w-[320px] md:items-end">
                  <span className={cn(
                    "hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold md:inline-flex",
                    soundStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    soundStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                    soundStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                  )}>
                    {soundStatusLabel}
                  </span>
                  <div className="flex w-full flex-col items-start gap-2 md:min-w-[320px] md:items-end">
                    <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-start md:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full text-sm sm:h-10 sm:w-auto"
                        disabled={!inAppNotificationsEnabled}
                        onClick={async () => {
                          const result = await playInAppNotificationSound(true);
                          setSoundDebug({
                            level: result.ok ? "success" : "error",
                            message: result.message,
                          });
                        }}
                      >
                        Тест звуку
                      </Button>
                      <div className="flex items-center gap-3">
                        <Toggle
                          checked={inAppNotificationSoundEnabled}
                          disabled={!inAppNotificationsEnabled}
                          onClick={() =>
                            updateInAppNotificationPreferences({ soundEnabled: !inAppNotificationSoundEnabled })
                          }
                          label="Перемкнути звук сповіщень"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {inAppNotificationSoundEnabled ? "Увімкнено" : "Вимкнено"}
                        </span>
                      </div>
                    </div>
                    {soundDebug.message ? (
                      <div
                        className={cn(
                          "text-xs",
                          soundDebug.level === "success" && "text-success-foreground",
                          soundDebug.level === "error" && "text-danger-foreground"
                        )}
                      >
                        {soundDebug.message}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="rounded-[var(--radius-inner)] border border-border/70 bg-background/68 p-3 sm:p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground sm:text-base">Тест in-app popup</div>
                <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                  Перевіряє вигляд popup, різні іконки та звук. Можна натиснути кілька разів підряд, щоб побачити стек сповіщень.
                </div>
              </div>
              <Badge variant="secondary" className="hidden w-fit bg-background/80 sm:inline-flex">Тільки для перевірки</Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
              <Button type="button" variant="outline" className="h-9 w-full text-sm sm:h-10 sm:w-auto" onClick={() => showInAppPreview("info")}>
                Звичайне
              </Button>
              <Button type="button" variant="outline" className="h-9 w-full text-sm sm:h-10 sm:w-auto" onClick={() => showInAppPreview("success")}>
                Успішне
              </Button>
              <Button type="button" variant="outline" className="h-9 w-full text-sm sm:h-10 sm:w-auto" onClick={() => showInAppPreview("warning")}>
                Важливе
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Поки немає сповіщень.
        </div>
      ) : (
        <div className="mt-4 space-y-3 md:mt-5">
          {filtered.map((n) => {
            const avatar = getNotificationAvatarMeta(n);
            const compactDescription = getCompactNotificationDescription(n);
            const memberName = extractMentionActorName(n.title) || extractNotificationName(n.title);
            const member = memberByNormalizedName.get(normalizeNotificationMatchText(memberName));
            const matchedParty = findMatchedPartyAvatar(n, partyAvatars);
            const matchedDesignTask = designTaskAvatars.find(
              (task) => task.taskId === extractDesignTaskIdFromHref(n.href)
            );
            const matchedQuote =
              quoteAvatars.find((quote) => quote.quoteNumber === matchedDesignTask?.quoteNumber) ??
              quoteAvatars.find(
                (quote) => quote.quoteNumber === extractQuoteNumber(`${n.title} ${n.description}`)
              );
            const matchedDesignTaskCustomer = findPartyAvatarByTypedId(
              matchedDesignTask?.customerType,
              matchedDesignTask?.customerId,
              partyAvatars
            );
            const matchedQuoteCustomer = findPartyAvatarByTypedId("customer", matchedQuote?.customerId, partyAvatars);
            const matchedDesignTaskParty = findPartyAvatarByName(matchedDesignTask?.customerName, partyAvatars);
            const matchedQuoteParty = findPartyAvatarByName(matchedQuote?.customerName, partyAvatars);
            const companyAvatarName =
              matchedDesignTaskCustomer?.name ||
              matchedQuoteCustomer?.name ||
              matchedDesignTask?.customerName ||
              matchedQuote?.customerName ||
              matchedDesignTaskParty?.name ||
              matchedQuoteParty?.name ||
              matchedParty?.name ||
              null;
            const companyAvatarLogoUrl =
              matchedDesignTaskCustomer?.logoUrl ||
              matchedQuoteCustomer?.logoUrl ||
              matchedDesignTask?.customerLogoUrl ||
              matchedQuote?.customerLogoUrl ||
              matchedDesignTaskParty?.logoUrl ||
              matchedQuoteParty?.logoUrl ||
              matchedParty?.logoUrl ||
              null;
            return (
            <Button
              key={n.id}
              type="button"
              variant="ghost"
              size="md"
              onClick={() => openNotification(n)}
              className={cn(
                "group h-auto w-full justify-start rounded-[24px] p-0 text-left shadow-none hover:bg-transparent",
                !n.read && "data-[state=active]:ring-0"
              )}
            >
              <div
                className={cn(
                  "flex w-full items-start gap-3 rounded-[24px] border border-border/60 p-3 transition-colors duration-200 ease-out hover:bg-muted/28 sm:gap-4 sm:p-4",
                  notificationCardToneClass(n),
                  !n.read && "shadow-[var(--shadow-surface)]"
                )}
              >
                {member?.avatarDisplayUrl ? (
                  <div className={NOTIFICATION_AVATAR_SHELL_CLASS}>
                    <AvatarBase
                      src={member.avatarDisplayUrl}
                      name={member.label}
                      fallback={avatar.initials}
                      size={NOTIFICATION_AVATAR_SIZE}
                      className="border-border/70"
                      fallbackClassName="text-sm font-semibold"
                    />
                    <span className={cn(NOTIFICATION_BADGE_CLASS, avatar.badgeClass)}>
                      {avatar.icon}
                    </span>
                  </div>
                ) : companyAvatarName ? (
                  <div className={NOTIFICATION_AVATAR_SHELL_CLASS}>
                    <EntityAvatar
                      src={companyAvatarLogoUrl}
                      name={companyAvatarName}
                      fallback={getInitials(companyAvatarName)}
                      size={NOTIFICATION_AVATAR_SIZE}
                      className="border-border/70"
                    />
                    <span className={cn(NOTIFICATION_BADGE_CLASS, avatar.badgeClass)}>
                      {avatar.icon}
                    </span>
                  </div>
                ) : (
                  <div className={NOTIFICATION_AVATAR_SHELL_CLASS}>
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-semibold", avatar.avatarClass, n.read && "opacity-80")}>
                      <span>{avatar.initials}</span>
                    </div>
                    <span className={cn(NOTIFICATION_BADGE_CLASS, avatar.badgeClass)}>
                      {avatar.icon}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex flex-col justify-center gap-0.5">
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/65" /> : null}
                        <div className="min-w-0 line-clamp-2 break-words text-[15px] font-semibold leading-5 text-foreground sm:leading-6">{n.title}</div>
                      </div>
                      <span className="shrink-0 pl-4 text-xs text-muted-foreground sm:pl-0 sm:text-right">{n.time}</span>
                    </div>
                    {!n.read ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="bg-background/80">Нове</Badge>
                      </div>
                    ) : null}
                  </div>
                  {compactDescription ? (
                    <div className="mt-0.5 line-clamp-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] sm:mt-1 sm:line-clamp-none">
                      {renderNotificationDescription(compactDescription)}
                    </div>
                  ) : null}
                </div>
              </div>
            </Button>
          )})}
        </div>
      )}
        </section>
      </PageCanvasBody>
    </PageCanvas>
  );
}
