import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  ArrowLeft,
  Clock,
  Timer,
  Play,
  Pause,
  CalendarClock,
  Eye,
  Upload,
  Download,
  Palette,
  UserRound,
  Building2,
  Image as ImageIcon,
  Hash,
  MoreVertical,
  ExternalLink,
  Link2,
  Trash2,
  Check,
} from "lucide-react";
import { resolveWorkspaceId } from "@/lib/workspace";
import { AvatarBase } from "@/components/app/avatar-kit";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { EntityViewersBar } from "@/components/app/workspace-presence-widgets";
import { EntityHeader } from "@/components/app/headers/EntityHeader";
import { useEntityLock } from "@/hooks/useEntityLock";
import { formatActivityClock, formatActivityDayLabel, type ActivityRow } from "@/lib/activity";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import {
  formatElapsedSeconds,
  getDesignTaskTimerSummary,
  pauseDesignTaskTimer,
  startDesignTaskTimer,
  type DesignTaskTimerSummary,
} from "@/lib/designTaskTimer";
import { toast } from "sonner";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  assigneeUserId?: string | null;
  assignedAt?: string | null;
  metadata?: Record<string, unknown>;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  designBrief?: string | null;
  createdAt?: string | null;
};

type MembershipRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  access_role: string | null;
  job_role: string | null;
};

type QuoteItemRow = {
  id?: string;
  name: string | null;
  qty: number | null;
  unit: string | null;
  methods: unknown;
  attachment?: unknown;
  catalog_model_id?: string | null;
  catalog_kind_id?: string | null;
};

type AttachmentRow = {
  id: string;
  file_name: string | null;
  file_size?: number | null;
  created_at?: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  signed_url?: string | null;
  uploaded_by?: string | null;
};

type DesignOutputFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  signed_url?: string | null;
};

type DesignOutputLink = {
  id: string;
  label: string;
  url: string;
  created_at: string;
  created_by: string | null;
};

type QuoteMentionComment = {
  id: string;
  body: string;
  created_at: string;
  created_by: string;
};

type DesignTaskHistoryEvent = {
  id: string;
  created_at: string;
  title: string;
  actorLabel: string;
  actorUserId?: string | null;
  description?: string;
  icon: typeof Clock;
  accentClass: string;
};

const statusLabels: Record<DesignStatus, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "На перевірці",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const statusColors: Record<DesignStatus, string> = {
  new: "design-status-badge-new",
  changes: "design-status-badge-changes",
  in_progress: "design-status-badge-in-progress",
  pm_review: "design-status-badge-pm-review",
  client_review: "design-status-badge-client-review",
  approved: "design-status-badge-approved",
  cancelled: "design-status-badge-cancelled",
};

const statusQuickActions: Partial<Record<DesignStatus, Array<{ next: DesignStatus; label: string }>>> = {
  new: [{ next: "in_progress", label: "Почати роботу" }],
  changes: [{ next: "in_progress", label: "Почати правки" }],
  in_progress: [{ next: "pm_review", label: "Передати на перевірку PM" }],
  pm_review: [
    { next: "client_review", label: "Передати клієнту" },
    { next: "in_progress", label: "Повернути в роботу" },
  ],
  client_review: [
    { next: "approved", label: "Позначити як затверджено" },
    { next: "changes", label: "Повернути на правки" },
  ],
};

const allStatuses: DesignStatus[] = [
  "new",
  "changes",
  "in_progress",
  "pm_review",
  "client_review",
  "approved",
  "cancelled",
];

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getInitials = (name?: string | null) => {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || Number.isNaN(bytes)) return "Розмір невідомий";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (name?: string | null) => {
  if (!name) return "FILE";
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "FILE";
  return name.slice(dot + 1).toUpperCase();
};

const isImageAttachment = (name?: string | null) => {
  if (!name) return false;
  return /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)$/i.test(name);
};

const DESIGN_OUTPUT_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

const parseActivityMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const isDesignerRole = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "designer" || normalized === "дизайнер";
};

const isManagerRole = (accessRole?: string | null, jobRole?: string | null) => {
  const normalizedAccess = (accessRole ?? "").trim().toLowerCase();
  const normalizedJob = (jobRole ?? "").trim().toLowerCase();
  return (
    normalizedAccess === "owner" ||
    normalizedAccess === "admin" ||
    normalizedAccess === "manager" ||
    normalizedJob === "manager" ||
    normalizedJob === "менеджер"
  );
};

const formatQuantityWithUnit = (qty?: number | null, unit?: string | null) => {
  if (qty == null || Number.isNaN(Number(qty))) return "Не вказано";
  const qtyText = new Intl.NumberFormat("uk-UA").format(Number(qty));
  const rawUnit = (unit ?? "").trim().toLowerCase();
  const normalizedUnit =
    rawUnit === "pcs" || rawUnit === "pc" || rawUnit === "piece" || rawUnit === "pieces" || rawUnit === "шт" || rawUnit === "шт."
      ? "шт."
      : (unit ?? "").trim() || "од.";
  return `${qtyText} ${normalizedUnit}`;
};

