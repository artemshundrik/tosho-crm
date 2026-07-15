import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Calculator,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  ListChecks,
  Mail,
  Megaphone,
  Palette,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { usePageCache } from "@/hooks/usePageCache";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import {
  parseStoredDesignOutputFiles,
  type StoredDesignOutputFile,
  type StoredDesignOutputKind,
} from "@/lib/designTaskOutputSync";
import { DESIGN_STATUS_LABELS, type DesignStatus } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_LABELS, parseDesignTaskType, type DesignTaskType } from "@/lib/designTaskType";
import {
  getSignedAttachmentDownloadUrl,
  getSignedAttachmentUrl,
  isServerPreviewableStoragePath,
} from "@/lib/attachmentPreview";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { StackHoverPreview } from "@/components/app/StackHoverPreview";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { IconInput } from "@/components/ui/icon-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TOOLBAR_CONTROL } from "@/components/ui/controlStyles";

// =======================
// Types
// =======================

type MarketingStatus = "new" | "in_progress" | "review" | "ready" | "shot";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type MarketingRecord = {
  id: string | null;
  status: MarketingStatus;
  tags: string[];
  checklist: ChecklistItem[];
  notes: string;
  isFavorite: boolean;
  isHidden: boolean;
};

type CustomerInfo = {
  name: string;
  logoUrl: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

type GalleryVisual = {
  key: string;
  taskId: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  bucket: string;
  path: string;
  createdAt: string;
  outputKind: StoredDesignOutputKind | null;
  isPreviewable: boolean;
  taskTitle: string;
  taskStatus: DesignStatus | null;
  taskType: DesignTaskType | null;
  taskCreatedAt: string;
  customerId: string | null;
  customerType: "customer" | "lead";
  customerName: string;
  quoteId: string | null;
  quoteNumber: string | null;
  brief: string | null;
  designerUserId: string | null;
};

type ActivityRow = {
  id: string;
  entity_id: string | null;
  title: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type MarketingVisualRow = {
  id: string;
  design_task_id: string;
  output_file_id: string;
  status: string;
  tags: unknown;
  checklist: unknown;
  notes: string | null;
  is_favorite: boolean;
  is_hidden: boolean;
};

type SortMode = "newest" | "oldest" | "customer";

// Near-identical visuals from one design task are collapsed into a single
// stack in the feed; opening it reveals every sibling in a filmstrip.
type VisualGroup = {
  key: string;
  taskId: string;
  items: GalleryVisual[];
  cover: GalleryVisual;
};

// =======================
// Constants
// =======================

const MARKETING_STATUSES: MarketingStatus[] = ["new", "in_progress", "review", "ready", "shot"];

const MARKETING_STATUS_META: Record<
  MarketingStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "accent"; icon: React.ElementType }
> = {
  new: { label: "Нове", tone: "neutral", icon: Sparkles },
  in_progress: { label: "В роботі", tone: "info", icon: Clock3 },
  review: { label: "На узгодженні", tone: "warning", icon: Eye },
  ready: { label: "Готово до фото", tone: "success", icon: Camera },
  shot: { label: "Відзнято", tone: "accent", icon: CheckCircle2 },
};

const DEFAULT_CHECKLIST_TEMPLATE = [
  "Загальний план продукту",
  "Деталі та фактура матеріалу",
  "Брендування / логотип крупно",
  "Пакування",
  "Фото в інтерʼєрі або на моделі",
  "Процес виробництва",
];

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "heic", "bmp", "svg"]);

// Design visuals are 16:9 presentation slides. Match the card image box to that
// so a standard visual fills it edge-to-edge without being cropped.
const VISUAL_ASPECT_CLASS = "aspect-[16/9]";

const DEFAULT_RECORD: MarketingRecord = {
  id: null,
  status: "new",
  tags: [],
  checklist: [],
  notes: "",
  isFavorite: false,
  isHidden: false,
};

// =======================
// Helpers
// =======================

const toNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getFileExtension = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return "";
  return fileName.slice(dot + 1).toLowerCase();
};

const isRenderableVisual = (file: StoredDesignOutputFile) => {
  if (typeof file.mime_type === "string" && file.mime_type.startsWith("image/")) return true;
  if (IMAGE_EXTENSIONS.has(getFileExtension(file.file_name))) return true;
  return isServerPreviewableStoragePath(file.storage_path);
};

const parseMarketingStatus = (value: unknown): MarketingStatus =>
  typeof value === "string" && (MARKETING_STATUSES as string[]).includes(value)
    ? (value as MarketingStatus)
    : "new";

const parseTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  value.forEach((entry) => {
    const tag = toNonEmptyString(entry);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  });
  return tags;
};

const parseChecklist = (value: unknown): ChecklistItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const text = toNonEmptyString(row.text);
      if (!text) return null;
      return {
        id: toNonEmptyString(row.id) ?? crypto.randomUUID(),
        text,
        done: row.done === true,
      } satisfies ChecklistItem;
    })
    .filter((entry): entry is ChecklistItem => entry !== null);
};

const parseMarketingRecord = (row: MarketingVisualRow): MarketingRecord => ({
  id: row.id,
  status: parseMarketingStatus(row.status),
  tags: parseTags(row.tags),
  checklist: parseChecklist(row.checklist),
  notes: typeof row.notes === "string" ? row.notes : "",
  isFavorite: row.is_favorite === true,
  isHidden: row.is_hidden === true,
});

const stripBriefMarkup = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
};

// "Нове" is a freshness signal, not a blanket default: an untriaged visual is
// only "Нове" for its first 2 days. Older untriaged visuals carry no status
// badge, and once a marketer sets a real status that status always wins.
const NEW_STATUS_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