const formatEstimateMinutes = (minutes?: number | null) => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return "Не вказано";
  const value = Math.round(minutes);
  const days = Math.floor(value / 480);
  const hours = Math.floor((value % 480) / 60);
  const mins = value % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} д`);
  if (hours) parts.push(`${hours} год`);
  if (mins) parts.push(`${mins} хв`);
  return parts.length > 0 ? parts.join(" ") : "0 хв";
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

export default function DesignTaskPage() {
  const { id } = useParams();
  const { teamId, userId, permissions } = useAuth();
  const navigate = useNavigate();
  const { getEntityViewers } = useWorkspacePresence();
  const designTaskViewers = useMemo(
    () => (id ? getEntityViewers("design_task", id) : []),
    [getEntityViewers, id]
  );
  const [task, setTask] = useState<DesignTask | null>(null);
  const [quoteItem, setQuoteItem] = useState<QuoteItemRow | null>(null);
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [designOutputFiles, setDesignOutputFiles] = useState<DesignOutputFile[]>([]);
  const [designOutputLinks, setDesignOutputLinks] = useState<DesignOutputLink[]>([]);
  const [methodLabelById, setMethodLabelById] = useState<Record<string, string>>({});
  const [positionLabelById, setPositionLabelById] = useState<Record<string, string>>({});
  const [memberById, setMemberById] = useState<Record<string, string>>({});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>({});
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string }>>([]);
  const [managerMembers, setManagerMembers] = useState<Array<{ id: string; label: string }>>([]);
  const [assigningSelf, setAssigningSelf] = useState(false);
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [managerSaving, setManagerSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState<DesignStatus | null>(null);
  const [outputUploading, setOutputUploading] = useState(false);
  const [outputSaving, setOutputSaving] = useState(false);
  const [historyRows, setHistoryRows] = useState<ActivityRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quoteMentionComments, setQuoteMentionComments] = useState<QuoteMentionComment[]>([]);
  const [quoteMentionsLoading, setQuoteMentionsLoading] = useState(false);
  const [quoteMentionsError, setQuoteMentionsError] = useState<string | null>(null);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addLinkUrl, setAddLinkUrl] = useState("https://");
  const [addLinkLabel, setAddLinkLabel] = useState("");
  const [addLinkError, setAddLinkError] = useState<string | null>(null);
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false);
  const [estimateInput, setEstimateInput] = useState("2");
  const [estimateUnit, setEstimateUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const [headerDeadlinePopoverOpen, setHeaderDeadlinePopoverOpen] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [estimatePendingAction, setEstimatePendingAction] = useState<
    | { mode: "assign"; nextAssigneeUserId: string | null }
    | { mode: "assign_self"; alsoStart: boolean }
    | { mode: "status"; nextStatus: DesignStatus }
    | { mode: "manual" }
    | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timerSummary, setTimerSummary] = useState<DesignTaskTimerSummary>({
    totalSeconds: 0,
    activeSessionId: null,
    activeStartedAt: null,
    activeUserId: null,
  });
  const [timerBusy, setTimerBusy] = useState<"start" | "pause" | null>(null);
  const [timerNowMs, setTimerNowMs] = useState<number>(() => Date.now());
  const outputInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveTeamId = teamId;
  const canManageAssignments = permissions.canManageAssignments;
  const canSelfAssign = permissions.canSelfAssignDesign;
  const isAssignedToMe = !!userId && task?.assigneeUserId === userId;
  const designTaskLock = useEntityLock({
    teamId: effectiveTeamId,
    entityType: "design_task",
    entityId: id ?? null,
    userId,
    userLabel: userId ? memberById[userId] ?? null : null,
    enabled: !!effectiveTeamId && !!id && !!userId,
  });
  const designTaskLockedByOther = designTaskLock.lockedByOther;

  const ensureCanEdit = () => {
    if (!designTaskLockedByOther) return true;
    toast.error(
      `Запис зараз редагує ${designTaskLock.holderName ?? "інший користувач"}. Доступно лише перегляд.`
    );
    return false;
  };

  const getMemberLabel = (id: string | null | undefined) => {
    if (!id) return "Без виконавця";
    return memberById[id] ?? id.slice(0, 8);
  };
  const getMemberAvatar = (id: string | null | undefined) => {
    if (!id) return null;
    return memberAvatarById[id] ?? null;
  };

  const getMethodLabel = (value: string | null | undefined) => {
    if (!value) return "Не вказано";
    if (methodLabelById[value]) return methodLabelById[value];
    return isUuid(value) ? "Метод з каталогу" : value;
  };

  const getPrintPositionLabel = (value: string | null | undefined) => {
    if (!value) return "Не вказано";
    if (positionLabelById[value]) return positionLabelById[value];
    return isUuid(value) ? "Позиція з каталогу" : value;
  };

  const loadTimerSummary = async (taskId: string) => {
    if (!effectiveTeamId) return;
    try {
      const summary = await getDesignTaskTimerSummary(effectiveTeamId, taskId);
      setTimerSummary(summary);
    } catch (e) {
      console.warn("Failed to load timer summary", e);
      setTimerSummary({
        totalSeconds: 0,
        activeSessionId: null,
        activeStartedAt: null,
        activeUserId: null,
      });
    }
  };

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      try {
        let rows: MembershipRow[] = [];

        if (effectiveTeamId) {
          const teamViewColumns = [
            "user_id,full_name,email,avatar_url,access_role,job_role",
            "user_id,full_name,email,avatar_url,job_role",
            "user_id,full_name,email,avatar_url",
            "user_id,full_name,email,job_role",
            "user_id,full_name,email",
            "user_id,full_name,avatar_url",
            "user_id,email,avatar_url",
            "user_id,full_name,job_role",
            "user_id,full_name",
            "user_id,email",
            "user_id",
          ];
          for (const columns of teamViewColumns) {
            const { data: teamViewData, error: teamViewError } = await supabase
              .from("team_members_view")
              .select(columns)
              .eq("team_id", effectiveTeamId);
            if (!teamViewError) {
              rows = ((teamViewData as unknown as MembershipRow[] | null) ?? []).filter((row) => !!row.user_id);
              break;
            }
            const message = (teamViewError.message ?? "").toLowerCase();
            if (!message.includes("column") || !message.includes("does not exist")) {
              throw teamViewError;
            }
          }
        }

        if (rows.length === 0) {
          const workspaceId = await resolveWorkspaceId(userId);
          if (!workspaceId) return;

          const membershipColumns = [
            "user_id,full_name,email,avatar_url,access_role,job_role",
            "user_id,full_name,email,avatar_url,job_role",
            "user_id,full_name,email,avatar_url",
            "user_id,full_name,email,access_role,job_role",
            "user_id,full_name,email,job_role",
            "user_id,full_name,email",
            "user_id",
          ];
          let loaded = false;
          for (const columns of membershipColumns) {
            const { data, error: membersError } = await supabase
              .schema("tosho")
              .from("memberships_view")
              .select(columns)
              .eq("workspace_id", workspaceId);
            if (!membersError) {
              rows = ((data as unknown as MembershipRow[] | null) ?? []).filter((row) => !!row.user_id);
              loaded = true;
              break;
            }
            const message = (membersError.message ?? "").toLowerCase();
            if (!message.includes("column") || !message.includes("does not exist")) {
              throw membersError;
            }
          }
          if (!loaded) throw new Error("Не вдалося завантажити учасників");
        }

        const labels: Record<string, string> = {};
        const avatars: Record<string, string | null> = {};
        rows.forEach((row) => {
          labels[row.user_id] = row.full_name?.trim() || row.email?.split("@")[0]?.trim() || row.user_id;
          avatars[row.user_id] = row.avatar_url ?? null;
        });
        setMemberById(labels);
        const resolvedAvatarEntries = await Promise.all(
          Object.entries(avatars).map(async ([id, rawUrl]) => [id, await resolveAvatarDisplayUrl(supabase, rawUrl, AVATAR_BUCKET)] as const)
        );
        setMemberAvatarById(Object.fromEntries(resolvedAvatarEntries));
        setDesignerMembers(
          rows
            .filter((row) => isDesignerRole(row.job_role))
            .map((row) => ({ id: row.user_id, label: labels[row.user_id] ?? row.user_id }))
        );
        let managerRows = rows.filter((row) => isManagerRole(row.access_role, row.job_role));
        if (managerRows.length === 0 && userId) {
          const me = rows.find((row) => row.user_id === userId);
          if (me) managerRows = [me];
        }
        if (managerRows.length === 0) managerRows = rows;
        setManagerMembers(
          managerRows.map((row) => ({
            id: row.user_id,
            label: labels[row.user_id] ?? row.user_id,
          }))
        );
      } catch {
        // Optional UI context; keep page functional even if membership lookup fails.
      }
    };
    void loadMembers();
  }, [userId, effectiveTeamId]);

  useEffect(() => {
    const load = async () => {
      if (!id || !effectiveTeamId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: row, error: rowError } = await supabase
          .from("activity_log")
          .select("id,entity_id,metadata,title,created_at")
          .eq("team_id", effectiveTeamId)
          .eq("id", id)
          .single();
        if (rowError) throw rowError;
        const meta = (row?.metadata as Record<string, unknown> | null) ?? {};
        const metadataQuoteId =
          typeof meta.quote_id === "string" && meta.quote_id.trim() ? meta.quote_id.trim() : null;
        const entityQuoteId = typeof row?.entity_id === "string" ? row.entity_id : "";
        const quoteId = metadataQuoteId ?? entityQuoteId;

        // quote basics
        let quote: {
          number?: string | null;
          customer_id?: string | null;
          created_at?: string | null;
          design_brief?: string | null;
          comment?: string | null;
        } | null = null;
        if (isUuid(quoteId)) {
          const { data: quoteData, error: quoteError } = await supabase
            .schema("tosho")
            .from("quotes")
            .select("number, customer_id, created_at, design_brief, comment")
            .eq("id", quoteId)
            .maybeSingle();
          if (
            quoteError &&
            /column/i.test(quoteError.message ?? "") &&
            /design_brief/i.test(quoteError.message ?? "")
          ) {
            const { data: quoteFallback, error: quoteFallbackError } = await supabase
              .schema("tosho")
              .from("quotes")
              .select("number, customer_id, created_at, comment")
              .eq("id", quoteId)
              .maybeSingle();
            if (quoteFallbackError) throw quoteFallbackError;
            quote = quoteFallback as {
              number?: string | null;
              customer_id?: string | null;
              created_at?: string | null;
              comment?: string | null;
            } | null;
          } else if (quoteError) {
            throw quoteError;
          } else {
            quote = quoteData as {
              number?: string | null;
              customer_id?: string | null;
              created_at?: string | null;
              design_brief?: string | null;
              comment?: string | null;
            } | null;
          }
        }

        let customerName: string | null =
          typeof meta.customer_name === "string" && meta.customer_name.trim() ? meta.customer_name.trim() : null;
        let customerLogoUrl: string | null = null;
        if (quote?.customer_id) {
          let customerQuery = await supabase
            .schema("tosho")
            .from("customers")
            .select("name, legal_name, logo_url")
            .eq("id", quote.customer_id as string)
            .maybeSingle();

          if (
            customerQuery.error &&
            /column/i.test(customerQuery.error.message ?? "") &&
            /logo_url/i.test(customerQuery.error.message ?? "")
          ) {
            customerQuery = await supabase
              .schema("tosho")
              .from("customers")
              .select("name, legal_name")
              .eq("id", quote.customer_id as string)
              .maybeSingle();
          }

          const cust = customerQuery.data as { name?: string | null; legal_name?: string | null; logo_url?: string | null } | null;
          customerName = cust?.name ?? cust?.legal_name ?? null;
          customerLogoUrl = cust?.logo_url ?? null;
        }

        // first quote item (only for quote-linked tasks)
        const { data: item } = isUuid(quoteId)
          ? await supabase
              .schema("tosho")
              .from("quote_items")
              .select("name, qty, unit, methods, attachment, catalog_model_id, catalog_kind_id")
              .eq("quote_id", quoteId)
              .order("position", { ascending: true })
              .limit(1)
              .maybeSingle()
          : { data: null };

        let itemPreviewUrl: string | null = null;
        if (item?.catalog_model_id) {
          const { data: modelRow } = await supabase
            .schema("tosho")
            .from("catalog_models")
            .select("image_url")
            .eq("id", item.catalog_model_id as string)
            .maybeSingle();
          itemPreviewUrl = (modelRow as { image_url?: string | null } | null)?.image_url ?? null;
        }
        // Keep product image independent from design visualizations.

        // customer attachments (only for quote-linked tasks)
        const { data: files } = isUuid(quoteId)
          ? await supabase
              .schema("tosho")
              .from("quote_attachments")
              .select("id,file_name,file_size,created_at,storage_bucket,storage_path,uploaded_by")
              .eq("quote_id", quoteId)
          : { data: [] };

        const attachmentRows = (files as AttachmentRow[] | null) ?? [];
        const attachmentsWithUrls = await Promise.all(
          attachmentRows.map(async (file) => {
            let signedUrl: string | null = null;
            if (file.storage_bucket && file.storage_path) {
              const { data: signed } = await supabase.storage
                .from(file.storage_bucket)
                .createSignedUrl(file.storage_path, 60 * 60 * 24 * 7);
              signedUrl = signed?.signedUrl ?? null;
            }
            return { ...file, signed_url: signedUrl };
          })
        );

        const rawStandaloneBriefFiles = Array.isArray(meta.standalone_brief_files)
          ? meta.standalone_brief_files
          : [];
        const parsedStandaloneBriefFiles = rawStandaloneBriefFiles
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
            const storageBucket = typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
            const storagePath = typeof entry.storage_path === "string" && entry.storage_path ? entry.storage_path : null;
            if (!fileName || !storageBucket || !storagePath) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              file_name: fileName,
              file_size: entry.file_size == null ? null : Number(entry.file_size),
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              storage_bucket: storageBucket,
              storage_path: storagePath,
              uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
            } satisfies AttachmentRow;
          })
          .filter(Boolean) as AttachmentRow[];

        const standaloneBriefFilesWithUrls = await Promise.all(
          parsedStandaloneBriefFiles.map(async (file) => {
            let signedUrl: string | null = null;
            if (file.storage_bucket && file.storage_path) {
              const { data: signed } = await supabase.storage
                .from(file.storage_bucket)
                .createSignedUrl(file.storage_path, 60 * 60 * 24 * 7);
              signedUrl = signed?.signedUrl ?? null;
            }
            return { ...file, signed_url: signedUrl };
          })
        );

        const rawDesignFiles = Array.isArray(meta.design_output_files) ? meta.design_output_files : [];
        const parsedDesignFiles: DesignOutputFile[] = rawDesignFiles
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
            const storageBucket = typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
            const storagePath = typeof entry.storage_path === "string" && entry.storage_path ? entry.storage_path : null;
            if (!fileName || !storageBucket || !storagePath) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              file_name: fileName,
              file_size: entry.file_size == null ? null : Number(entry.file_size),
              mime_type: typeof entry.mime_type === "string" ? entry.mime_type : null,
              storage_bucket: storageBucket,
              storage_path: storagePath,
              uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              signed_url: null,
            } satisfies DesignOutputFile;
          })
          .filter(Boolean) as DesignOutputFile[];

        const designFilesWithUrls = await Promise.all(
          parsedDesignFiles.map(async (file) => {
            const { data: signed } = await supabase.storage
              .from(file.storage_bucket)
              .createSignedUrl(file.storage_path, 60 * 60 * 24 * 7);
            return { ...file, signed_url: signed?.signedUrl ?? null };
          })
        );

        const rawDesignLinks = Array.isArray(meta.design_output_links) ? meta.design_output_links : [];
        const parsedDesignLinks: DesignOutputLink[] = rawDesignLinks
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const url = typeof entry.url === "string" ? entry.url.trim() : "";
            if (!url) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              label: (typeof entry.label === "string" && entry.label.trim()) || "Посилання",
              url,
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              created_by: typeof entry.created_by === "string" ? entry.created_by : null,
            } satisfies DesignOutputLink;
          })
          .filter(Boolean) as DesignOutputLink[];

        setTask({
          id,
          quoteId,
          title: (row?.title as string) ?? null,
          status: (meta.status as DesignStatus) ?? "new",
          assigneeUserId:
            typeof meta.assignee_user_id === "string" && meta.assignee_user_id ? meta.assignee_user_id : null,
          assignedAt: typeof meta.assigned_at === "string" ? meta.assigned_at : null,
          metadata: meta,
          methodsCount: meta.methods_count ?? (item?.methods?.length ?? 0),
          hasFiles:
            typeof meta.has_files === "boolean" ? meta.has_files : (files?.length ?? 0) > 0,
          designDeadline:
            (typeof meta.design_deadline === "string" ? meta.design_deadline : null) ??
            (typeof meta.deadline === "string" ? meta.deadline : null),
          quoteNumber:
            (typeof meta.quote_number === "string" && meta.quote_number.trim() ? meta.quote_number.trim() : null) ??
            (quote?.number as string) ??
            null,
          customerName,
          customerLogoUrl,
          designBrief:
            (typeof meta.design_brief === "string" && meta.design_brief.trim() ? meta.design_brief.trim() : null) ??
            quote?.design_brief ??
            quote?.comment ??
            null,
          createdAt:
            (typeof row?.created_at === "string" && row.created_at ? row.created_at : null) ??
            (quote?.created_at as string | null),
        });
        setQuoteItem(item ?? null);
        setProductPreviewUrl(itemPreviewUrl);
        setAttachments([...standaloneBriefFilesWithUrls, ...attachmentsWithUrls]);
        setDesignOutputFiles(designFilesWithUrls);
        setDesignOutputLinks(parsedDesignLinks);
      } catch (e: unknown) {
        setError(getErrorMessage(e, "Не вдалося завантажити задачу"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, effectiveTeamId]);

  const loadHistory = async (taskId: string) => {
    if (!effectiveTeamId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const createdQuery = supabase
        .from("activity_log")
        .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("id", taskId)
        .maybeSingle();

      const eventsQuery = supabase
        .from("activity_log")
        .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", taskId)
        .order("created_at", { ascending: false });

      const [{ data: createdRow, error: createdError }, { data: eventRows, error: eventsError }] = await Promise.all([
        createdQuery,
        eventsQuery,
      ]);
      if (createdError) throw createdError;
      if (eventsError) throw eventsError;

      const rows = [
        ...(createdRow ? [createdRow as ActivityRow] : []),
        ...(((eventRows as ActivityRow[] | null) ?? []).filter((row) => row.id !== createdRow?.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setHistoryRows(rows);
    } catch (e: unknown) {
      setHistoryRows([]);
      setHistoryError(getErrorMessage(e, "Не вдалося завантажити історію задачі."));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!task?.id) return;
    void loadHistory(task.id);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, effectiveTeamId]);

  useEffect(() => {
    if (!task?.id) return;
    void loadTimerSummary(task.id);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, effectiveTeamId]);

  useEffect(() => {
    const loadQuoteMentions = async () => {
      if (!task || !isUuid(task.quoteId)) {
        setQuoteMentionComments([]);
        setQuoteMentionsError(null);
        setQuoteMentionsLoading(false);
        return;
      }

      setQuoteMentionsLoading(true);
      setQuoteMentionsError(null);
      try {
        let rows: QuoteMentionComment[] = [];
        const { data, error: commentsError } = await supabase
          .schema("tosho")
          .from("quote_comments")
          .select("id,body,created_at,created_by")
          .eq("quote_id", task.quoteId)
          .order("created_at", { ascending: false })
          .limit(30);

        if (!commentsError) {
          rows =
            ((data as Array<{ id: string; body: string | null; created_at: string; created_by: string | null }> | null) ?? [])
              .map((row) => ({
                id: row.id,
                body: row.body ?? "",
                created_at: row.created_at,
                created_by: row.created_by ?? "",
              }));
        } else {
          const sessionData = await supabase.auth.getSession();
          const token = sessionData.data.session?.access_token;
          if (!token) throw commentsError;
          const response = await fetch("/.netlify/functions/quote-comments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ mode: "list", quoteId: task.quoteId }),
          });
          if (!response.ok) throw commentsError;
          const payload = await parseJsonSafe<{ comments?: unknown[] }>(response);
          rows = (Array.isArray(payload?.comments) ? payload.comments : [])
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const data = row as Record<string, unknown>;
              if (typeof data.id !== "string" || typeof data.created_at !== "string") return null;
              return {
                id: data.id,
                body: typeof data.body === "string" ? data.body : "",
                created_at: data.created_at,
                created_by: typeof data.created_by === "string" ? data.created_by : "",
              } satisfies QuoteMentionComment;
            })
            .filter(Boolean) as QuoteMentionComment[];
        }

        setQuoteMentionComments(rows.filter((row) => row.body.includes("@")));
      } catch (e: unknown) {
        setQuoteMentionComments([]);
        setQuoteMentionsError(getErrorMessage(e, "Не вдалося завантажити згадки з прорахунку."));
      } finally {
        setQuoteMentionsLoading(false);
      }
    };
    void loadQuoteMentions();
  }, [task?.id, task?.quoteId]);

  useEffect(() => {
    if (!timerSummary.activeStartedAt) return;
    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerSummary.activeStartedAt]);

  const deadlineLabel = useMemo(() => {
    if (!task?.designDeadline) return { label: "Без дедлайну", className: "text-muted-foreground" };
    const d = new Date(task.designDeadline);
    if (Number.isNaN(d.getTime())) return { label: "Без дедлайну", className: "text-muted-foreground" };
    const today = new Date();
    const diff = Math.round((d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `Прострочено ${Math.abs(diff)} дн.`, className: "text-danger-foreground" };
    if (diff === 0) return { label: "Сьогодні", className: "text-warning-foreground" };
    if (diff === 1) return { label: "Завтра", className: "text-warning-foreground" };
    return { label: d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }), className: "text-muted-foreground" };
  }, [task?.designDeadline]);
  const estimateLabel = useMemo(() => {
    const minutes = getTaskEstimateMinutes(task);
    return formatEstimateMinutes(minutes);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.metadata]);
  const isTimerRunning = !!timerSummary.activeSessionId && !!timerSummary.activeStartedAt;
  const timerElapsedSeconds =
    timerSummary.totalSeconds +
    (timerSummary.activeStartedAt
      ? Math.max(0, Math.floor((timerNowMs - new Date(timerSummary.activeStartedAt).getTime()) / 1000))
      : 0);
  const timerElapsedLabel = formatElapsedSeconds(timerElapsedSeconds);
  const canStartTimer =
    !!task &&
    !!userId &&
    task.status === "in_progress" &&
    !isTimerRunning &&
    !!task.assigneeUserId &&
    (task.assigneeUserId === userId || canManageAssignments);
  const canPauseTimer =
    !!task &&
    isTimerRunning &&
    !!userId &&
    !!task.assigneeUserId &&
    (task.assigneeUserId === userId || canManageAssignments);
  const startTimerBlockedReason = !task
    ? "Задача не завантажена"
    : !userId
      ? "Потрібна авторизація"
      : task.status !== "in_progress"
        ? "Спочатку переведіть задачу у статус «В роботі»"
        : !task.assigneeUserId
          ? "Спочатку призначте виконавця"
          : task.assigneeUserId !== userId && !canManageAssignments
            ? "Запускати таймер може тільки виконавець задачі"
            : isTimerRunning
              ? "Таймер уже запущено"
              : null;
  const pauseTimerBlockedReason = !task
    ? "Задача не завантажена"
    : !userId
      ? "Потрібна авторизація"
      : !isTimerRunning
        ? "Таймер не запущено"
        : !task.assigneeUserId
          ? "Виконавець не вказаний"
          : task.assigneeUserId !== userId && !canManageAssignments
            ? "Ставити на паузу може тільки виконавець задачі"
            : null;

  const methods = useMemo(() => {
    const raw = quoteItem?.methods;
    if (!raw || !Array.isArray(raw)) return [];
    return raw as { method_id?: string; print_position_id?: string; print_width_mm?: number | null; print_height_mm?: number | null }[];
  }, [quoteItem?.methods]);

  useEffect(() => {
    const loadMethodAndPositionLabels = async () => {
      const methodIds = Array.from(
        new Set(
          methods
            .map((method) => method.method_id)
            .filter((value): value is string => !!value && isUuid(value))
        )
      );
      const positionIds = Array.from(
        new Set(
          methods
            .map((method) => method.print_position_id)
            .filter((value): value is string => !!value && isUuid(value))
        )
      );

      if (methodIds.length === 0 && positionIds.length === 0) {
        setMethodLabelById({});
        setPositionLabelById({});
        return;
      }

      try {
        if (methodIds.length > 0) {
          let methodsQuery;
          if (effectiveTeamId) {
            methodsQuery = await supabase
              .schema("tosho")
              .from("catalog_methods")
              .select("id,name")
              .eq("team_id", effectiveTeamId)
              .in("id", methodIds)
              .order("name", { ascending: true });
            if (
              methodsQuery.error &&
              /column/i.test(methodsQuery.error.message ?? "") &&
              /team_id/i.test(methodsQuery.error.message ?? "")
            ) {
              methodsQuery = await supabase
                .schema("tosho")
                .from("catalog_methods")
                .select("id,name")
                .in("id", methodIds)
                .order("name", { ascending: true });
            }
          } else {
            methodsQuery = await supabase
              .schema("tosho")
              .from("catalog_methods")
              .select("id,name")
              .in("id", methodIds)
              .order("name", { ascending: true });
          }

          if (!methodsQuery.error) {
            const labelMap: Record<string, string> = {};
            ((methodsQuery.data as Array<{ id: string; name: string | null }> | null) ?? []).forEach((row) => {
              if (row.id) labelMap[row.id] = row.name ?? row.id;
            });
            setMethodLabelById(labelMap);
          }
        } else {
          setMethodLabelById({});
        }

        if (positionIds.length > 0) {
          const { data: positionsData, error: positionsError } = await supabase
            .schema("tosho")
            .from("catalog_print_positions")
            .select("id,label")
            .in("id", positionIds)
            .order("label", { ascending: true });
          if (!positionsError) {
            const labelMap: Record<string, string> = {};
            ((positionsData as Array<{ id: string; label: string | null }> | null) ?? []).forEach((row) => {
              if (row.id) labelMap[row.id] = row.label ?? row.id;
            });
            setPositionLabelById(labelMap);
          }
        } else {
          setPositionLabelById({});
        }
      } catch {
        // Keep UI working even if dictionary lookup fails.
      }
    };

    void loadMethodAndPositionLabels();
  }, [effectiveTeamId, methods]);

  const quickActions = task ? statusQuickActions[task.status] ?? [] : [];
  function getTaskEstimateMinutes(sourceTask: DesignTask | null) {
    if (!sourceTask) return null;
    const raw = (sourceTask.metadata ?? {}).estimate_minutes;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  }

  const requestEstimateDialog = (
    pending: { mode: "assign"; nextAssigneeUserId: string | null } | { mode: "assign_self"; alsoStart: boolean } | { mode: "status"; nextStatus: DesignStatus }
  ) => {
    setEstimatePendingAction(pending);
    setEstimateInput("2");
    setEstimateUnit("hours");
    setEstimateError(null);
    setEstimateDialogOpen(true);
  };

  const quantityLabel = useMemo(
    () => formatQuantityWithUnit(quoteItem?.qty ?? null, quoteItem?.unit ?? null),
    [quoteItem?.qty, quoteItem?.unit]
  );

  const formatDate = (value: string | null | undefined, withTime = false) => {
    if (!value) return "Не вказано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Не вказано";
    return withTime
      ? date.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  };
  const parseJsonSafe = async <T,>(response: Response): Promise<T | null> => {
    const raw = await response.text();
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const formatDeadlineLabel = (value: string | null | undefined) => {
    if (!value) return "Без дедлайну";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Без дедлайну";
    return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  };

  const toLocalDate = (value: string | null | undefined) => {
    if (!value) return undefined;
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      return new Date(year, month, day);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const historyEvents = useMemo<DesignTaskHistoryEvent[]>(() => {
    return historyRows.map((row) => {
      const metadata = parseActivityMetadata(row.metadata);
      const source = typeof metadata.source === "string" ? metadata.source : "";
      const actorLabel =
        row.user_id && memberById[row.user_id] ? memberById[row.user_id] : row.actor_name?.trim() || "Користувач";

      if (source === "design_task_assignment") {
        const fromLabel = typeof metadata.from_assignee_label === "string" ? metadata.from_assignee_label : "Без виконавця";
        const toLabel = typeof metadata.to_assignee_label === "string" ? metadata.to_assignee_label : "";
        const title = toLabel ? `Виконавець: ${fromLabel} → ${toLabel}` : `Виконавця знято (${fromLabel})`;
        return {
          id: row.id,
          created_at: row.created_at,
          title,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: UserRound,
          accentClass:
            "bg-primary/10 text-primary border-primary/20",
        };
      }

      if (source === "design_task_manager") {
        const fromLabel = typeof metadata.from_manager_label === "string" ? metadata.from_manager_label : "Не вказано";
        const toLabel = typeof metadata.to_manager_label === "string" ? metadata.to_manager_label : "Не вказано";
        return {
          id: row.id,
          created_at: row.created_at,
          title: `Менеджер: ${fromLabel} → ${toLabel}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: UserRound,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_status") {
        const fromStatusRaw = typeof metadata.from_status === "string" ? metadata.from_status : "";
        const toStatusRaw = typeof metadata.to_status === "string" ? metadata.to_status : "";
        const fromLabel = statusLabels[fromStatusRaw as DesignStatus] ?? fromStatusRaw;
        const toLabel = statusLabels[toStatusRaw as DesignStatus] ?? toStatusRaw;
        return {
          id: row.id,
          created_at: row.created_at,
          title: fromLabel && toLabel ? `Статус: ${fromLabel} → ${toLabel}` : row.title?.trim() || "Оновлено статус задачі",
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: CalendarClock,
          accentClass: "quote-activity-accent-deadline",
        };
      }

      if (source === "design_task_deadline") {
        const fromDeadline = typeof metadata.from_deadline === "string" ? metadata.from_deadline : null;
        const toDeadline = typeof metadata.to_deadline === "string" ? metadata.to_deadline : null;
        return {
          id: row.id,
          created_at: row.created_at,
          title: `Дедлайн: ${formatDeadlineLabel(fromDeadline)} → ${formatDeadlineLabel(toDeadline)}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: CalendarClock,
          accentClass: "quote-activity-accent-deadline",
        };
      }

      if (source === "design_task_estimate") {
        const raw = metadata.estimate_minutes;
        const estimateMinutes =
          typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        return {
          id: row.id,
          created_at: row.created_at,
          title: `Естімейт: ${formatEstimateMinutes(Number.isFinite(estimateMinutes) ? estimateMinutes : null)}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Clock,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_timer") {
        const timerAction = typeof metadata.timer_action === "string" ? metadata.timer_action : "";
        const title =
          timerAction === "start"
            ? "Запущено таймер"
            : timerAction === "pause"
              ? "Таймер на паузі"
              : timerAction.startsWith("auto_pause")
                ? "Таймер зупинено автоматично"
                : row.title?.trim() || "Оновлено таймер";
        return {
          id: row.id,
          created_at: row.created_at,
          title,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Timer,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_created" || row.action === "design_task") {
        return {
          id: row.id,
          created_at: row.created_at,
          title: "Створено дизайн-задачу",
          actorLabel,
          actorUserId: row.user_id ?? null,
          description: row.title?.trim() || undefined,
          icon: Palette,
          accentClass: "quote-activity-accent-runs",
        };
      }

      return {
        id: row.id,
        created_at: row.created_at,
        title: row.title?.trim() || "Оновлено задачу",
        actorLabel,
        actorUserId: row.user_id ?? null,
        icon: Clock,
        accentClass: "bg-muted/30 text-muted-foreground border-border",
      };
    });
  }, [historyRows, memberById]);

  const historyGroups = useMemo(() => {
    const groups: { label: string; items: DesignTaskHistoryEvent[] }[] = [];
    for (const event of historyEvents) {
      const label = formatActivityDayLabel(event.created_at);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [event] });
      } else {
        lastGroup.items.push(event);
      }
    }
    return groups;
  }, [historyEvents]);

  const resolveAttachmentUrl = (file: {
    signed_url?: string | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
  }) =>
    file.signed_url ??
    (file.storage_bucket && file.storage_path
      ? supabase.storage.from(file.storage_bucket).getPublicUrl(file.storage_path).data.publicUrl
      : null);

  const persistDesignOutputs = async (nextFiles: DesignOutputFile[], nextLinks: DesignOutputLink[]) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const filesForMeta = nextFiles.map((file) => ({
      id: file.id,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: file.uploaded_by,
      created_at: file.created_at,
    }));
    const linksForMeta = nextLinks.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      created_at: link.created_at,
      created_by: link.created_by,
    }));

    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      design_output_files: filesForMeta,
      design_output_links: linksForMeta,
    };

    setOutputSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;
      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
    } finally {
      setOutputSaving(false);
    }
  };

  const syncDesignFileToQuoteVisualizations = async (file: DesignOutputFile) => {
    if (!task || !effectiveTeamId || !isUuid(task.quoteId)) return;
    if (!ensureCanEdit()) return;

    const { data: existing, error: existingError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("id")
      .eq("quote_id", task.quoteId)
      .eq("storage_bucket", file.storage_bucket)
      .eq("storage_path", file.storage_path)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return;

    const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
      team_id: effectiveTeamId,
      quote_id: task.quoteId,
      file_name: file.file_name,
      mime_type: file.mime_type || null,
      file_size: file.file_size,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: userId ?? null,
    });
    if (insertError) throw insertError;
  };

  const handleUploadDesignOutputs = async (files: FileList | null) => {
    if (!files || files.length === 0 || !task || !effectiveTeamId || !userId || outputUploading) return;
    if (!ensureCanEdit()) return;
    setOutputUploading(true);
    try {
      const uploaded: DesignOutputFile[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const baseName = `${Date.now()}-${safeName}`;
        const candidatePaths = [
          `teams/${effectiveTeamId}/design-outputs/${task.quoteId}/${baseName}`,
          `${effectiveTeamId}/design-outputs/${task.quoteId}/${baseName}`,
          `${userId}/design-outputs/${task.quoteId}/${baseName}`,
        ];

        let storagePath = "";
        let lastError: unknown = null;
        for (const candidate of candidatePaths) {
          const { error: uploadError } = await supabase.storage
            .from(DESIGN_OUTPUT_BUCKET)
            .upload(candidate, file, { upsert: true, contentType: file.type });
          if (!uploadError) {
            storagePath = candidate;
            break;
          }
          lastError = uploadError;
        }
        if (!storagePath) throw lastError ?? new Error(`Не вдалося завантажити файл ${file.name}`);

        const { data: signed } = await supabase.storage
          .from(DESIGN_OUTPUT_BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
        uploaded.push({
          id: crypto.randomUUID(),
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          storage_bucket: DESIGN_OUTPUT_BUCKET,
          storage_path: storagePath,
          uploaded_by: userId,
          created_at: new Date().toISOString(),
          signed_url: signed?.signedUrl ?? null,
        });
      }

      const nextFiles = [...uploaded, ...designOutputFiles];
      await persistDesignOutputs(nextFiles, designOutputLinks);
      setDesignOutputFiles(nextFiles);
      try {
        if (uploaded.length > 0) {
          await syncDesignFileToQuoteVisualizations(uploaded[0]);
        }
      } catch (syncError: unknown) {
        console.warn("Failed to sync design file to quote visualizations", syncError);
      }
      toast.success(`Додано файлів: ${uploaded.length}`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося завантажити файли");
      toast.error(message);
      setError(message);
    } finally {
      setOutputUploading(false);
      if (outputInputRef.current) outputInputRef.current.value = "";
    }
  };

  const openAddDesignLinkModal = () => {
    setAddLinkUrl("https://");
    setAddLinkLabel("");
    setAddLinkError(null);
    setAddLinkOpen(true);
  };

  const handleSubmitDesignLink = async () => {
    if (!task) return;
    if (!ensureCanEdit()) return;
    const trimmedUrl = addLinkUrl.trim();
    if (!trimmedUrl) {
      setAddLinkError("Вставте URL посилання.");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setAddLinkError("Дозволені тільки http/https посилання.");
        return;
      }
      const nextLink: DesignOutputLink = {
        id: crypto.randomUUID(),
        label: addLinkLabel.trim() || parsed.hostname,
        url: parsed.toString(),
        created_at: new Date().toISOString(),
        created_by: userId ?? null,
      };
      const nextLinks = [nextLink, ...designOutputLinks];
      await persistDesignOutputs(designOutputFiles, nextLinks);
      setDesignOutputLinks(nextLinks);
      setAddLinkOpen(false);
      setAddLinkError(null);
      toast.success("Посилання додано");
    } catch {
      setAddLinkError("Некоректний URL.");
    }
  };

  const handleRemoveDesignFile = async (fileId: string) => {
    if (!ensureCanEdit()) return;
    const target = designOutputFiles.find((file) => file.id === fileId);
    if (!target) return;
    try {
      const nextFiles = designOutputFiles.filter((file) => file.id !== fileId);
      await persistDesignOutputs(nextFiles, designOutputLinks);
      setDesignOutputFiles(nextFiles);
      if (target.storage_bucket && target.storage_path) {
        await supabase.storage.from(target.storage_bucket).remove([target.storage_path]);
      }
      toast.success("Файл видалено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося видалити файл"));
    }
  };

  const handleRemoveDesignLink = async (linkId: string) => {
    if (!ensureCanEdit()) return;
    try {
      const nextLinks = designOutputLinks.filter((link) => link.id !== linkId);
      await persistDesignOutputs(designOutputFiles, nextLinks);
      setDesignOutputLinks(nextLinks);
      toast.success("Посилання видалено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося видалити посилання"));
    }
  };

  const handleStartTimer = async () => {
    if (!task || !effectiveTeamId || !userId || timerBusy) return;
    if (!ensureCanEdit()) return;
    if (task.status !== "in_progress") {
      toast.error("Таймер можна запустити тільки у статусі «В роботі».");
      return;
    }
    if (!task.assigneeUserId) {
      toast.error("Спочатку призначте виконавця.");
      return;
    }
    if (task.assigneeUserId !== userId && !canManageAssignments) {
      toast.error("Таймер може запускати виконавець задачі.");
      return;
    }
    setTimerBusy("start");
    try {
      await startDesignTaskTimer({
        teamId: effectiveTeamId,
        taskId: task.id,
        userId,
      });
      await loadTimerSummary(task.id);

      const actorLabel = getMemberLabel(userId);
      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: task.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_task_timer",
        title: "Запустив таймер",
        metadata: {
          source: "design_task_timer",
          timer_action: "start",
        },
      });
      await loadHistory(task.id);
      toast.success("Таймер запущено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося запустити таймер"));
    } finally {
      setTimerBusy(null);
    }
  };

  const handlePauseTimer = async (options?: { silent?: boolean }) => {
    if (!task || !effectiveTeamId || timerBusy) return false;
    if (!ensureCanEdit()) return false;
    setTimerBusy("pause");
    try {
      const wasPaused = await pauseDesignTaskTimer({
        teamId: effectiveTeamId,
        taskId: task.id,
      });
      await loadTimerSummary(task.id);
      if (wasPaused && !options?.silent) {
        const actorLabel = userId ? getMemberLabel(userId) : "System";
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_timer",
          title: "Поставив таймер на паузу",
          metadata: {
            source: "design_task_timer",
            timer_action: "pause",
          },
        });
        await loadHistory(task.id);
        toast.success("Таймер на паузі");
      }
      return wasPaused;
    } catch (e: unknown) {
      if (!options?.silent) toast.error(getErrorMessage(e, "Не вдалося зупинити таймер"));
      return false;
    } finally {
      setTimerBusy(null);
    }
  };

  const updateTaskStatus = async (nextStatus: DesignStatus, options?: { estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || task.status === nextStatus) return;
    if (!ensureCanEdit()) return;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (nextStatus === "in_progress" && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "status", nextStatus });
      return;
    }
    const previousStatus = task.status;
    const previousTask = task;
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? (userId ?? null)
        : ((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? null;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: nextStatus,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      deadline: task.designDeadline ?? null,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    setTask((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            metadata: nextMetadata,
          }
        : prev
    );
    setStatusSaving(nextStatus);

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      if (previousStatus === "in_progress" && nextStatus !== "in_progress") {
        await handlePauseTimer({ silent: true });
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        if (previousStatus === "in_progress" && nextStatus !== "in_progress") {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_timer",
            title: "Таймер зупинено автоматично",
            metadata: {
              source: "design_task_timer",
              timer_action: "auto_pause_on_status_change",
              from_status: previousStatus,
              to_status: nextStatus,
            },
          });
        }
        if (options?.estimateMinutes != null) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_estimate",
            title: `Естімейт: ${formatEstimateMinutes(options.estimateMinutes)}`,
            metadata: {
              source: "design_task_estimate",
              estimate_minutes: options.estimateMinutes,
            },
          });
        }
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_status",
          title: `Статус: ${statusLabels[previousStatus] ?? previousStatus} → ${statusLabels[nextStatus] ?? nextStatus}`,
          metadata: {
            source: "design_task_status",
            from_status: previousStatus,
            to_status: nextStatus,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task status event", logError);
      }

      toast.success(`Статус оновлено: ${statusLabels[nextStatus]}`);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося змінити статус");
      setError(message);
      toast.error(message);
    } finally {
      setStatusSaving(null);
    }
  };

  const updateTaskDeadline = async (nextDate: Date | null) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const previousDeadline = task.designDeadline ?? null;
    const nextDeadline = nextDate ? format(nextDate, "yyyy-MM-dd") : null;
    if (previousDeadline === nextDeadline) return;

    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: task.status,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: nextDeadline,
      deadline: nextDeadline,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
      estimate_minutes: getTaskEstimateMinutes(task),
      estimate_set_at: (task.metadata ?? {}).estimate_set_at ?? null,
      estimated_by_user_id: (task.metadata ?? {}).estimated_by_user_id ?? null,
    };

    const previousTask = task;
    setDeadlineSaving(true);
    setTask((prev) =>
      prev
        ? {
            ...prev,
            designDeadline: nextDeadline,
            metadata: nextMetadata,
          }
        : prev
    );

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_deadline",
          title: `Дедлайн: ${formatDeadlineLabel(previousDeadline)} → ${formatDeadlineLabel(nextDeadline)}`,
          metadata: {
            source: "design_task_deadline",
            from_deadline: previousDeadline,
            to_deadline: nextDeadline,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task deadline event", logError);
      }

      toast.success(nextDeadline ? `Дедлайн оновлено: ${formatDeadlineLabel(nextDeadline)}` : "Дедлайн очищено");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити дедлайн");
      setError(message);
      toast.error(message);
    } finally {
      setDeadlineSaving(false);
      setDeadlinePopoverOpen(false);
      setHeaderDeadlinePopoverOpen(false);
    }
  };

  const applyAssignee = async (nextAssigneeUserId: string | null, options?: { estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || !canManageAssignments) return;
    if (!ensureCanEdit()) return;
    if (nextAssigneeUserId === task.assigneeUserId) return;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (nextAssigneeUserId && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "assign", nextAssigneeUserId });
      return;
    }

    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const nextAssigneeLabel = getMemberLabel(nextAssigneeUserId);
    const nextAssignedAt = nextAssigneeUserId ? new Date().toISOString() : null;
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? (userId ?? null)
        : ((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? null;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: task.status,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      deadline: task.designDeadline ?? null,
      assignee_user_id: nextAssigneeUserId,
      assigned_at: nextAssignedAt,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    const previousTask = task;
    setAssigningMemberId(nextAssigneeUserId ?? "__clear__");
    setTask((prev) =>
      prev
        ? {
            ...prev,
            assigneeUserId: nextAssigneeUserId,
            assignedAt: nextAssignedAt,
            metadata: nextMetadata,
          }
        : prev
    );

    try {
      let query = supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);

      if (!task.assigneeUserId && nextAssigneeUserId) {
        query = query.is("metadata->>assignee_user_id", null);
      }

      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!task.assigneeUserId && nextAssigneeUserId && (!data || data.length === 0)) {
        throw new Error("Цю задачу вже призначив інший користувач. Оновіть дошку.");
      }

      if (previousAssignee !== nextAssigneeUserId) {
        await handlePauseTimer({ silent: true });
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        if (previousAssignee !== nextAssigneeUserId) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_timer",
            title: "Таймер зупинено автоматично",
            metadata: {
              source: "design_task_timer",
              timer_action: "auto_pause_on_reassign",
              from_assignee_user_id: previousAssignee,
              to_assignee_user_id: nextAssigneeUserId,
            },
          });
        }
        if (options?.estimateMinutes != null) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_estimate",
            title: `Естімейт: ${formatEstimateMinutes(options.estimateMinutes)}`,
            metadata: {
              source: "design_task_estimate",
              estimate_minutes: options.estimateMinutes,
            },
          });
        }
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_assignment",
          title: nextAssigneeUserId
            ? `Призначено виконавця: ${nextAssigneeLabel}`
            : `Знято виконавця (${previousAssigneeLabel})`,
          metadata: {
            source: "design_task_assignment",
            from_assignee_user_id: previousAssignee,
            from_assignee_label: previousAssigneeLabel,
            to_assignee_user_id: nextAssigneeUserId,
            to_assignee_label: nextAssigneeUserId ? nextAssigneeLabel : null,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const isLinkedQuoteTask = isUuid(task.quoteId);
      const taskLabel = isLinkedQuoteTask
        ? task.quoteNumber
          ? `#${task.quoteNumber}`
          : task.quoteId.slice(0, 8)
        : `«${task.title ?? task.quoteId.slice(0, 8)}»`;
      try {
        if (nextAssigneeUserId && nextAssigneeUserId !== userId) {
          await notifyUsers({
            userIds: [nextAssigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: isLinkedQuoteTask
              ? `${actorLabel} призначив(ла) вас на задачу по прорахунку ${taskLabel}.`
              : `${actorLabel} призначив(ла) вас на дизайн-задачу ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "info",
          });
        }
        if (previousAssignee && previousAssignee !== userId && previousAssignee !== nextAssigneeUserId) {
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: isLinkedQuoteTask
              ? `${actorLabel} зняв(ла) вас із задачі по прорахунку ${taskLabel}.`
              : `${actorLabel} зняв(ла) вас із дизайн-задачі ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }
      } catch (notifyError) {
        console.warn("Failed to send design task assignment notification", notifyError);
      }

      await loadHistory(task.id);
      toast.success(nextAssigneeUserId ? `Виконавця змінено: ${getMemberLabel(nextAssigneeUserId)}` : "Виконавця знято");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити виконавця");
      setError(message);
      toast.error(message);
    } finally {
      setAssigningMemberId(null);
    }
  };

  const applyManager = async (nextManagerUserId: string | null) => {
    if (!task || !effectiveTeamId || managerSaving) return;
    if (!ensureCanEdit()) return;
    const previousManagerUserId =
      typeof task.metadata?.manager_user_id === "string" && task.metadata.manager_user_id
        ? (task.metadata.manager_user_id as string)
        : null;
    if (previousManagerUserId === nextManagerUserId) return;

    const previousManagerLabel =
      (typeof task.metadata?.manager_label === "string" && task.metadata.manager_label.trim()) ||
      (previousManagerUserId ? getMemberLabel(previousManagerUserId) : "Не вказано");
    const nextManagerLabel = nextManagerUserId ? getMemberLabel(nextManagerUserId) : "Не вказано";
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      manager_user_id: nextManagerUserId,
      manager_label: nextManagerUserId ? nextManagerLabel : null,
    };

    const previousTask = task;
    setManagerSaving(true);
    setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_manager",
          title: `Менеджер: ${previousManagerLabel} → ${nextManagerLabel}`,
          metadata: {
            source: "design_task_manager",
            from_manager_user_id: previousManagerUserId,
            from_manager_label: previousManagerLabel,
            to_manager_user_id: nextManagerUserId,
            to_manager_label: nextManagerLabel,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log manager update", logError);
      }

      toast.success(nextManagerUserId ? `Менеджера змінено: ${nextManagerLabel}` : "Менеджера очищено");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити менеджера");
      setError(message);
      toast.error(message);
    } finally {
      setManagerSaving(false);
    }
  };

  const assignTaskToMe = async (options?: { alsoStart?: boolean; estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || !userId || !canSelfAssign || isAssignedToMe || assigningSelf) return;
    if (!ensureCanEdit()) return;
    if (!canManageAssignments && task.assigneeUserId && task.assigneeUserId !== userId) {
      toast.error("Задача вже призначена іншому дизайнеру");
      return;
    }
    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const alsoStart = !!options?.alsoStart;
    const nextStatus: DesignStatus =
      alsoStart && (task.status === "new" || task.status === "changes") ? "in_progress" : task.status;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (!existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "assign_self", alsoStart });
      return;
    }
    setAssigningSelf(true);
    const nextAssignedAt = new Date().toISOString();
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? userId
        : (((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? userId);
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: nextStatus,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      deadline: task.designDeadline ?? null,
      assignee_user_id: userId,
      assigned_at: nextAssignedAt,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    const previousTask = task;
    setTask((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            assigneeUserId: userId,
            assignedAt: nextAssignedAt,
            metadata: nextMetadata,
          }
        : prev
    );

    try {
      let query = supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);

      if (!task.assigneeUserId) {
        // Use ->> so JSON null is treated as SQL NULL in PostgREST filtering.
        query = query.is("metadata->>assignee_user_id", null);
      }

      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!task.assigneeUserId && (!data || data.length === 0)) {
        throw new Error("Цю задачу вже призначив інший користувач. Оновіть дошку.");
      }

      if (previousAssignee && previousAssignee !== userId) {
        await handlePauseTimer({ silent: true });
      }

      const actorLabel = getMemberLabel(userId);
      try {
        if (previousAssignee && previousAssignee !== userId) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_timer",
            title: "Таймер зупинено автоматично",
            metadata: {
              source: "design_task_timer",
              timer_action: "auto_pause_on_takeover",
              from_assignee_user_id: previousAssignee,
              to_assignee_user_id: userId,
            },
          });
        }
        if (options?.estimateMinutes != null) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_estimate",
            title: `Естімейт: ${formatEstimateMinutes(options.estimateMinutes)}`,
            metadata: {
              source: "design_task_estimate",
              estimate_minutes: options.estimateMinutes,
            },
          });
        }
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_assignment",
          title: `Призначено виконавця: ${getMemberLabel(userId)}`,
          metadata: {
            source: "design_task_assignment",
            from_assignee_user_id: previousAssignee,
            from_assignee_label: previousAssigneeLabel,
            to_assignee_user_id: userId,
            to_assignee_label: getMemberLabel(userId),
          },
        });

        if (nextStatus !== task.status) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_status",
            title: `Статус: ${statusLabels[task.status] ?? task.status} → ${statusLabels[nextStatus] ?? nextStatus}`,
            metadata: {
              source: "design_task_status",
              from_status: task.status,
              to_status: nextStatus,
            },
          });
        }

        if (previousAssignee && previousAssignee !== userId) {
          const isLinkedQuoteTask = isUuid(task.quoteId);
          const taskLabel = isLinkedQuoteTask
            ? task.quoteNumber
              ? `#${task.quoteNumber}`
              : task.quoteId.slice(0, 8)
            : `«${task.title ?? task.quoteId.slice(0, 8)}»`;
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: isLinkedQuoteTask
              ? `${actorLabel} зняв(ла) вас із задачі по прорахунку ${taskLabel}.`
              : `${actorLabel} зняв(ла) вас із дизайн-задачі ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }

        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log/notify assignment", logError);
      }

      toast.success(
        nextStatus !== task.status
          ? "Задача призначена на вас і переведена в статус «В роботі»"
          : "Задача призначена на вас"
      );
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося призначити задачу");
      toast.error(message);
      setError(message);
    } finally {
      setAssigningSelf(false);
    }
  };

  const openManualEstimateDialog = () => {
    const currentEstimate = getTaskEstimateMinutes(task);
    if (currentEstimate && currentEstimate % 480 === 0) {
      setEstimateInput(String(currentEstimate / 480));
      setEstimateUnit("days");
    } else if (currentEstimate && currentEstimate % 60 === 0) {
      setEstimateInput(String(currentEstimate / 60));
      setEstimateUnit("hours");
    } else if (currentEstimate) {
      setEstimateInput(String(currentEstimate));
      setEstimateUnit("minutes");
    } else {
      setEstimateInput("2");
      setEstimateUnit("hours");
    }
    setEstimateError(null);
    setEstimatePendingAction({ mode: "manual" });
    setEstimateDialogOpen(true);
  };

  const updateTaskEstimate = async (estimateMinutes: number) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const previousEstimate = getTaskEstimateMinutes(task);
    const previousTask = task;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      estimate_minutes: estimateMinutes,
      estimate_set_at: new Date().toISOString(),
      estimated_by_user_id: userId ?? null,
    };

    setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: task.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_task_estimate",
        title: previousEstimate
          ? `Естімейт: ${formatEstimateMinutes(previousEstimate)} → ${formatEstimateMinutes(estimateMinutes)}`
          : `Естімейт: ${formatEstimateMinutes(estimateMinutes)}`,
        metadata: {
          source: "design_task_estimate",
          from_estimate_minutes: previousEstimate,
          to_estimate_minutes: estimateMinutes,
        },
      });
      await loadHistory(task.id);
      toast.success(previousEstimate ? "Естімейт оновлено" : "Естімейт встановлено");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити естімейт");
      setError(message);
      toast.error(message);
    }
  };

  const submitEstimateDialog = async () => {
    if (!estimatePendingAction) return;
    const amount = Number(estimateInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEstimateError("Вкажіть коректний естімейт.");
      return;
    }
    const unitMultiplier = estimateUnit === "minutes" ? 1 : estimateUnit === "hours" ? 60 : 480;
    const normalized = Math.round(amount * unitMultiplier);
    setEstimateError(null);
    setEstimateDialogOpen(false);

    if (estimatePendingAction.mode === "assign") {
      await applyAssignee(estimatePendingAction.nextAssigneeUserId, { estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "assign_self") {
      await assignTaskToMe({ alsoStart: estimatePendingAction.alsoStart, estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "status") {
      await updateTaskStatus(estimatePendingAction.nextStatus, { estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "manual") {
      await updateTaskEstimate(normalized);
    }
    setEstimatePendingAction(null);
  };

  const requestDeleteTask = () => {
    if (!canManageAssignments) {
      toast.error("Немає прав для видалення задачі");
      return;
    }
    setDeleteDialogOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!task || !effectiveTeamId || !canManageAssignments || deletingTask) return;
    if (!ensureCanEdit()) return;
    setDeletingTask(true);
    try {
      const { error: taskDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("id", task.id)
        .eq("action", "design_task");
      if (taskDeleteError) throw taskDeleteError;

      const { error: historyDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", task.id);
      if (historyDeleteError) {
        console.warn("Failed to delete design task history events", historyDeleteError);
      }

      setDeleteDialogOpen(false);
      toast.success("Задачу видалено");
      navigate("/design", { replace: true });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити задачу");
      setError(message);
      toast.error(message);
    } finally {
      setDeletingTask(false);
    }
  };

  const isStatusStartable = task?.status === "new" || task?.status === "changes";
  const isAssignedToOther = !!task?.assigneeUserId && !!userId && task.assigneeUserId !== userId;
  const canTakeOverForSelf =
    !!task &&
    canSelfAssign &&
    !assigningSelf &&
    (!task.assigneeUserId || task.assigneeUserId === userId || canManageAssignments);

  const canStartWorkNow =
    !!task &&
    isStatusStartable &&
    !statusSaving &&
    (!!isAssignedToMe || canManageAssignments);

  let primaryActionLabel = "Взяти в роботу";
  let primaryActionHint: ReactNode = "Призначити задачу на себе.";
  let primaryActionDisabled = true;
  const primaryActionLoading = assigningSelf || statusSaving === "in_progress";
  let primaryActionClick: (() => void) | null = null;

  if (task) {
    if (!task.assigneeUserId && isStatusStartable) {
      primaryActionLabel = "Взяти на себе і почати";
      primaryActionHint = "Крок 1: призначити себе. Крок 2: змінити статус на «В роботі».";
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe({ alsoStart: true });
      };
    } else if (!task.assigneeUserId) {
      primaryActionLabel = "Взяти на себе";
      primaryActionHint = "Призначити задачу на себе без зміни статусу.";
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe();
      };
    } else if (isAssignedToMe && isStatusStartable) {
      primaryActionLabel = task.status === "changes" ? "Почати правки" : "Почати роботу";
      primaryActionHint = "Змінити статус на «В роботі».";
      primaryActionDisabled = !canStartWorkNow;
      primaryActionClick = () => {
        void updateTaskStatus("in_progress");
      };
    } else if (isAssignedToMe) {
      primaryActionLabel = "Задача на мені";
      primaryActionHint = "Виконавець уже встановлений.";
      primaryActionDisabled = true;
      primaryActionClick = null;
    } else if (isAssignedToOther && !canManageAssignments) {
      primaryActionLabel = "Вже призначено";
      primaryActionHint = (
        <span className="inline-flex items-center gap-1.5">
          <span>Виконавець:</span>
          <AvatarBase
            src={getMemberAvatar(task.assigneeUserId)}
            name={getMemberLabel(task.assigneeUserId)}
            fallback={getInitials(getMemberLabel(task.assigneeUserId))}
            size={14}
            className="shrink-0 border-border/70"
          />
          <span>{getMemberLabel(task.assigneeUserId)}</span>
        </span>
      );
      primaryActionDisabled = true;
      primaryActionClick = null;
    } else if (isAssignedToOther && canManageAssignments) {
      primaryActionLabel = "Призначити себе";
      primaryActionHint = (
        <span className="inline-flex items-center gap-1.5">
          <span>Зараз виконавець:</span>
          <AvatarBase
            src={getMemberAvatar(task.assigneeUserId)}
            name={getMemberLabel(task.assigneeUserId)}
            fallback={getInitials(getMemberLabel(task.assigneeUserId))}
            size={14}
            className="shrink-0 border-border/70"
          />
          <span>{getMemberLabel(task.assigneeUserId)}</span>
        </span>
      );
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe();
      };
    }
  }

  const mobileSecondaryAction =
    quickActions.find((action) => !(isStatusStartable && action.next === "in_progress")) ?? null;
  const statusQuickActionsWithoutStart = quickActions.filter(
    (action) => !(isStatusStartable && action.next === "in_progress")
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Завантаження...
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6 text-destructive">
        Помилка: {error ?? "Задачу не знайдено"}
      </div>
    );
  }

  const isLinkedQuote = isUuid(task.quoteId);
  const taskHeaderTitle = task.quoteNumber ?? task.title ?? task.quoteId;
  const taskHeaderSubtitle = isLinkedQuote
    ? `${task.customerName ?? "Клієнт"} · ${quoteItem?.name ?? "Позиція"}`
    : `${task.customerName ?? "Клієнт"} · Дизайн-задача без прорахунку`;
  const taskManagerUserId =
    typeof task.metadata?.manager_user_id === "string" && task.metadata.manager_user_id
      ? (task.metadata.manager_user_id as string)
      : null;
  const taskManagerLabel =
    (typeof task.metadata?.manager_label === "string" && task.metadata.manager_label.trim()) ||
    (taskManagerUserId ? getMemberLabel(taskManagerUserId) : "Не вказано");
  const taskManagerAvatar = taskManagerUserId ? getMemberAvatar(taskManagerUserId) : null;

  return (
    <div className="w-full max-w-none px-0 pb-20 md:pb-0 space-y-4">
      <EntityHeader
        topBar={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/design")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              До дошки
            </Button>
            <Badge variant="outline" className="gap-1 text-xs">
              <Palette className="h-3.5 w-3.5" />
              Дизайн задача
            </Badge>
          </>
        }
        title={taskHeaderTitle}
        subtitle={taskHeaderSubtitle}
        viewers={<EntityViewersBar entries={designTaskViewers} label="Переглядають задачу" />}
        meta={
          <>
            <Badge className={cn("px-2.5 py-1 text-xs font-semibold", statusColors[task.status])}>
              {statusLabels[task.status]}
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 text-xs gap-1.5">
              <AvatarBase
                src={getMemberAvatar(task.assigneeUserId)}
                name={getMemberLabel(task.assigneeUserId)}
                fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                size={16}
                className="border-border/70"
              />
              <span className="truncate max-w-[160px]">{getMemberLabel(task.assigneeUserId)}</span>
            </Badge>
            <Popover open={headerDeadlinePopoverOpen} onOpenChange={setHeaderDeadlinePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("h-7 px-2.5 text-xs gap-1", deadlineLabel.className)}
                  disabled={deadlineSaving || designTaskLockedByOther}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Дедлайн: {deadlineLabel.label}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toLocalDate(task.designDeadline)}
                  onSelect={(date) => {
                    if (!date) return;
                    void updateTaskDeadline(date);
                  }}
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear() - 3}
                  toYear={new Date().getFullYear() + 5}
                  initialFocus
                />
                <DateQuickActions
                  onSelect={(date) => {
                    void updateTaskDeadline(date ?? null);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Badge
              variant="outline"
              className={cn(
                "px-2.5 py-1 text-xs gap-1",
                isTimerRunning ? "border-success-soft-border text-success-foreground bg-success-soft" : ""
              )}
            >
              <Timer className="h-3.5 w-3.5" />
              {timerElapsedLabel}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              disabled={designTaskLockedByOther}
              onClick={() => void openManualEstimateDialog()}
            >
              <Clock className="h-3.5 w-3.5" />
              {estimateLabel === "Не вказано" ? "Додати естімейт" : `Естімейт: ${estimateLabel}`}
            </Button>
          </>
        }
        actions={
          <>
            {isLinkedQuote ? (
              <Button variant="outline" className="gap-2" onClick={() => navigate(`/orders/estimates/${task.quoteId}`)}>
                <ExternalLink className="h-4 w-4" />
                Відкрити прорахунок
              </Button>
            ) : null}
            <Button disabled={primaryActionDisabled || designTaskLockedByOther} onClick={primaryActionClick ?? undefined}>
              {primaryActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryActionLabel}
            </Button>
          </>
        }
        hint={primaryActionHint}
      />

      {designTaskLockedByOther ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span className="font-medium">Режим лише перегляду.</span>{" "}
          ТЗ редагує {designTaskLock.holderName ?? "інший користувач"}.
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.15fr)_minmax(320px,1fr)] gap-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Бриф задачі</div>
              {isLinkedQuote && quantityLabel !== "Не вказано" ? (
                <Badge variant="outline" className="text-xs">
                  {quantityLabel}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">Клієнт</div>
                <div className="flex items-center gap-2.5">
                  <AvatarBase
                    src={task.customerLogoUrl ?? null}
                    name={task.customerName ?? undefined}
                    fallback={getInitials(task.customerName)}
                    size={28}
                    className="border-border/70"
                  />
                  <div className="font-medium">{task.customerName ?? "Не вказано"}</div>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">Менеджер</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <AvatarBase
                      src={taskManagerAvatar}
                      name={taskManagerLabel}
                      fallback={getInitials(taskManagerLabel)}
                      size={28}
                      className="border-border/70"
                    />
                    <div className="font-medium">{taskManagerLabel}</div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={managerSaving || designTaskLockedByOther || managerMembers.length === 0}
                      >
                        {managerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Змінити менеджера
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel>Відповідальний менеджер</DropdownMenuLabel>
                      {managerMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          onClick={() => void applyManager(member.id)}
                          disabled={taskManagerUserId === member.id || managerSaving}
                          className="gap-2"
                        >
                          <AvatarBase
                            src={getMemberAvatar(member.id)}
                            name={member.label}
                            fallback={getInitials(member.label)}
                            size={18}
                            className="shrink-0 border-border/70"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <span className="truncate">{member.label}</span>
                          <Check
                            className={cn(
                              "ml-auto h-3.5 w-3.5 text-primary",
                              taskManagerUserId === member.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void applyManager(null)}
                        disabled={!taskManagerUserId || managerSaving}
                      >
                        <span className="truncate">Очистити менеджера</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {isLinkedQuote ? (
                <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Позиція</div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-md border border-border/60 bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                      {productPreviewUrl ? (
                        <img
                          src={productPreviewUrl}
                          alt={quoteItem?.name ?? "Товар"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="font-medium">{quoteItem?.name ?? "Не вказано"}</div>
                  </div>
                </div>
              ) : null}
              {isLinkedQuote ? (
                <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Прорахунок</div>
                  <div className="font-mono font-medium">{task.quoteNumber ?? task.quoteId.slice(0, 8)}</div>
                </div>
              ) : null}
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">Створено</div>
                <div className="font-medium">{formatDate(task.createdAt, true)}</div>
              </div>
            </div>
            {task.status === "changes" ? (
              <div className="rounded-lg border border-warning-soft-border bg-warning-soft p-3 text-sm text-warning-foreground">
                {task.title ?? "Клієнт надіслав правки, перевірте деталі та оновіть макет."}
              </div>
            ) : null}
            <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
              <div className="text-xs text-muted-foreground mb-1">ТЗ для дизайнера</div>
              {task.designBrief ? (
                <div className="text-sm whitespace-pre-wrap">{task.designBrief}</div>
              ) : (
                <div className="text-sm text-muted-foreground">ТЗ поки не заповнено.</div>
              )}
            </div>
          </div>

          {isLinkedQuote ? (
            <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Нанесення</div>
                {task.methodsCount ? <Badge variant="outline">{task.methodsCount} нанес.</Badge> : null}
              </div>
              {methods.length > 0 ? (
                <div className="space-y-2">
                  {methods.map((method, idx) => (
                    <div key={idx} className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm">
                      <div className="font-medium">Метод {idx + 1}: {getMethodLabel(method.method_id ?? null)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                      Позиція: {getPrintPositionLabel(method.print_position_id ?? null)} · Розмір: {method.print_width_mm ?? "не вказано"} ×{" "}
                      {method.print_height_mm ?? "не вказано"} мм
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                  Немає даних про нанесення для цієї задачі.
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Результат дизайнера</div>
              <Badge variant="outline" className="text-xs">
                {designOutputFiles.length + designOutputLinks.length} матеріалів
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={outputInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.ai,.svg,.eps,.cdr,.png,.jpg,.jpeg,.psd,.tiff,.zip,.rar,.doc,.docx,.xls,.xlsx"
                onChange={(event) => void handleUploadDesignOutputs(event.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={outputUploading || outputSaving}
                onClick={() => outputInputRef.current?.click()}
              >
                {outputUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Завантажити макет
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                disabled={outputSaving}
                onClick={openAddDesignLinkModal}
              >
                <Link2 className="h-4 w-4" />
                Додати посилання
              </Button>
            </div>

            {designOutputFiles.length === 0 && designOutputLinks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 px-3 py-3 text-sm text-muted-foreground">
                Додайте файл макета або посилання на Figma/Drive. Тут зберігається фінальна видача дизайну.
              </div>
            ) : (
              <div className="space-y-2">
                {designOutputFiles.map((file) => {
                  const isImage = isImageAttachment(file.file_name);
                  const ext = getFileExtension(file.file_name);
                  const fileUrl = resolveAttachmentUrl(file);
                  return (
                    <div key={file.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2.5">
                          {isImage && fileUrl ? (
                            <img
                              src={fileUrl}
                              alt={file.file_name}
                              className="h-11 w-11 rounded-md border border-border/60 object-cover shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-md border border-border/60 bg-muted/30 text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
                              {ext}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={file.file_name}>
                              {file.file_name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                              <span>{formatFileSize(file.file_size)}</span>
                              <span>·</span>
                              <span>{formatDate(file.created_at, true)}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <AvatarBase
                                  src={file.uploaded_by ? getMemberAvatar(file.uploaded_by) : null}
                                  name={file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий"}
                                  fallback={getInitials(file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий")}
                                  size={14}
                                  className="shrink-0 border-border/70"
                                />
                                <span>{file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий"}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {fileUrl ? (
                            <>
                              <Button size="icon" variant="ghost" asChild>
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer" aria-label="Переглянути файл">
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button size="icon" variant="ghost" asChild>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={file.file_name}
                                  aria-label="Завантажити файл"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" disabled>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled>
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={outputSaving}
                            onClick={() => void handleRemoveDesignFile(file.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {designOutputLinks.map((link) => (
                  <div key={link.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 text-sm font-medium text-primary hover:underline truncate"
                        title={link.url}
                      >
                        {link.label}
                      </a>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" asChild>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Відкрити посилання">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={outputSaving}
                          onClick={() => void handleRemoveDesignLink(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                      <span>{formatDate(link.created_at, true)}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <AvatarBase
                          src={link.created_by ? getMemberAvatar(link.created_by) : null}
                          name={link.created_by ? getMemberLabel(link.created_by) : "Невідомий"}
                          fallback={getInitials(link.created_by ? getMemberLabel(link.created_by) : "Невідомий")}
                          size={14}
                          className="shrink-0 border-border/70"
                        />
                        <span>{link.created_by ? getMemberLabel(link.created_by) : "Невідомий"}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-xs text-muted-foreground">
              Рекомендація: додавайте 1) прев’ю PNG/JPG + 2) робочий файл (AI/PSD/SVG) + 3) лінк на Figma.
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 self-start">
          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Швидкі дії</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {allStatuses.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      disabled={task.status === status || !!statusSaving}
                      onClick={() => void updateTaskStatus(status)}
                    >
                      {statusLabels[status]}
                    </DropdownMenuItem>
                  ))}
                  {canManageAssignments ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={deletingTask}
                        onClick={() => requestDeleteTask()}
                      >
                        {deletingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Видалити задачу
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Крок 1. Виконавець</div>
              {task.assigneeUserId ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-2">
                  <AvatarBase
                    src={getMemberAvatar(task.assigneeUserId)}
                    name={getMemberLabel(task.assigneeUserId)}
                    fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                    size={24}
                    className="shrink-0"
                  />
                  <div className="font-medium truncate">{getMemberLabel(task.assigneeUserId)}</div>
                </div>
              ) : (
                <div className="font-medium text-muted-foreground">Без виконавця</div>
              )}
              {!task.assigneeUserId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={!canTakeOverForSelf}
                  onClick={() => void assignTaskToMe()}
                >
                  {assigningSelf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Призначити себе
                </Button>
              ) : null}
              {canManageAssignments ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      disabled={!!assigningMemberId}
                    >
                      {assigningMemberId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Призначити дизайнеру
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Дизайнери</DropdownMenuLabel>
                    {designerMembers.length === 0 ? (
                      <DropdownMenuItem disabled>Немає дизайнерів</DropdownMenuItem>
                    ) : (
                      designerMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          onClick={() => void applyAssignee(member.id)}
                          disabled={task.assigneeUserId === member.id}
                        >
                          {member.label}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void applyAssignee(null)} disabled={!task.assigneeUserId}>
                      Зняти виконавця
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Крок 2. Статус задачі</div>
              <div className="font-medium">{statusLabels[task.status]}</div>
              {isStatusStartable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-full justify-start"
                  disabled={!canStartWorkNow}
                  onClick={() => void updateTaskStatus("in_progress")}
                >
                  {statusSaving === "in_progress" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {task.status === "changes" ? "Почати правки (В роботі)" : "Почати роботу (В роботі)"}
                </Button>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Дедлайн задачі</div>
              <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={deadlineSaving}
                  >
                    <CalendarClock className="h-4 w-4 mr-1" />
                    {task.designDeadline
                      ? format(toLocalDate(task.designDeadline) ?? new Date(task.designDeadline), "d MMM yyyy", { locale: uk })
                      : "Оберіть дедлайн"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toLocalDate(task.designDeadline)}
                    onSelect={(date) => {
                      if (!date) return;
                      void updateTaskDeadline(date);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 3}
                    toYear={new Date().getFullYear() + 5}
                    initialFocus
                  />
                  <DateQuickActions
                    onSelect={(date) => {
                      void updateTaskDeadline(date ?? null);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {task.designDeadline ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground"
                  disabled={deadlineSaving}
                  onClick={() => void updateTaskDeadline(null)}
                >
                  Очистити дедлайн
                </Button>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Крок 3. Таймер роботи</div>
              <div className="font-mono text-lg font-semibold tracking-wide">{timerElapsedLabel}</div>
              <div className="text-xs text-muted-foreground">
                {isTimerRunning
                  ? `Таймер активний${timerSummary.activeUserId ? ` · ${getMemberLabel(timerSummary.activeUserId)}` : ""}`
                  : "Таймер зупинено"}
              </div>
              {startTimerBlockedReason && !isTimerRunning ? (
                <div className="text-[11px] text-warning-foreground">{startTimerBlockedReason}</div>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 justify-start"
                  disabled={!canStartTimer || !!timerBusy}
                  title={startTimerBlockedReason ?? undefined}
                  onClick={() => void handleStartTimer()}
                >
                  {timerBusy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Play
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 justify-start"
                  disabled={!canPauseTimer || !!timerBusy}
                  title={pauseTimerBlockedReason ?? undefined}
                  onClick={() => void handlePauseTimer()}
                >
                  {timerBusy === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  Pause
                </Button>
              </div>
            </div>

            {statusQuickActionsWithoutStart.length === 0 ? (
              <div className="text-sm text-muted-foreground">Для цього статусу немає швидких переходів.</div>
            ) : (
              <div className="space-y-2">
                {statusQuickActionsWithoutStart.map((action) => (
                  <Button
                    key={`${task.status}-${action.next}`}
                    variant="secondary"
                    className="w-full justify-start"
                    disabled={!!statusSaving}
                    onClick={() => void updateTaskStatus(action.next)}
                  >
                    {statusSaving === action.next ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {isLinkedQuote ? "Файли від замовника" : "Файли до ТЗ"}
            </div>
            {attachments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                Немає вкладень
              </div>
            ) : (
              <div className="space-y-2.5">
                {attachments.map((file) => {
                  const isImage = isImageAttachment(file.file_name);
                  const extension = getFileExtension(file.file_name);
                  const fileUrl = resolveAttachmentUrl(file);
                  return (
                    <div key={file.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2.5">
                          {isImage && fileUrl ? (
                            <img
                              src={fileUrl}
                              alt={file.file_name ?? "preview"}
                              className="h-11 w-11 rounded-md border border-border/60 object-cover shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-md border border-border/60 bg-muted/30 text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
                              {extension}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={file.file_name ?? ""}>
                              {file.file_name ?? "Файл"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                              <span>{formatFileSize(file.file_size)}</span>
                              <span>·</span>
                              <span>{formatDate(file.created_at, true)}</span>
                              {file.uploaded_by ? (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <AvatarBase
                                      src={getMemberAvatar(file.uploaded_by)}
                                      name={getMemberLabel(file.uploaded_by)}
                                      fallback={getInitials(getMemberLabel(file.uploaded_by))}
                                      size={14}
                                      className="shrink-0 border-border/70"
                                    />
                                    <span>{getMemberLabel(file.uploaded_by)}</span>
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {fileUrl ? (
                            <>
                              <Button size="icon" variant="ghost" asChild>
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer" aria-label="Переглянути файл">
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button size="icon" variant="ghost" asChild>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={file.file_name ?? undefined}
                                  aria-label="Завантажити файл"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" disabled>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled>
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Інформація</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Клієнт</span>
                <span className="font-medium text-right">{task.customerName ?? "Не вказано"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  {isLinkedQuote ? "Прорахунок" : "Контекст"}
                </span>
                <span className="font-medium text-right">
                  {isLinkedQuote ? task.quoteNumber ?? task.quoteId.slice(0, 8) : "Без прорахунку"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Виконавець</span>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <AvatarBase
                    src={getMemberAvatar(task.assigneeUserId)}
                    name={getMemberLabel(task.assigneeUserId)}
                    fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                    size={16}
                    className="shrink-0 border-border/70"
                  />
                  <span className="font-medium text-right truncate max-w-[180px]">{getMemberLabel(task.assigneeUserId)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Менеджер</span>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <AvatarBase
                    src={taskManagerAvatar}
                    name={taskManagerLabel}
                    fallback={getInitials(taskManagerLabel)}
                    size={16}
                    className="shrink-0 border-border/70"
                  />
                  <span className="font-medium text-right truncate max-w-[180px]">{taskManagerLabel}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Призначено</span>
                <span className="font-medium text-right">{formatDate(task.assignedAt, true)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Витрачено часу</span>
                <span className="font-mono font-medium text-right">{timerElapsedLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Створено</span>
                <span className="font-medium text-right">{formatDate(task.createdAt, true)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Історія задачі</div>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Завантаження історії...
              </div>
            ) : historyGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground">Подій ще немає</div>
            ) : (
              <div className="space-y-4">
                {historyError ? <div className="text-xs text-destructive">{historyError}</div> : null}
                {historyGroups.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="space-y-3">
                      {group.items.map((event) => {
                        const Icon = event.icon;
                        return (
                          <div key={event.id} className="flex items-start gap-2.5">
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full border flex items-center justify-center shrink-0",
                                event.accentClass
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium">{event.title}</div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatActivityClock(event.created_at)}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                                <AvatarBase
                                  src={event.actorUserId ? getMemberAvatar(event.actorUserId) : null}
                                  name={event.actorLabel}
                                  fallback={getInitials(event.actorLabel)}
                                  size={14}
                                  className="shrink-0 border-border/70"
                                />
                                <span>{event.actorLabel}</span>
                              </div>
                              {event.description ? (
                                <div className="text-xs text-muted-foreground mt-1">{event.description}</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Коментарі та згадки</div>
            {isLinkedQuote ? (
              <>
                {quoteMentionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Завантаження згадок...
                  </div>
                ) : quoteMentionsError ? (
                  <div className="text-sm text-destructive">{quoteMentionsError}</div>
                ) : quoteMentionComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Поки немає згадок у коментарях цього прорахунку.</p>
                ) : (
                  <div className="space-y-2">
                    {quoteMentionComments.slice(0, 5).map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <AvatarBase
                            src={getMemberAvatar(comment.created_by)}
                            name={getMemberLabel(comment.created_by)}
                            fallback={getInitials(getMemberLabel(comment.created_by))}
                            size={14}
                            className="shrink-0 border-border/70"
                          />
                          <span>{getMemberLabel(comment.created_by)}</span>
                          <span>·</span>
                          <span>{formatDate(comment.created_at, true)}</span>
                        </div>
                        <div className="mt-1 text-sm whitespace-pre-wrap line-clamp-3">{comment.body}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/orders/estimates/${task.quoteId}`)}>
                  <ExternalLink className="h-4 w-4" />
                  Відкрити коментарі прорахунку
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Для standalone задачі обговорення ведіть у ТЗ цієї задачі та в історії змін.
              </p>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={estimateDialogOpen}
        onOpenChange={(open) => {
          setEstimateDialogOpen(open);
          if (!open) {
            setEstimateError(null);
            setEstimatePendingAction(null);
          }
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Вкажіть естімейт задачі</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-estimate-value">Естімейт</Label>
            <div className="grid grid-cols-[1fr_150px] gap-2">
              <Input
                id="task-estimate-value"
                type="number"
                min={0.25}
                step={0.25}
                value={estimateInput}
                onChange={(event) => setEstimateInput(event.target.value)}
                placeholder="Напр. 2"
              />
              <Select value={estimateUnit} onValueChange={(value) => setEstimateUnit(value as "minutes" | "hours" | "days")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Хвилини</SelectItem>
                  <SelectItem value="hours">Години</SelectItem>
                  <SelectItem value="days">Дні</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Потрібно вказати естімейт, щоб призначити виконавця або почати роботу. 1 день = 8 годин.
            </p>
            {estimateError ? <p className="text-sm text-destructive">{estimateError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstimateDialogOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void submitEstimateDialog()}>Зберегти естімейт</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addLinkOpen}
        onOpenChange={(open) => {
          setAddLinkOpen(open);
          if (!open) setAddLinkError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Додати посилання на макет</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="design-link-url">URL</Label>
              <Input
                id="design-link-url"
                value={addLinkUrl}
                onChange={(event) => {
                  setAddLinkUrl(event.target.value);
                  if (addLinkError) setAddLinkError(null);
                }}
                onBlur={() => {
                  if (addLinkLabel.trim()) return;
                  try {
                    const parsed = new URL(addLinkUrl.trim());
                    if (parsed.hostname) setAddLinkLabel(parsed.hostname);
                  } catch {
                    // ignore invalid URL while typing
                  }
                }}
                placeholder="https://www.figma.com/file/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="design-link-label">Назва (опціонально)</Label>
              <Input
                id="design-link-label"
                value={addLinkLabel}
                onChange={(event) => setAddLinkLabel(event.target.value)}
                placeholder="Figma · Головний макет"
              />
            </div>
            {addLinkError ? <div className="text-sm text-destructive">{addLinkError}</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLinkOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void handleSubmitDesignLink()} disabled={outputSaving}>
              {outputSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Видалити дизайн-задачу?"
        description={
          isLinkedQuote
            ? `Задача по прорахунку ${task.quoteNumber ?? task.quoteId.slice(0, 8)} буде видалена без можливості відновлення.`
            : `Дизайн-задача «${task.title ?? task.quoteId.slice(0, 8)}» буде видалена без можливості відновлення.`
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={deletingTask}
        onConfirm={() => void handleDeleteTask()}
      />

      <div className="sticky bottom-3 z-10 xl:hidden flex flex-wrap gap-2 border border-border/60 bg-card/90 backdrop-blur rounded-lg px-3 py-2 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={primaryActionDisabled}
          onClick={primaryActionClick ?? undefined}
        >
          {primaryActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {primaryActionLabel}
        </Button>
        {mobileSecondaryAction ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={!!statusSaving}
            onClick={() => void updateTaskStatus(mobileSecondaryAction.next)}
          >
            {statusSaving === mobileSecondaryAction.next ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mobileSecondaryAction.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