const isWithinNewWindow = (iso: string) => {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && Date.now() - time <= NEW_STATUS_WINDOW_MS;
};

const resolveDisplayStatus = (record: MarketingRecord, createdAt: string): MarketingStatus | null => {
  if (record.status !== "new") return record.status;
  return isWithinNewWindow(createdAt) ? "new" : null;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getRecordKey = (taskId: string, fileId: string) => `${taskId}:${fileId}`;

// Count pill for filter chips — a self-contained badge so the number reads as
// separate from the label instead of colliding with it ("Нове 3", not "Нове3").
function CountPill({ value, active }: { value: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none tabular-nums",
        active ? "bg-primary/20 text-primary" : "bg-foreground/10 text-muted-foreground"
      )}
    >
      {value}
    </span>
  );
}

// =======================
// Page
// =======================

type MarketingCachePayload = {
  visuals: GalleryVisual[];
  records: Record<string, MarketingRecord>;
  customerInfoById: Record<string, CustomerInfo>;
};

// Keep the built gallery for a few minutes so navigating away and back shows it
// instantly (no skeleton, no re-fetch, images stay browser-cached). We still
// revalidate silently once the cache is older than this.
const MARKETING_CACHE_TTL = 3 * 60 * 1000;

export default function MarketingPage() {
  const { teamId, userId } = useAuth();
  const {
    cached: marketingCached,
    setCache: setMarketingCache,
    isStale: isMarketingCacheStale,
  } = usePageCache<MarketingCachePayload>(teamId ? `marketing:v1:${teamId}` : "marketing:v1:none");

  const [loading, setLoading] = useState(() => !marketingCached);
  const [error, setError] = useState<string | null>(null);
  const [visuals, setVisuals] = useState<GalleryVisual[]>(() => marketingCached?.visuals ?? []);
  const [records, setRecords] = useState<Record<string, MarketingRecord>>(() => marketingCached?.records ?? {});
  const [customerInfoById, setCustomerInfoById] = useState<Record<string, CustomerInfo>>(
    () => marketingCached?.customerInfoById ?? {}
  );
  const [memberLabelById, setMemberLabelById] = useState<Record<string, string>>({});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MarketingStatus>("all");
  const [designerFilter, setDesignerFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const notesDraftRef = useRef<string | null>(null);
  const lastLoadedAtRef = useRef(0);

  // ---------- data loading ----------

  const loadGallery = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!teamId) return;
      if (mode === "initial") setLoading(true);
      setError(null);

      try {
        const taskRows: ActivityRow[] = [];
        const pageSize = 1000;
        let offset = 0;
        while (true) {
          const { data, error: fetchError } = await supabase
            .from("activity_log")
            .select("id,entity_id,title,created_at,metadata")
            .eq("team_id", teamId)
            .eq("action", "design_task")
            .not("metadata->design_output_files", "is", null)
            .order("created_at", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (fetchError) throw fetchError;
          const rows = (data ?? []) as ActivityRow[];
          taskRows.push(...rows);
          if (rows.length < pageSize) break;
          offset += pageSize;
        }

        const recordRows: MarketingVisualRow[] = [];
        offset = 0;
        while (true) {
          const { data, error: fetchError } = await supabase
            .schema("tosho")
            .from("marketing_visuals")
            .select("id,design_task_id,output_file_id,status,tags,checklist,notes,is_favorite,is_hidden")
            .eq("team_id", teamId)
            .range(offset, offset + pageSize - 1);
          if (fetchError) throw fetchError;
          const rows = (data ?? []) as MarketingVisualRow[];
          recordRows.push(...rows);
          if (rows.length < pageSize) break;
          offset += pageSize;
        }

        const nextVisuals: GalleryVisual[] = [];
        taskRows.forEach((row) => {
          const metadata = row.metadata ?? {};
          const files = parseStoredDesignOutputFiles(metadata.design_output_files);
          if (!files.length) return;

          const customerId = toNonEmptyString(metadata.customer_id);
          const customerType =
            toNonEmptyString(metadata.customer_type)?.toLowerCase() === "lead" ? "lead" : "customer";
          const customerName = toNonEmptyString(metadata.customer_name) ?? "Без замовника";
          const quoteId = toNonEmptyString(metadata.quote_id) ?? toNonEmptyString(row.entity_id);
          const quoteNumber = toNonEmptyString(metadata.quote_number);
          const briefRaw = toNonEmptyString(metadata.design_brief);
          const brief = briefRaw ? stripBriefMarkup(briefRaw) : null;
          const taskStatus = toNonEmptyString(metadata.status) as DesignStatus | null;
          const taskType = parseDesignTaskType(metadata.design_task_type);
          const assigneeUserId = toNonEmptyString(metadata.assignee_user_id);

          files.forEach((file) => {
            nextVisuals.push({
              key: getRecordKey(row.id, file.id),
              taskId: row.id,
              fileId: file.id,
              fileName: file.file_name,
              mimeType: file.mime_type,
              bucket: file.storage_bucket,
              path: file.storage_path,
              createdAt: file.created_at || row.created_at,
              outputKind: file.output_kind ?? null,
              isPreviewable: isRenderableVisual(file),
              taskTitle: toNonEmptyString(row.title) ?? "Дизайн-задача",
              taskStatus,
              taskType,
              taskCreatedAt: row.created_at,
              customerId,
              customerType,
              customerName,
              quoteId,
              quoteNumber,
              brief,
              designerUserId: file.uploaded_by ?? assigneeUserId,
            });
          });
        });

        const nextRecords: Record<string, MarketingRecord> = {};
        recordRows.forEach((row) => {
          nextRecords[getRecordKey(row.design_task_id, row.output_file_id)] = parseMarketingRecord(row);
        });

        setVisuals(nextVisuals);
        setRecords(nextRecords);

        // Customer / lead info for cards + detail contact block.
        const customerIds = Array.from(
          new Set(
            nextVisuals
              .filter((visual) => visual.customerType === "customer" && visual.customerId)
              .map((visual) => visual.customerId as string)
          )
        );
        const leadIds = Array.from(
          new Set(
            nextVisuals
              .filter((visual) => visual.customerType === "lead" && visual.customerId)
              .map((visual) => visual.customerId as string)
          )
        );

        const infoById: Record<string, CustomerInfo> = {};

        for (const chunk of chunkArray(customerIds, 150)) {
          const { data } = await supabase
            .schema("tosho")
            .from("customers")
            .select("id,name,logo_url,contact_name,contact_phone,contact_email")
            .in("id", chunk);
          (data ?? []).forEach((row: Record<string, unknown>) => {
            const id = toNonEmptyString(row.id);
            if (!id) return;
            infoById[id] = {
              name: toNonEmptyString(row.name) ?? "",
              logoUrl: normalizeCustomerLogoUrl(toNonEmptyString(row.logo_url)),
              contactName: toNonEmptyString(row.contact_name),
              contactPhone: toNonEmptyString(row.contact_phone),
              contactEmail: toNonEmptyString(row.contact_email),
            };
          });
        }

        for (const chunk of chunkArray(leadIds, 150)) {
          const { data } = await supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,first_name,last_name,email,phone_numbers,logo_url")
            .eq("team_id", teamId)
            .in("id", chunk);
          (data ?? []).forEach((row: Record<string, unknown>) => {
            const id = toNonEmptyString(row.id);
            if (!id) return;
            const contactName = [toNonEmptyString(row.first_name), toNonEmptyString(row.last_name)]
              .filter(Boolean)
              .join(" ");
            const phones = Array.isArray(row.phone_numbers) ? row.phone_numbers : [];
            infoById[id] = {
              name: toNonEmptyString(row.company_name) ?? contactName,
              logoUrl: normalizeCustomerLogoUrl(toNonEmptyString(row.logo_url)),
              contactName: contactName || null,
              contactPhone: toNonEmptyString(phones[0]),
              contactEmail: toNonEmptyString(row.email),
            };
          });
        }

        setCustomerInfoById(infoById);
        setMarketingCache({ visuals: nextVisuals, records: nextRecords, customerInfoById: infoById });
      } catch (loadError) {
        console.warn("Failed to load marketing gallery", loadError);
        setError("Не вдалося завантажити галерею. Спробуйте оновити сторінку.");
      } finally {
        setLoading(false);
        lastLoadedAtRef.current = Date.now();
      }
    },
    [teamId, setMarketingCache]
  );

  useEffect(() => {
    // Hydrate instantly from the session cache (no skeleton) and only hit the
    // network when the cache is missing or stale — so bouncing between pages
    // doesn't re-download the gallery every time.
    if (marketingCached) {
      setVisuals(marketingCached.visuals);
      setRecords(marketingCached.records);
      setCustomerInfoById(marketingCached.customerInfoById);
      setLoading(false);
      if (isMarketingCacheStale(MARKETING_CACHE_TTL)) {
        void loadGallery("refresh");
      }
    } else {
      void loadGallery("initial");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGallery]);

  // No manual refresh button — new visuals arrive on their own. We refetch
  // silently only when the tab regains focus/visibility, throttled so switching
  // tabs quickly never hammers the DB (no polling).
  useEffect(() => {
    const maybeRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastLoadedAtRef.current < 30_000) return;
      void loadGallery("refresh");
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [loadGallery]);

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) return;
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        const labelById: Record<string, string> = {};
        const avatarById: Record<string, string | null> = {};
        rows.forEach((row) => {
          labelById[row.userId] = row.label;
          avatarById[row.userId] = row.avatarDisplayUrl;
        });
        setMemberLabelById(labelById);
        setMemberAvatarById(avatarById);
      } catch (membersError) {
        console.warn("Failed to load workspace members for marketing gallery", membersError);
      }
    };
    void loadMembers();
  }, [userId]);

  // ---------- derived data ----------

  const getRecord = useCallback(
    (key: string): MarketingRecord => records[key] ?? DEFAULT_RECORD,
    [records]
  );

  // The gallery is visuals-only — layouts and other output files never appear.
  const visualizationVisuals = useMemo(
    () =>
      visuals.filter(
        (visual) => visual.outputKind === "visualization" || (visual.outputKind === null && visual.isPreviewable)
      ),
    [visuals]
  );

  const baseFiltered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visualizationVisuals.filter((visual) => {
      const record = getRecord(visual.key);
      if (!showHidden && record.isHidden) return false;
      if (showHidden && !record.isHidden) return false;
      if (onlyFavorites && !record.isFavorite) return false;
      if (designerFilter !== "all" && visual.designerUserId !== designerFilter) return false;
      if (tagFilter && !record.tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
      if (query) {
        const haystack = [
          visual.customerName,
          visual.taskTitle,
          visual.fileName,
          visual.quoteNumber ?? "",
          visual.brief ?? "",
          record.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [visualizationVisuals, getRecord, search, designerFilter, tagFilter, onlyFavorites, showHidden]);

  // Everything the feed shows and counts is a stack: one design task = one card,
  // never raw files. Cover = a favourited visual, else the first.
  const groupVisuals = useCallback(
    (list: GalleryVisual[]): VisualGroup[] => {
      const byTask = new Map<string, GalleryVisual[]>();
      list.forEach((visual) => {
        const bucket = byTask.get(visual.taskId);
        if (bucket) bucket.push(visual);
        else byTask.set(visual.taskId, [visual]);
      });
      return Array.from(byTask.values()).map((items) => ({
        key: items[0].taskId,
        taskId: items[0].taskId,
        items,
        cover: items.find((visual) => getRecord(visual.key).isFavorite) ?? items[0],
      }));
    },
    [getRecord]
  );

  // Display status is date-aware: untriaged visuals are "Нове" only while fresh.
  const groupStatus = useCallback(
    (group: VisualGroup): MarketingStatus | null =>
      resolveDisplayStatus(getRecord(group.cover.key), group.cover.createdAt),
    [getRecord]
  );

  const baseGroups = useMemo(() => groupVisuals(baseFiltered), [groupVisuals, baseFiltered]);

  const statusCounts = useMemo(() => {
    const counts: Record<MarketingStatus, number> = { new: 0, in_progress: 0, review: 0, ready: 0, shot: 0 };
    baseGroups.forEach((group) => {
      const status = groupStatus(group);
      if (status) counts[status] += 1;
    });
    return counts;
  }, [baseGroups, groupStatus]);

  const groups = useMemo<VisualGroup[]>(() => {
    const list =
      statusFilter === "all"
        ? [...baseGroups]
        : baseGroups.filter((group) => groupStatus(group) === statusFilter);
    list.sort((a, b) => {
      if (sortMode === "customer") {
        const byCustomer = a.cover.customerName.localeCompare(b.cover.customerName, "uk");
        if (byCustomer !== 0) return byCustomer;
        return b.cover.createdAt.localeCompare(a.cover.createdAt);
      }
      if (sortMode === "oldest") return a.cover.createdAt.localeCompare(b.cover.createdAt);
      return b.cover.createdAt.localeCompare(a.cover.createdAt);
    });
    return list;
  }, [baseGroups, statusFilter, sortMode, groupStatus]);

  // Tag / hidden counts are also per-stack (distinct design tasks), not per file.
  const allTags = useMemo(() => {
    const byTag = new Map<string, { tag: string; tasks: Set<string> }>();
    visualizationVisuals.forEach((visual) => {
      getRecord(visual.key).tags.forEach((tag) => {
        const key = tag.toLowerCase();
        const existing = byTag.get(key);
        if (existing) existing.tasks.add(visual.taskId);
        else byTag.set(key, { tag, tasks: new Set([visual.taskId]) });
      });
    });
    return Array.from(byTag.values())
      .map((entry) => ({ tag: entry.tag, count: entry.tasks.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [visualizationVisuals, getRecord]);

  const designerOptions = useMemo(() => {
    const ids = new Set<string>();
    visuals.forEach((visual) => {
      if (visual.designerUserId) ids.add(visual.designerUserId);
    });
    return Array.from(ids)
      .map((id) => ({ id, label: memberLabelById[id] ?? "Невідомий автор" }))
      .sort((a, b) => a.label.localeCompare(b.label, "uk"));
  }, [visuals, memberLabelById]);

  const hiddenCount = useMemo(
    () =>
      new Set(
        visualizationVisuals.filter((visual) => getRecord(visual.key).isHidden).map((visual) => visual.taskId)
      ).size,
    [visualizationVisuals, getRecord]
  );

  const favoritesCount = useMemo(
    () =>
      new Set(
        visualizationVisuals.filter((visual) => getRecord(visual.key).isFavorite).map((visual) => visual.taskId)
      ).size,
    [visualizationVisuals, getRecord]
  );

  const selected = useMemo(
    () => (selectedKey ? baseFiltered.find((visual) => visual.key === selectedKey) ?? null : null),
    [baseFiltered, selectedKey]
  );
  const selectedRecord = selected ? getRecord(selected.key) : null;
  // Navigation inside the dialog is scoped to the open visual's stack, so arrows
  // and the filmstrip cycle the task's siblings rather than the whole feed.
  const activeGroupItems = useMemo<GalleryVisual[]>(() => {
    if (!selected) return [];
    return groups.find((group) => group.taskId === selected.taskId)?.items ?? [selected];
  }, [selected, groups]);
  const activeGroupIndex = selected
    ? activeGroupItems.findIndex((visual) => visual.key === selected.key)
    : -1;

  // ---------- mutations ----------

  const persistRecord = useCallback(
    async (visual: GalleryVisual, next: MarketingRecord) => {
      if (!teamId) return;
      const payload = {
        team_id: teamId,
        design_task_id: visual.taskId,
        output_file_id: visual.fileId,
        status: next.status,
        tags: next.tags,
        checklist: next.checklist,
        notes: next.notes || null,
        is_favorite: next.isFavorite,
        is_hidden: next.isHidden,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase
        .schema("tosho")
        .from("marketing_visuals")
        .upsert(payload, { onConflict: "team_id,design_task_id,output_file_id" });
      if (upsertError) {
        console.warn("Failed to save marketing visual state", upsertError);
        toast.error("Не вдалося зберегти зміни. Спробуйте ще раз.");
      }
    },
    [teamId, userId]
  );

  const updateRecord = useCallback(
    (visual: GalleryVisual, patch: Partial<MarketingRecord>) => {
      const current = records[visual.key] ?? DEFAULT_RECORD;
      const next = { ...current, ...patch };
      const nextRecords = { ...records, [visual.key]: next };
      setRecords(nextRecords);
      // Keep the session cache in sync so a hydrate-from-cache never reverts edits.
      setMarketingCache({ visuals, records: nextRecords, customerInfoById });
      void persistRecord(visual, next);
    },
    [records, persistRecord, setMarketingCache, visuals, customerInfoById]
  );

  const handleToggleFavorite = useCallback(
    (visual: GalleryVisual) => {
      const record = getRecord(visual.key);
      updateRecord(visual, { isFavorite: !record.isFavorite });
    },
    [getRecord, updateRecord]
  );

  const handleDownload = useCallback(async (visual: GalleryVisual) => {
    const url = await getSignedAttachmentDownloadUrl(visual.bucket, visual.path, visual.fileName);
    if (!url) {
      toast.error("Не вдалося сформувати посилання для завантаження.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleOpenOriginal = useCallback(async (visual: GalleryVisual) => {
    const url = await getSignedAttachmentUrl(visual.bucket, visual.path, "original");
    if (!url) {
      toast.error("Не вдалося відкрити оригінал файлу.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openDetail = useCallback((visual: GalleryVisual) => {
    notesDraftRef.current = null;
    setNewTag("");
    setNewChecklistItem("");
    setSelectedKey(visual.key);
  }, []);

  const commitNotesDraft = useCallback(() => {
    if (!selected || notesDraftRef.current === null) return;
    const draft = notesDraftRef.current;
    notesDraftRef.current = null;
    if (draft !== getRecord(selected.key).notes) {
      updateRecord(selected, { notes: draft });
    }
  }, [selected, getRecord, updateRecord]);

  const closeDetail = useCallback(() => {
    commitNotesDraft();
    setSelectedKey(null);
  }, [commitNotesDraft]);

  const stepDetail = useCallback(
    (direction: 1 | -1) => {
      if (!selected || activeGroupItems.length <= 1) return;
      commitNotesDraft();
      const currentIndex = activeGroupItems.findIndex((visual) => visual.key === selected.key);
      if (currentIndex === -1) return;
      const nextIndex = (currentIndex + direction + activeGroupItems.length) % activeGroupItems.length;
      setNewTag("");
      setNewChecklistItem("");
      setSelectedKey(activeGroupItems[nextIndex].key);
    },
    [selected, activeGroupItems, commitNotesDraft]
  );

  const selectSibling = useCallback(
    (visual: GalleryVisual) => {
      commitNotesDraft();
      setNewTag("");
      setNewChecklistItem("");
      setSelectedKey(visual.key);
    },
    [commitNotesDraft]
  );

  const handleAddTag = useCallback(
    (visual: GalleryVisual, rawTag: string) => {
      const tag = rawTag.trim();
      if (!tag) return;
      const record = getRecord(visual.key);
      if (record.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
        setNewTag("");
        return;
      }
      updateRecord(visual, { tags: [...record.tags, tag] });
      setNewTag("");
    },
    [getRecord, updateRecord]
  );

  const handleRemoveTag = useCallback(
    (visual: GalleryVisual, tag: string) => {
      const record = getRecord(visual.key);
      updateRecord(visual, { tags: record.tags.filter((existing) => existing !== tag) });
    },
    [getRecord, updateRecord]
  );

  const handleAddChecklistItem = useCallback(
    (visual: GalleryVisual, rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const record = getRecord(visual.key);
      updateRecord(visual, {
        checklist: [...record.checklist, { id: crypto.randomUUID(), text, done: false }],
      });
      setNewChecklistItem("");
    },
    [getRecord, updateRecord]
  );

  const handleApplyChecklistTemplate = useCallback(
    (visual: GalleryVisual) => {
      const record = getRecord(visual.key);
      const existing = new Set(record.checklist.map((item) => item.text.toLowerCase()));
      const additions = DEFAULT_CHECKLIST_TEMPLATE.filter((text) => !existing.has(text.toLowerCase())).map(
        (text) => ({ id: crypto.randomUUID(), text, done: false })
      );
      if (!additions.length) return;
      updateRecord(visual, { checklist: [...record.checklist, ...additions] });
    },
    [getRecord, updateRecord]
  );

  // ---------- render helpers ----------

  const renderStatusBadge = useCallback((status: MarketingStatus, size: "sm" | "md" = "sm") => {
    const meta = MARKETING_STATUS_META[status];
    const Icon = meta.icon;
    return (
      <Badge tone={meta.tone} size={size} pill className="gap-1 backdrop-blur-sm">
        <Icon className="h-3 w-3" />
        {meta.label}
      </Badge>
    );
  }, []);

  const renderChecklistProgress = useCallback((record: MarketingRecord) => {
    if (!record.checklist.length) return null;
    const done = record.checklist.filter((item) => item.done).length;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        {done}/{record.checklist.length}
      </span>
    );
  }, []);

  const renderGroup = useCallback(
    (group: VisualGroup, options?: { className?: string }) => {
      const visual = group.cover;
      const record = getRecord(visual.key);
      const displayStatus = resolveDisplayStatus(record, visual.createdAt);
      const customerInfo = visual.customerId ? customerInfoById[visual.customerId] : undefined;
      const designerLabel = visual.designerUserId ? memberLabelById[visual.designerUserId] : null;
      const designerAvatar = visual.designerUserId ? memberAvatarById[visual.designerUserId] : null;
      const stackCount = group.items.length;
      const isStack = stackCount > 1;

      return (
        <article
          key={group.key}
          className={cn(
            "group/card relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card",
            "shadow-[var(--shadow-surface)] transition-[border-color,box-shadow] duration-200 ease-out",
            "hover:border-border hover:shadow-[var(--shadow-elevated-sm)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            record.isHidden && "opacity-70",
            options?.className
          )}
            role="button"
            tabIndex={0}
            aria-label={
              isStack
                ? `${visual.customerName} — ${visual.taskTitle}, ${stackCount} візуалів у стеку`
                : `${visual.customerName} — ${visual.taskTitle}`
            }
            onClick={() => openDetail(visual)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetail(visual);
              }
            }}
          >
            <div className={cn("relative w-full overflow-hidden bg-muted/30", VISUAL_ASPECT_CLASS)}>
              {/* Card covers render ~300px wide, so use the 640px "preview" variant
                  (avg ~25KB) instead of the blurry 160px thumb. Cheap now that images
                  are lazy + signed URLs are stable, so each cover downloads once. */}
              {isStack ? (
                <StackHoverPreview
                  items={[group.cover, ...group.items.filter((item) => item.key !== group.cover.key)]}
                  alt={`${visual.customerName} — ${visual.fileName}`}
                  variant="preview"
                />
              ) : (
                <StorageObjectImage
                  bucket={visual.bucket}
                  path={visual.path}
                  alt={`${visual.customerName} — ${visual.fileName}`}
                  variant="preview"
                  className="h-full w-full"
                  imageClassName="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/card:scale-[1.03] motion-reduce:transition-none"
                />
              )}
              {displayStatus ? (
                <div className="absolute left-2.5 top-2.5">{renderStatusBadge(displayStatus)}</div>
              ) : null}
              <button
                type="button"
                aria-label={record.isFavorite ? "Прибрати з обраного" : "Додати в обране"}
                aria-pressed={record.isFavorite}
                className={cn(
                  "absolute right-2.5 top-2.5 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  record.isFavorite
                    ? "bg-black/45 opacity-100"
                    : "bg-black/25 text-white opacity-0 hover:bg-black/45 group-hover/card:opacity-100 focus-visible:opacity-100"
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  handleToggleFavorite(visual);
                }}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    record.isFavorite
                      ? "fill-amber-400 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
                      : "text-white"
                  )}
                />
              </button>
              {isStack ? (
                <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                  <Layers className="h-3 w-3" />
                  {stackCount}
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3.5">
              <div className="flex items-center gap-2">
                <EntityAvatar
                  src={customerInfo?.logoUrl ?? null}
                  name={visual.customerName}
                  size={22}
                  className="shrink-0"
                />
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {visual.customerName}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{visual.taskTitle}</p>
              {record.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {record.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  {record.tags.length > 3 ? (
                    <span className="px-1 text-[10px] font-medium text-muted-foreground/70">
                      +{record.tags.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                  {designerLabel ? (
                    <>
                      <AvatarBase src={designerAvatar} name={designerLabel} size={18} shape="circle" />
                      <span className="truncate">{designerLabel}</span>
                    </>
                  ) : (
                    <span className="truncate">{formatDate(visual.createdAt)}</span>
                  )}
                </span>
                {isStack ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    {stackCount} візуали
                  </span>
                ) : (
                  renderChecklistProgress(record) ?? (
                    <span className="text-[11px] text-muted-foreground/70">{formatDate(visual.createdAt)}</span>
                  )
                )}
              </div>
            </div>
          </article>
      );
    },
    [
      getRecord,
      customerInfoById,
      memberLabelById,
      memberAvatarById,
      openDetail,
      handleToggleFavorite,
      renderStatusBadge,
      renderChecklistProgress,
    ]
  );

  // ---------- render ----------

  const isEmpty = !loading && groups.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-24 pt-4 sm:px-6 md:pb-10">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-surface)]">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Маркетинг</h1>
            <p className="text-sm text-muted-foreground">
              Галерея дизайн-візуалів: що зняти на виробництві та використати у промо.
            </p>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <IconInput
            icon={Search}
            iconLabel="Пошук"
            placeholder="Пошук: замовник, задача, тег, номер прорахунку…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            wrapperClassName="w-full sm:max-w-[360px]"
            className={cn(TOOLBAR_CONTROL, "pl-9")}
          />
          <Select value={designerFilter} onValueChange={setDesignerFilter}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-[180px]")} aria-label="Автор дизайну">
              <SelectValue placeholder="Всі дизайнери" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі дизайнери</SelectItem>
              {designerOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-[160px]")} aria-label="Сортування">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Спочатку нові</SelectItem>
              <SelectItem value="oldest">Спочатку давні</SelectItem>
              <SelectItem value="customer">За замовником</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Всі
            <CountPill value={baseGroups.length} active={statusFilter === "all"} />
          </Chip>
          {MARKETING_STATUSES.map((status) => {
            const meta = MARKETING_STATUS_META[status];
            const Icon = meta.icon;
            return (
              <Chip
                key={status}
                size="sm"
                active={statusFilter === status}
                icon={<Icon className="h-3.5 w-3.5" />}
                onClick={() => setStatusFilter((prev) => (prev === status ? "all" : status))}
              >
                {meta.label}
                <CountPill value={statusCounts[status]} active={statusFilter === status} />
              </Chip>
            );
          })}
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <Chip
            size="sm"
            active={onlyFavorites}
            icon={<Star className={cn("h-3.5 w-3.5", onlyFavorites && "fill-amber-400 text-amber-400")} />}
            onClick={() => setOnlyFavorites((prev) => !prev)}
          >
            Обрані
            <CountPill value={favoritesCount} active={onlyFavorites} />
          </Chip>
          {hiddenCount > 0 || showHidden ? (
            <Chip
              size="sm"
              active={showHidden}
              icon={<EyeOff className="h-3.5 w-3.5" />}
              onClick={() => setShowHidden((prev) => !prev)}
            >
              Приховані
              <CountPill value={hiddenCount} active={showHidden} />
            </Chip>
          ) : null}
          {allTags.length > 0 ? <span className="mx-1 hidden h-4 w-px bg-border sm:block" /> : null}
          {allTags.map(({ tag, count }) => (
            <Chip
              key={tag}
              size="sm"
              active={tagFilter?.toLowerCase() === tag.toLowerCase()}
              icon={<Tags className="h-3.5 w-3.5" />}
              onClick={() => setTagFilter((prev) => (prev?.toLowerCase() === tag.toLowerCase() ? null : tag))}
            >
              {tag}
              <CountPill value={count} active={tagFilter?.toLowerCase() === tag.toLowerCase()} />
            </Chip>
          ))}
        </div>
      </div>

      {/* Content */}
      {error ? (
        <EmptyStateCard
          badgeLabel="Помилка"
          tone="danger"
          title="Галерея тимчасово недоступна"
          description={error}
          actionLabel="Спробувати ще раз"
          onAction={() => void loadGallery("initial")}
        />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              <Skeleton className={cn("w-full rounded-none", VISUAL_ASPECT_CLASS)} />
              <div className="space-y-2 p-3.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyStateCard
          badgeLabel="Порожньо"
          title={
            visuals.length === 0
              ? "Поки що немає візуалів"
              : onlyFavorites
                ? "Немає обраних візуалів"
                : "Нічого не знайдено"
          }
          description={
            visuals.length === 0
              ? "Коли дизайнери завантажать візуали у дизайн-задачі, вони зʼявляться тут автоматично."
              : onlyFavorites
                ? "Натисніть ★ на візуалі, щоб додати його в обране."
                : "Спробуйте змінити фільтри або пошуковий запит."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((group) => renderGroup(group))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent
          className="flex max-h-[92dvh] w-[calc(100vw-24px)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0 md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]"
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.key === "ArrowRight") stepDetail(1);
            if (event.key === "ArrowLeft") stepDetail(-1);
          }}
        >
          {selected && selectedRecord ? (
            <>
              {/* Image side */}
              <div className="relative flex flex-col bg-muted/40 md:min-h-[520px]">
                <div className="relative flex min-h-[240px] flex-1 items-center justify-center">
                  <StorageObjectImage
                    bucket={selected.bucket}
                    path={selected.path}
                    alt={`${selected.customerName} — ${selected.fileName}`}
                    variant="preview"
                    className="h-full max-h-[38dvh] w-full md:max-h-none"
                    imageClassName="h-full w-full object-contain"
                  />
                  {activeGroupItems.length > 1 ? (
                    <>
                      <button
                        type="button"
                        aria-label="Попередній візуал"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        onClick={() => stepDetail(-1)}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Наступний візуал"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        onClick={() => stepDetail(1)}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  ) : null}
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1.5 rounded-lg bg-black/35 text-white backdrop-blur-sm hover:bg-black/55"
                      onClick={() => void handleOpenOriginal(selected)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Оригінал
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1.5 rounded-lg bg-black/35 text-white backdrop-blur-sm hover:bg-black/55"
                      onClick={() => void handleDownload(selected)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Завантажити
                    </Button>
                  </div>
                  {activeGroupItems.length > 1 && activeGroupIndex !== -1 ? (
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                      {activeGroupIndex + 1} / {activeGroupItems.length}
                    </span>
                  ) : null}
                </div>
                {activeGroupItems.length > 1 ? (
                  <div
                    className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-border/60 bg-card/60 p-2.5 [scrollbar-width:thin]"
                    role="listbox"
                    aria-label="Візуали цього проєкту"
                  >
                    {activeGroupItems.map((item, index) => {
                      const isActive = item.key === selected.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          aria-label={`Візуал ${index + 1}`}
                          onClick={() => selectSibling(item)}
                          className={cn(
                            "relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            isActive
                              ? "border-primary shadow-[var(--shadow-elevated-sm)]"
                              : "border-transparent opacity-60 hover:opacity-100"
                          )}
                        >
                          <StorageObjectImage
                            bucket={item.bucket}
                            path={item.path}
                            alt=""
                            variant="thumb"
                            className="h-full w-full"
                            imageClassName="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Info side */}
              <div className="flex min-h-0 flex-col overflow-y-auto">
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar
                        src={
                          (selected.customerId ? customerInfoById[selected.customerId]?.logoUrl : null) ?? null
                        }
                        name={selected.customerName}
                        size={40}
                      />
                      <div className="min-w-0">
                        <DialogTitle className="truncate text-base font-semibold leading-tight text-foreground">
                          {selected.customerName}
                        </DialogTitle>
                        <DialogDescription className="truncate text-xs text-muted-foreground">
                          {selected.taskTitle}
                        </DialogDescription>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={selectedRecord.isFavorite ? "Прибрати з обраного" : "Додати в обране"}
                      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      onClick={() => handleToggleFavorite(selected)}
                    >
                      <Star
                        className={cn("h-4 w-4", selectedRecord.isFavorite && "fill-amber-400 text-amber-400")}
                      />
                    </button>
                  </div>

                  {/* Contact */}
                  {selected.customerId && customerInfoById[selected.customerId] ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {customerInfoById[selected.customerId].contactName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {customerInfoById[selected.customerId].contactName}
                        </span>
                      ) : null}
                      {customerInfoById[selected.customerId].contactPhone ? (
                        <a
                          href={`tel:${customerInfoById[selected.customerId].contactPhone}`}
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {customerInfoById[selected.customerId].contactPhone}
                        </a>
                      ) : null}
                      {customerInfoById[selected.customerId].contactEmail ? (
                        <a
                          href={`mailto:${customerInfoById[selected.customerId].contactEmail}`}
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {customerInfoById[selected.customerId].contactEmail}
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Status — "Нове" is automatic (date-based), so the picker only
                      offers the workflow statuses; clicking the active one clears
                      it back to untriaged. */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Статус для зйомки
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MARKETING_STATUSES.filter((status) => status !== "new").map((status) => {
                        const meta = MARKETING_STATUS_META[status];
                        const Icon = meta.icon;
                        const active = selectedRecord.status === status;
                        return (
                          <Chip
                            key={status}
                            size="sm"
                            active={active}
                            icon={<Icon className="h-3.5 w-3.5" />}
                            onClick={() => updateRecord(selected, { status: active ? "new" : status })}
                          >
                            {meta.label}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>

                  {/* Brief */}
                  {selected.brief ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Про проєкт
                      </span>
                      <p className="line-clamp-5 whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">
                        {selected.brief}
                      </p>
                    </div>
                  ) : null}

                  {/* Meta */}
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-border/50 bg-muted/20 p-3.5 text-xs sm:grid-cols-2">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(selected.createdAt)}
                    </span>
                    {selected.designerUserId ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <AvatarBase
                          src={memberAvatarById[selected.designerUserId]}
                          name={memberLabelById[selected.designerUserId] ?? "?"}
                          size={16}
                          shape="circle"
                        />
                        <span className="truncate">
                          {memberLabelById[selected.designerUserId] ?? "Невідомий автор"}
                        </span>
                      </span>
                    ) : null}
                    {selected.taskType ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Palette className="h-3.5 w-3.5" />
                        {DESIGN_TASK_TYPE_LABELS[selected.taskType]}
                      </span>
                    ) : null}
                    {selected.taskStatus && DESIGN_STATUS_LABELS[selected.taskStatus] ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        Дизайн: {DESIGN_STATUS_LABELS[selected.taskStatus]}
                      </span>
                    ) : null}
                    <Link
                      to={`/design/${selected.taskId}`}
                      className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      <Palette className="h-3.5 w-3.5" />
                      Дизайн-задача
                    </Link>
                    {selected.quoteId ? (
                      <Link
                        to={`/orders/estimates/${selected.quoteId}`}
                        className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        {selected.quoteNumber ? `Прорахунок ${selected.quoteNumber}` : "Прорахунок"}
                      </Link>
                    ) : null}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tags className="h-3.5 w-3.5" />
                      Теги
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedRecord.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground"
                        >
                          {tag}
                          <button
                            type="button"
                            aria-label={`Видалити тег ${tag}`}
                            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => handleRemoveTag(selected, tag)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <Input
                          value={newTag}
                          onChange={(event) => setNewTag(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddTag(selected, newTag);
                            }
                          }}
                          placeholder="Додати тег…"
                          className="h-7 w-[130px] rounded-full border-dashed px-3 text-xs"
                          aria-label="Новий тег"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 rounded-full p-0"
                          aria-label="Додати тег"
                          disabled={!newTag.trim()}
                          onClick={() => handleAddTag(selected, newTag)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Photographer checklist */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" />
                        Чек-лист фотографа
                      </span>
                      {selectedRecord.checklist.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {selectedRecord.checklist.filter((item) => item.done).length}/
                          {selectedRecord.checklist.length}
                        </span>
                      ) : null}
                    </div>
                    {selectedRecord.checklist.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {selectedRecord.checklist.map((item) => (
                          <li
                            key={item.id}
                            className="group/check flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40"
                          >
                            <Checkbox
                              id={`check-${item.id}`}
                              checked={item.done}
                              onCheckedChange={(checked) =>
                                updateRecord(selected, {
                                  checklist: selectedRecord.checklist.map((entry) =>
                                    entry.id === item.id ? { ...entry, done: checked === true } : entry
                                  ),
                                })
                              }
                            />
                            <label
                              htmlFor={`check-${item.id}`}
                              className={cn(
                                "flex-1 cursor-pointer text-[13px] leading-snug text-foreground",
                                item.done && "text-muted-foreground line-through"
                              )}
                            >
                              {item.text}
                            </label>
                            <button
                              type="button"
                              aria-label={`Видалити пункт «${item.text}»`}
                              className="rounded-md p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-danger-foreground group-hover/check:text-muted-foreground"
                              onClick={() =>
                                updateRecord(selected, {
                                  checklist: selectedRecord.checklist.filter((entry) => entry.id !== item.id),
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 justify-start gap-1.5 rounded-lg border-dashed text-muted-foreground"
                        onClick={() => handleApplyChecklistTemplate(selected)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Додати стандартний чек-лист
                      </Button>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={newChecklistItem}
                        onChange={(event) => setNewChecklistItem(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddChecklistItem(selected, newChecklistItem);
                          }
                        }}
                        placeholder="Що ще зняти? Enter — додати"
                        className="h-8 rounded-lg text-[13px]"
                        aria-label="Новий пункт чек-листа"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-lg p-0"
                        aria-label="Додати пункт"
                        disabled={!newChecklistItem.trim()}
                        onClick={() => handleAddChecklistItem(selected, newChecklistItem)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Нотатки для зйомки
                    </span>
                    <Textarea
                      key={selected.key}
                      defaultValue={selectedRecord.notes}
                      onChange={(event) => {
                        notesDraftRef.current = event.target.value;
                      }}
                      onBlur={commitNotesDraft}
                      placeholder="Локація, реквізит, ідеї для кадрів…"
                      className="min-h-[72px] rounded-xl text-[13px]"
                      aria-label="Нотатки для зйомки"
                    />
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                    <span className="truncate text-[11px] text-muted-foreground/80">{selected.fileName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 rounded-lg text-muted-foreground"
                      onClick={() => {
                        updateRecord(selected, { isHidden: !selectedRecord.isHidden });
                        closeDetail();
                      }}
                    >
                      {selectedRecord.isHidden ? (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          Повернути в галерею
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" />
                          Приховати
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
