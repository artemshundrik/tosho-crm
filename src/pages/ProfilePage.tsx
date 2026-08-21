import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  BellRing,
  Cake,
  CalendarRange,
  Camera,
  Loader2,
  Mail,
  MonitorSmartphone,
  Moon,
  Pencil,
  Phone,
  Plus,
  Save,
  Send,
  UserCheck,
} from "lucide-react";
import { supabase, db } from "@/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/app/page-loading";
import { Link, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AvatarBase } from "@/components/app/avatar-kit";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationChannelMatrix } from "@/components/notifications/NotificationChannelMatrix";
import { AbsenceBalanceMeters, buildBalanceEntries } from "@/components/team/AbsenceBalanceMeters";
import { AbsenceKindChip } from "@/components/team/AbsenceKindChip";
import {
  AbsenceDialog,
  type AbsenceDialogValue,
  type AbsenceOwnConflict,
} from "@/components/team/AbsenceDialog";
import {
  cancelOwnAbsenceRequest,
  createOwnAbsenceRequest,
  isQuotaAbsenceKind,
  listTeamAbsencesForUserYear,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_STATUS_LABELS,
  TEAM_ABSENCE_STATUS_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import {
  fallbackBalance,
  loadAbsenceBalances,
  loadWorkdayExceptions,
  type AbsenceBalance,
  type WorkdayCalendar,
} from "@/lib/teamAbsenceQuotas";
import { countQuotaDaysInYear } from "@/lib/teamAbsenceCalendar";
import { ACTIVE_DESIGN_STATUSES } from "@/lib/designWorkload";
import { listQuotes } from "@/lib/toshoApi";
import { notifyAbsenceRequestCancelled } from "@/lib/workflowNotifications";
import { NOTIFY_FROM_HOUR, NOTIFY_UNTIL_HOUR } from "@/lib/quietHours";
import { toneBadgeClass } from "@/lib/statusTones";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import Cropper, { type Area } from "react-easy-crop";
import { usePageCache } from "@/hooks/usePageCache";
import { resolveWorkspaceId } from "@/lib/workspace";
import { getCanonicalAvatarReference } from "@/lib/avatarUrl";
import { buildUserNameFromMetadata, getInitialsFromName, toFullName } from "@/lib/userName";
import {
  formatEmploymentDate,
  formatEmploymentDuration,
  getEmploymentDurationDays,
  getEmploymentStatusLabel,
  getProbationSummary,
  normalizeEmploymentStatus,
  type EmploymentStatus,
} from "@/lib/employment";
import {
  getCurrentWorkspaceMemberDirectoryEntry,
  listWorkspaceMembersForDisplay,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDisplayRow,
} from "@/lib/workspaceMemberDirectory";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { getCurrentUser } from "@/lib/currentUser";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";
const STORAGE_CACHE_CONTROL = "31536000, immutable";
const AVATAR_XS_SIZE = 40;
const AVATAR_MD_SIZE = 64;
const AVATAR_HERO_SIZE = 192;

type ProfileTab = "overview" | "absences" | "settings";

type ProfileCache = {
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  birthDate: string;
  email: string;
  accessRole: string;
  jobRole: string | null;
  initials: string;
  avatarUrl: string | null;
  phone: string;
  startDate: string;
  probationEndDate: string;
  employmentStatus: EmploymentStatus;
};

type TodayReminder = {
  id: string;
  source: "customer" | "lead";
  name: string;
  comment: string | null;
  remindAt: string;
};

type MyQuoteRow = {
  id: string;
  number: string | null;
  title: string | null;
  status: string | null;
  deadline_at: string | null;
  customer_name?: string | null;
};

type MyDesignTaskRow = {
  id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

// Дзеркало ACTIVE_QUOTE_STATUSES із QuotesPage — «активний» прорахунок ще в роботі.
const PROFILE_ACTIVE_QUOTE_STATUSES = ["new", "estimating", "estimated", "awaiting_approval"];

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatShortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

const formatAbsenceRange = (absence: { startDate: string; endDate: string }) =>
  absence.startDate === absence.endDate
    ? formatShortDate(absence.startDate)
    : `${formatShortDate(absence.startDate)} – ${formatShortDate(absence.endDate)}`;

const formatReminderTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

const formatSignInMoment = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Опис ЦЬОГО браузера — єдине, що клієнт чесно знає про сесії.
 *
 * Supabase не віддає фронту список чужих сесій (лише свій токен), тож
 * будь-який «список пристроїв» тут був би вигадкою. Показуємо рівно одну
 * поточну сесію, а решту прибираємо кнопкою.
 */
const describeCurrentDevice = (): string => {
  if (typeof navigator === "undefined") return "Цей браузер";
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? "Цей браузер";
};

const formatDeadlineShort = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
};

/** Дедлайн дизайн-задачі живе в metadata: design_deadline із фолбеком на deadline. */
const designTaskDeadline = (metadata: Record<string, unknown> | null): string | null => {
  const raw = metadata?.["design_deadline"] ?? metadata?.["deadline"];
  return typeof raw === "string" && raw ? raw : null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

// Strictly-typed handle over the shared tosho-schema db client so the
// Telegram-settings reads/writes below resolve to real Row/Insert/Update types.
const tdb = db as unknown as SupabaseClient<Database, "tosho">;

export function ProfilePage() {
  const { cached, setCache } = usePageCache<ProfileCache>("profile");
  const { teamId, session } = useAuth();

  // Перевіряємо наявність кешу - важливо перевіряти кожен раз
  const hasCache = Boolean(cached && cached.accessRole !== undefined);

  const [loading, setLoading] = useState(!hasCache);
  const [updating, setUpdating] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Оновлюємо loading коли з'являється кеш (важливо для повторних відвідувань)
  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);

  const showSkeleton = useMinimumLoading(loading && !hasCache);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatarUrl ?? null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [userId, setUserId] = useState<string | null>(cached?.userId ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [firstName, setFirstName] = useState(cached?.firstName ?? "");
  const [lastName, setLastName] = useState(cached?.lastName ?? "");
  const [fullName, setFullName] = useState(cached?.fullName ?? "");
  const [displayName, setDisplayName] = useState(cached?.displayName ?? cached?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(cached?.birthDate ?? "");
  const [email, setEmail] = useState(cached?.email ?? "");
  const [accessRole, setAccessRole] = useState(cached?.accessRole ?? "");
  const [jobRole, setJobRole] = useState<string | null>(cached?.jobRole ?? null);
  const [initials, setInitials] = useState(cached?.initials ?? "");
  const [phone, setPhone] = useState(cached?.phone ?? "");
  const [startDate, setStartDate] = useState(cached?.startDate ?? "");
  const [probationEndDate, setProbationEndDate] = useState(cached?.probationEndDate ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>(
    cached?.employmentStatus ?? normalizeEmploymentStatus(undefined, cached?.probationEndDate)
  );
  const [avatarStoragePath, setAvatarStoragePath] = useState<string | null>(null);

  // Інлайн-зміна пароля (без переходу на /reset-password)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Вихід з інших сесій
  const [signOutOthersOpen, setSignOutOthersOpen] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  // Вкладки: ?tab= дає диплінк на налаштування/відсутності
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab = tabParam === "absences" || tabParam === "settings" ? tabParam : "overview";

  // Мій зріз відсутностей (дані й RLS ті самі, що на сторінці Команди)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [myAbsences, setMyAbsences] = useState<TeamAbsence[]>([]);
  const [myBalance, setMyBalance] = useState<AbsenceBalance | null>(null);
  const [workdayCalendar, setWorkdayCalendar] = useState<WorkdayCalendar | null>(null);
  const [absencesLoading, setAbsencesLoading] = useState(true);
  const [teamRows, setTeamRows] = useState<WorkspaceMemberDisplayRow[]>([]);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceDialogInitial, setAbsenceDialogInitial] = useState<AbsenceDialogValue | null>(null);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // «Сьогодні»: нагадування + мої активні прорахунки й дизайн-задачі
  const [todayReminders, setTodayReminders] = useState<TodayReminder[]>([]);
  const [myQuotes, setMyQuotes] = useState<MyQuoteRow[]>([]);
  const [myDesignTasks, setMyDesignTasks] = useState<MyDesignTaskRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);

  // Telegram-сповіщення (фаза 1)
  const [tgChatId, setTgChatId] = useState<number | null>(null);
  const [tgUsername, setTgUsername] = useState<string | null>(null);
  const [tgEnabled, setTgEnabled] = useState(true);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgLinkHint, setTgLinkHint] = useState(false);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const year = Number(todayKey.slice(0, 4));

  const setTab = useCallback(
    (next: ProfileTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "overview") params.delete("tab");
          else params.set("tab", next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const commitCache = (overrides: Partial<ProfileCache> = {}) => {
    if (!userId) return;
    setCache({
      userId,
      firstName,
      lastName,
      fullName,
      displayName,
      birthDate,
      email,
      accessRole,
      jobRole,
      initials,
      avatarUrl,
      phone,
      startDate,
      probationEndDate,
      employmentStatus,
      ...overrides,
    });
  };

  useEffect(() => {
    // Завантажуємо тільки якщо немає кешу
    if (!hasCache) {
      getProfile();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCache]);

  const TELEGRAM_BOT_USERNAME = "ToShoCRM_bot";

  const applyTelegramSettings = (data: {
    telegram_chat_id?: number | null;
    telegram_username?: string | null;
    telegram_enabled?: boolean | null;
  } | null) => {
    setTgChatId(data?.telegram_chat_id ?? null);
    setTgUsername(data?.telegram_username ?? null);
    setTgEnabled(data?.telegram_enabled == null ? true : Boolean(data.telegram_enabled));
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data } = await tdb
        .from("user_notification_settings")
        .select("telegram_chat_id,telegram_username,telegram_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (active) applyTelegramSettings(data);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleTelegramConnect = async () => {
    if (!userId) return;
    setTgBusy(true);
    try {
      const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await tdb
        .from("telegram_link_tokens")
        .insert({ nonce, user_id: userId, expires_at: expiresAt });
      if (error) throw error;
      window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${nonce}`, "_blank", "noopener");
      setTgLinkHint(true);
    } catch {
      toast.error("Не вдалося створити посилання. Спробуй ще раз.");
    } finally {
      setTgBusy(false);
    }
  };

  const handleTelegramRefresh = async () => {
    if (!userId) return;
    setTgBusy(true);
    try {
      const { data } = await tdb
        .from("user_notification_settings")
        .select("telegram_chat_id,telegram_username,telegram_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      applyTelegramSettings(data);
      if (data?.telegram_chat_id) {
        setTgLinkHint(false);
        toast.success("Telegram підключено.");
      } else {
        toast.message("Ще не підключено. Натисни Start у боті та онови.");
      }
    } finally {
      setTgBusy(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    if (!userId) return;
    setTgBusy(true);
    try {
      const { error } = await tdb
        .from("user_notification_settings")
        .update({ telegram_chat_id: null, telegram_enabled: false })
        .eq("user_id", userId);
      if (error) throw error;
      setTgChatId(null);
      setTgUsername(null);
      setTgEnabled(false);
      setTgLinkHint(false);
      toast.success("Telegram відключено.");
    } catch {
      toast.error("Не вдалося відключити.");
    } finally {
      setTgBusy(false);
    }
  };

  const handleTelegramToggle = async () => {
    if (!userId || tgChatId == null) return;
    const next = !tgEnabled;
    setTgEnabled(next);
    const { error } = await tdb
      .from("user_notification_settings")
      .update({ telegram_enabled: next })
      .eq("user_id", userId);
    if (error) {
      setTgEnabled(!next);
      toast.error("Не вдалося зберегти.");
    }
  };

  const getProfile = async () => {
    try {
      // Завантажуємо тільки якщо немає кешу
      if (!hasCache) {
        setLoading(true);
      }
      const user = await getCurrentUser();

      if (user) {
        setUserId(user.id);
        setEmail(user.email || "");
        const meta = user.user_metadata as Record<string, unknown> | undefined;
        const resolvedName = buildUserNameFromMetadata(
          {
            first_name: meta?.first_name,
            last_name: meta?.last_name,
            full_name: meta?.full_name,
          },
          user.email
        );
        const metaBirthDate = typeof meta?.birth_date === "string" ? meta.birth_date : "";
        const metaPhone = typeof meta?.phone === "string" ? meta.phone : "";
        setFirstName(resolvedName.firstName);
        setLastName(resolvedName.lastName);
        setFullName(resolvedName.fullName);
        setDisplayName(resolvedName.displayName);
        setBirthDate(metaBirthDate);
        setPhone(metaPhone);
        const resolvedWorkspaceId = await resolveWorkspaceId(user.id);
        let resolvedAccessRole = "member";
        let resolvedJobRole: string | null = null;
        const metadataAvatarUrl = (user.user_metadata?.avatar_url as string | undefined) || null;
        const metadataAvatarPath = (user.user_metadata?.avatar_path as string | undefined) || null;
        let resolvedAvatarUrl = metadataAvatarUrl;
        let resolvedAvatarPath: string | null = metadataAvatarPath;
        let resolvedProfileName = resolvedName;
        let resolvedBirthDate = metaBirthDate;
        let resolvedPhone = metaPhone;
        let resolvedStartDate = "";
        let resolvedProbationEndDate = "";
        let resolvedEmploymentStatus: EmploymentStatus = "active";

        if (resolvedWorkspaceId) {
          const directoryEntry = await getCurrentWorkspaceMemberDirectoryEntry();
          if (directoryEntry) {
            resolvedProfileName = {
              firstName: directoryEntry.firstName,
              lastName: directoryEntry.lastName,
              fullName: directoryEntry.fullName,
              displayName: directoryEntry.displayName,
            };
            resolvedBirthDate = directoryEntry.birthDate || metaBirthDate;
            resolvedPhone = directoryEntry.phone || metaPhone;
            resolvedAvatarPath = directoryEntry.avatarPath || null;
            resolvedAvatarUrl = getCanonicalAvatarReference(
              { avatarUrl: directoryEntry.avatarUrl || resolvedAvatarUrl, avatarPath: directoryEntry.avatarPath || null },
              AVATAR_BUCKET
            );
            resolvedStartDate = directoryEntry.startDate || "";
            resolvedProbationEndDate = directoryEntry.probationEndDate || "";
            resolvedEmploymentStatus = directoryEntry.employmentStatus;
          }

          const { data: membership } = await supabase
            .schema("tosho")
            .from("memberships_view")
            .select("access_role, job_role")
            .eq("workspace_id", resolvedWorkspaceId)
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

          resolvedAccessRole = (membership?.access_role as string) || "member";
          resolvedJobRole = (membership?.job_role as string) || null;
        }

        const canonicalAvatarRef = getCanonicalAvatarReference(
          {
            avatarUrl: resolvedAvatarUrl,
            avatarPath: resolvedAvatarPath,
          },
          AVATAR_BUCKET
        );
        setAvatarUrl(canonicalAvatarRef);
        setAvatarStoragePath(resolvedAvatarPath);
        setFirstName(resolvedProfileName.firstName);
        setLastName(resolvedProfileName.lastName);
        setFullName(resolvedProfileName.fullName);
        setDisplayName(resolvedProfileName.displayName);
        setBirthDate(resolvedBirthDate);
        setPhone(resolvedPhone);
        setStartDate(resolvedStartDate);
        setProbationEndDate(resolvedProbationEndDate);
        setEmploymentStatus(resolvedEmploymentStatus);

        const i = getInitialsFromName(resolvedProfileName.displayName, user.email);
        setInitials(i);

        setAccessRole(resolvedAccessRole);
        setJobRole(resolvedJobRole);

        setCache({
          userId: user.id,
          firstName: resolvedProfileName.firstName,
          lastName: resolvedProfileName.lastName,
          fullName: resolvedProfileName.fullName,
          displayName: resolvedProfileName.displayName,
          birthDate: resolvedBirthDate,
          email: user.email || "",
          accessRole: resolvedAccessRole,
          jobRole: resolvedJobRole,
          initials: i,
          avatarUrl: canonicalAvatarRef,
          phone: resolvedPhone,
          startDate: resolvedStartDate,
          probationEndDate: resolvedProbationEndDate,
          employmentStatus: resolvedEmploymentStatus,
        });
      }
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickAvatar = () => {
    if (avatarUploading) return;
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Потрібне зображення", {
        description: "Оберіть файл зображення (JPG, PNG, WebP тощо).",
      });
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("Занадто великий файл", {
        description: "Максимальний розмір — 5 MB.",
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarDraftUrl(previewUrl);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const handleCropComplete = (_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  };

  const getCroppedBlob = async (imageSrc: string, cropArea: Area, outputSize: number): Promise<Blob | null> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    ctx.drawImage(
      image,
      cropArea.x * scaleX,
      cropArea.y * scaleY,
      cropArea.width * scaleX,
      cropArea.height * scaleY,
      0,
      0,
      outputSize,
      outputSize
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        canvas.toBlob((fallbackBlob) => resolve(fallbackBlob), "image/png");
      }, "image/webp", 0.86);
    });
  };

  const getAvatarVariantPaths = (basePath: string) => {
    const normalizedBase = basePath.replace(/\/+$/, "");
    return {
      xs: `${normalizedBase}/xs.webp`,
      md: `${normalizedBase}/md.webp`,
      hero: `${normalizedBase}/hero.webp`,
    };
  };

  const getAvatarCleanupPaths = (path: string | null | undefined) => {
    if (!path) return [] as string[];
    if (/\/(xs|md|hero|sm|lg)\.[^/.]+$/i.test(path)) {
      const basePath = path.replace(/\/(xs|md|hero|sm|lg)\.[^/.]+$/i, "");
      const variants = getAvatarVariantPaths(basePath);
      return [variants.xs, variants.md, variants.hero];
    }
    return [path];
  };

  const uploadAvatarBlob = async () => {
    if (!userId) return;
    if (!avatarDraftUrl || !croppedAreaPixels) return;
    setAvatarUploading(true);
    try {
      const xsBlob = await getCroppedBlob(avatarDraftUrl, croppedAreaPixels, AVATAR_XS_SIZE);
      const mdBlob = await getCroppedBlob(avatarDraftUrl, croppedAreaPixels, AVATAR_MD_SIZE);
      const heroBlob = await getCroppedBlob(avatarDraftUrl, croppedAreaPixels, AVATAR_HERO_SIZE);
      if (!xsBlob || !mdBlob || !heroBlob) {
        throw new Error("Не вдалося підготувати аватар.");
      }

      const basePath = `avatars/${userId}/${Date.now()}`;
      const variantPaths = getAvatarVariantPaths(basePath);
      for (const entry of [
        { path: variantPaths.xs, blob: xsBlob },
        { path: variantPaths.md, blob: mdBlob },
        { path: variantPaths.hero, blob: heroBlob },
      ]) {
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(entry.path, entry.blob, {
            upsert: true,
            contentType: entry.blob.type || "image/webp",
            cacheControl: STORAGE_CACHE_CONTROL,
          });

        if (uploadError) throw uploadError;
      }

      const canonicalAvatarRef = getCanonicalAvatarReference(
        { avatarUrl: null, avatarPath: variantPaths.hero },
        AVATAR_BUCKET
      );

      const workspaceIdForAvatar = await resolveWorkspaceId(userId);
      if (workspaceIdForAvatar) {
        await upsertWorkspaceMemberProfile({
          workspaceId: workspaceIdForAvatar,
          userId,
          firstName,
          lastName,
          fullName: toFullName(firstName.trim(), lastName.trim()) || fullName.trim(),
          avatarUrl: null,
          avatarPath: variantPaths.hero,
          birthDate,
          phone,
          updatedBy: userId,
        });
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: null, avatar_path: variantPaths.hero },
      });

      if (updateError) throw updateError;
      await supabase.auth.refreshSession();

      const previousAvatarPath = avatarStoragePath;
      const previousCleanupPaths = getAvatarCleanupPaths(previousAvatarPath).filter(
        (path) => path !== variantPaths.xs && path !== variantPaths.md && path !== variantPaths.hero
      );
      if (previousCleanupPaths.length > 0) {
        void supabase.storage.from(AVATAR_BUCKET).remove(previousCleanupPaths).catch(() => {
          // ignore cleanup failures for old avatars
        });
      }

      setAvatarUrl(canonicalAvatarRef);
      setAvatarStoragePath(variantPaths.hero);
      setAvatarDraftUrl(null);
      commitCache({ avatarUrl: canonicalAvatarRef });
      window.dispatchEvent(
        new CustomEvent("profile:avatar-updated", { detail: { avatarUrl: canonicalAvatarRef } })
      );
      toast.success("Аватар оновлено");
    } catch (error: unknown) {
      toast.error("Не вдалося оновити аватар", {
        description: getErrorMessage(error, "Спробуй ще раз."),
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleCropSave = async () => {
    if (!avatarDraftUrl || !croppedAreaPixels) return;
    await uploadAvatarBlob();
  };

  const handleCropCancel = () => {
    if (avatarDraftUrl) URL.revokeObjectURL(avatarDraftUrl);
    setAvatarDraftUrl(null);
  };

  const updateProfile = async () => {
    try {
      setUpdating(true);
      const nextFirstName = firstName.trim();
      const nextLastName = lastName.trim();
      const nextFullName = toFullName(nextFirstName, nextLastName) || fullName.trim();
      const nextDisplayName = buildUserNameFromMetadata(
        { first_name: nextFirstName, last_name: nextLastName, full_name: nextFullName },
        email
      ).displayName;
      if (userId) {
        const workspaceIdForProfile = await resolveWorkspaceId(userId);
        if (workspaceIdForProfile) {
          await upsertWorkspaceMemberProfile({
            workspaceId: workspaceIdForProfile,
            userId,
            firstName: nextFirstName,
            lastName: nextLastName,
            fullName: nextFullName,
            avatarUrl: avatarStoragePath ? null : avatarUrl,
            avatarPath: avatarStoragePath,
            birthDate,
            phone,
            updatedBy: userId,
          });
        }
      }
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: nextFirstName || null,
          last_name: nextLastName || null,
          full_name: nextFullName || null,
          birth_date: birthDate || null,
          phone: phone || null,
          avatar_url: avatarStoragePath ? null : avatarUrl,
          avatar_path: avatarStoragePath || null,
        }
      });

      if (error) throw error;
      const i = getInitialsFromName(nextDisplayName, email);
      setInitials(i);
      setFullName(nextFullName);
      setDisplayName(nextDisplayName);

      toast.success("Профіль оновлено", {
        description: "Зміни вже видно всій команді.",
      });
      commitCache({
        firstName: nextFirstName,
        lastName: nextLastName,
        fullName: nextFullName,
        displayName: nextDisplayName,
        birthDate,
        avatarUrl,
        initials: i,
      });

      window.dispatchEvent(
        new CustomEvent("profile:name-updated", {
          detail: {
            firstName: nextFirstName,
            lastName: nextLastName,
            fullName: nextFullName,
            displayName: nextDisplayName,
          },
        })
      );
    } catch (error: unknown) {
      toast.error("Помилка оновлення", {
        description: getErrorMessage(error, "Не вдалося оновити профіль."),
      });
    } finally {
      setUpdating(false);
    }
  };

  const handlePasswordSave = async () => {
    if (newPassword.length < 6) {
      toast.error("Закороткий пароль", { description: "Мінімум 6 символів." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Паролі не співпадають", { description: "Перевір обидва поля." });
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Пароль оновлено");
    } catch (error: unknown) {
      toast.error("Не вдалося змінити пароль", {
        description: getErrorMessage(error, "Спробуй ще раз."),
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  /**
   * Завершити всі сесії, КРІМ поточної.
   *
   * scope: "others" замість "global" навмисно: людина натискає кнопку саме в
   * тій сесії, яку хоче лишити. Global викинув би її звідси разом з рештою —
   * і виглядало б це як помилка, а не як захист.
   */
  const handleSignOutOthers = async () => {
    setSigningOutOthers(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      setSignOutOthersOpen(false);
      toast.success("Інші сесії завершено", {
        description: "На решті пристроїв доведеться увійти заново.",
      });
    } catch (error: unknown) {
      toast.error("Не вдалося завершити інші сесії", {
        description: getErrorMessage(error, "Спробуй ще раз."),
      });
    } finally {
      setSigningOutOthers(false);
    }
  };

  /* -------------------- Мій зріз: відсутності -------------------- */

  const reloadAbsenceData = useCallback(async () => {
    if (!userId) return;
    try {
      const resolvedWorkspaceId = await resolveWorkspaceId(userId);
      if (!resolvedWorkspaceId) return;
      const [mine, calendar, members] = await Promise.all([
        listTeamAbsencesForUserYear({ workspaceId: resolvedWorkspaceId, userId, year }),
        loadWorkdayExceptions({
          workspaceId: resolvedWorkspaceId,
          from: `${year}-01-01`,
          to: `${year + 1}-01-01`,
        }),
        listWorkspaceMembersForDisplay(resolvedWorkspaceId),
      ]);
      const balances = await loadAbsenceBalances({
        year,
        pendingAbsences: mine,
        exceptions: calendar.exceptions,
      });
      setWorkspaceId(resolvedWorkspaceId);
      setMyAbsences(mine);
      setWorkdayCalendar(calendar);
      setTeamRows(members);
      setMyBalance(balances.get(userId) ?? fallbackBalance(userId));
    } catch (error) {
      console.error("[profile] absence load failed", error);
    } finally {
      setAbsencesLoading(false);
    }
  }, [userId, year]);

  useEffect(() => {
    void reloadAbsenceData();
  }, [reloadAbsenceData]);

  /* -------------------- «Сьогодні» -------------------- */

  const loadTodayData = useCallback(async () => {
    // Блок «Сьогодні» живе лише на Огляді — на інших вкладках ці 4 запити
    // були б чистою витратою першого рендера.
    if (!userId || !teamId || tab !== "overview") return;
    try {
      const startIso = new Date(`${todayKey}T00:00:00`).toISOString();
      const endIso = new Date(`${todayKey}T23:59:59.999`).toISOString();
      const [customersRes, leadsRes, quotesRes, designRes] = await Promise.all([
        supabase
          .schema("tosho")
          .from("customers")
          .select("id,name,reminder_at,reminder_comment")
          .eq("team_id", teamId)
          .eq("manager_user_id", userId)
          .not("reminder_at", "is", null)
          .gte("reminder_at", startIso)
          .lte("reminder_at", endIso)
          .order("reminder_at", { ascending: true })
          .limit(20),
        supabase
          .schema("tosho")
          .from("leads")
          .select("id,company_name,legal_name,reminder_at,reminder_comment")
          .eq("team_id", teamId)
          .eq("manager_user_id", userId)
          .not("reminder_at", "is", null)
          .gte("reminder_at", startIso)
          .lte("reminder_at", endIso)
          .order("reminder_at", { ascending: true })
          .limit(20),
        listQuotes({
          teamId,
          managerUserId: userId,
          statuses: PROFILE_ACTIVE_QUOTE_STATUSES,
          limit: 30,
        }),
        supabase
          .from("activity_log")
          .select("id,title,metadata")
          .eq("team_id", teamId)
          .eq("action", "design_task")
          .eq("metadata->>assignee_user_id", userId)
          .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      const reminders: TodayReminder[] = [];
      ((customersRes.data ?? []) as Array<{
        id: string;
        name: string | null;
        reminder_at: string | null;
        reminder_comment: string | null;
      }>).forEach((row) => {
        if (!row.reminder_at) return;
        reminders.push({
          id: `customer-${row.id}`,
          source: "customer",
          name: row.name?.trim() || "Клієнт",
          comment: row.reminder_comment,
          remindAt: row.reminder_at,
        });
      });
      ((leadsRes.data ?? []) as Array<{
        id: string;
        company_name: string | null;
        legal_name: string | null;
        reminder_at: string | null;
        reminder_comment: string | null;
      }>).forEach((row) => {
        if (!row.reminder_at) return;
        reminders.push({
          id: `lead-${row.id}`,
          source: "lead",
          name: row.company_name?.trim() || row.legal_name?.trim() || "Лід",
          comment: row.reminder_comment,
          remindAt: row.reminder_at,
        });
      });
      reminders.sort((a, b) => a.remindAt.localeCompare(b.remindAt));
      setTodayReminders(reminders);

      // listQuotes повертає масив напряму (не {data,error}) і вже підмішує
      // customer_name із замовників/лідів.
      const quoteRows = ((quotesRes ?? []) as unknown as MyQuoteRow[]).slice();
      quoteRows.sort((a, b) => (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999"));
      setMyQuotes(quoteRows);
      if (!designRes.error) {
        const rows = (((designRes.data ?? []) as unknown) as MyDesignTaskRow[]).slice();
        rows.sort((a, b) =>
          (designTaskDeadline(a.metadata) ?? "9999").localeCompare(designTaskDeadline(b.metadata) ?? "9999")
        );
        setMyDesignTasks(rows);
      }
    } catch (error) {
      console.error("[profile] today load failed", error);
    } finally {
      setTodayLoading(false);
    }
  }, [tab, teamId, todayKey, userId]);

  useEffect(() => {
    void loadTodayData();
  }, [loadTodayData]);

  const pendingRequestsCount = useMemo(
    () => myAbsences.filter((absence) => absence.status === "pending").length,
    [myAbsences]
  );

  const balanceEntries = useMemo(
    () =>
      buildBalanceEntries(myAbsences, (absence) =>
        isQuotaAbsenceKind(absence.kind)
          ? countQuotaDaysInYear(absence.kind, absence, year, workdayCalendar?.exceptions)
          : 0
      ),
    [myAbsences, workdayCalendar, year]
  );

  // Хто погоджує заявки — щоб «піде на погодження» не було безадресним.
  const approverLabel = useMemo(() => {
    const others = teamRows.filter((row) => row.userId !== userId);
    const seo = others.filter((row) => (row.jobRole ?? "").toLowerCase() === "seo");
    const names = (seo.length > 0 ? seo : others).slice(0, 2).map((row) => row.label.split(" ")[0]);
    return names.length > 0 ? names.join(" або ") : "";
  }, [teamRows, userId]);

  const findOwnConflict = useCallback(
    ({ startDate: fromKey, endDate: toKey }: { userId: string; startDate: string; endDate: string }): AbsenceOwnConflict | null => {
      const hit = myAbsences.find(
        (absence) =>
          (absence.status === "approved" || absence.status === "pending") &&
          absence.startDate <= toKey &&
          absence.endDate >= fromKey
      );
      if (!hit) return null;
      return {
        kindLabel: TEAM_ABSENCE_KIND_LABELS[hit.kind],
        rangeLabel: formatAbsenceRange(hit),
        pending: hit.status === "pending",
        exact: hit.startDate === fromKey && hit.endDate === toKey,
      };
    },
    [myAbsences]
  );

  const openRequestDialog = useCallback(() => {
    setAbsenceDialogInitial({
      userId: userId ?? "",
      startDate: todayKey,
      endDate: todayKey,
      kind: "vacation",
      comment: "",
    });
    setAbsenceDialogOpen(true);
  }, [todayKey, userId]);

  const handleAbsenceSubmit = useCallback(
    async (value: AbsenceDialogValue) => {
      setAbsenceSaving(true);
      try {
        const kind = value.kind === "other" ? "vacation" : value.kind;
        await createOwnAbsenceRequest({
          startDate: value.startDate,
          endDate: value.endDate,
          kind,
          comment: value.comment.trim() || null,
        });
        toast.success(kind === "sick_leave" ? "Лікарняний зафіксовано" : "Заявку надіслано");
        setAbsenceDialogOpen(false);
        await reloadAbsenceData();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message ? error.message : "Не вдалося надіслати заявку"
        );
      } finally {
        setAbsenceSaving(false);
      }
    },
    [reloadAbsenceData]
  );

  const handleCancelRequest = useCallback(
    async (absence: TeamAbsence) => {
      if (!workspaceId) return;
      setCancelingId(absence.id);
      try {
        await cancelOwnAbsenceRequest({ workspaceId, id: absence.id });
        await notifyAbsenceRequestCancelled({
          workspaceId,
          requesterUserId: absence.userId,
          requesterName: displayName || "Співробітник",
          kindLabel: TEAM_ABSENCE_KIND_LABELS[absence.kind],
          rangeLabel: formatAbsenceRange(absence),
        });
        toast.success("Заявку скасовано");
        await reloadAbsenceData();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message ? error.message : "Не вдалося скасувати заявку"
        );
      } finally {
        setCancelingId(null);
      }
    },
    [displayName, reloadAbsenceData, workspaceId]
  );

  /* -------------------- Тулбар -------------------- */

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "overview"}
              onClick={() => setTab("overview")}
              className={SEGMENTED_TRIGGER}
            >
              Огляд
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "absences"}
              onClick={() => setTab("absences")}
              className={SEGMENTED_TRIGGER}
            >
              Відсутності
              {pendingRequestsCount > 0 ? (
                <CountBadge value={pendingRequestsCount} className={cn("ml-1", toneBadgeClass.warning)} />
              ) : null}
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "settings"}
              onClick={() => setTab("settings")}
              className={SEGMENTED_TRIGGER}
            >
              Налаштування
            </Button>
          </SegmentedGroup>
        }
        topRight={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {tab !== "settings" ? (
              <Button
                variant="outline"
                onClick={() => setTab("settings")}
                className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Редагувати
              </Button>
            ) : null}
            <Button onClick={openRequestDialog} className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}>
              <Plus className="h-4 w-4" aria-hidden />
              Подати заявку
            </Button>
          </div>
        }
      />
    ),
    [openRequestDialog, pendingRequestsCount, setTab, tab]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (showSkeleton) return <PageLoading />;

  const employmentDuration = formatEmploymentDuration(startDate);
  const employmentDays = getEmploymentDurationDays(startDate);
  const probation = getProbationSummary(startDate, probationEndDate);
  const resolvedEmploymentStatus = normalizeEmploymentStatus(employmentStatus, probationEndDate);
  const employmentStatusTone =
    resolvedEmploymentStatus === "active"
      ? "tone-success"
      : resolvedEmploymentStatus === "inactive"
      ? "border-border bg-muted text-muted-foreground"
      : resolvedEmploymentStatus === "rejected"
      ? "tone-danger"
      : "tone-warning";
  const employmentDescription =
    resolvedEmploymentStatus === "active"
      ? "Ти вже працюєш у компанії в штатному статусі."
      : resolvedEmploymentStatus === "inactive"
      ? "У профілі зафіксовано, що співпрацю з компанією завершено."
      : resolvedEmploymentStatus === "rejected"
      ? "Зафіксовано рішення, що після випробувального терміну співпрацю не продовжили."
      : probation
      ? probation.caption
      : "Адміністратор може задати дату завершення випробувального в управлінні командою.";

  // Таймлайн співпраці: старт → (випробувальний) → сьогодні.
  const probationActive = resolvedEmploymentStatus === "probation" && Boolean(probation);
  const journeyEnded = resolvedEmploymentStatus === "inactive" || resolvedEmploymentStatus === "rejected";
  let journeyFillPercent = 100;
  let probationMilestonePercent: number | null = null;
  if (startDate) {
    if (probationActive && probation) {
      journeyFillPercent = Math.max(4, Math.min(96, probation.progress));
    } else if (probationEndDate) {
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      const probationMs = new Date(`${probationEndDate}T00:00:00`).getTime();
      const nowMs = Date.now();
      if (probationMs > startMs && nowMs > probationMs) {
        probationMilestonePercent = Math.max(
          8,
          Math.min(60, ((probationMs - startMs) / (nowMs - startMs)) * 100)
        );
      }
    }
  }

  const currentDeviceLabel = describeCurrentDevice();
  const lastSignInLabel = formatSignInMoment(session?.user?.last_sign_in_at);

  const todayLabel = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const birthdayLabel = birthDate
    ? new Date(`${birthDate}T00:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })
    : null;

  const absenceDaysOf = (absence: TeamAbsence) =>
    isQuotaAbsenceKind(absence.kind)
      ? countQuotaDaysInYear(absence.kind, absence, year, workdayCalendar?.exceptions)
      : null;

  const renderAbsenceRow = (absence: TeamAbsence, options?: { withCancel?: boolean }) => {
    const days = absenceDaysOf(absence);
    return (
      <div key={absence.id} className="flex items-center gap-3 py-2.5">
        <AbsenceKindChip kind={absence.kind} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium tabular-nums text-foreground">
            {formatAbsenceRange(absence)}
            {days != null ? <span className="text-muted-foreground"> · {days} дн</span> : null}
          </div>
          {absence.comment ? (
            <div className="truncate text-xs text-muted-foreground">{absence.comment}</div>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold",
            toneBadgeClass[TEAM_ABSENCE_STATUS_TONE[absence.status]]
          )}
        >
          {TEAM_ABSENCE_STATUS_LABELS[absence.status]}
        </span>
        {options?.withCancel && absence.status === "pending" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs text-muted-foreground"
            onClick={() => handleCancelRequest(absence)}
            disabled={cancelingId === absence.id}
          >
            {cancelingId === absence.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Скасувати"}
          </Button>
        ) : null}
      </div>
    );
  };

  const identityCard = (
    <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="relative mx-auto shrink-0 md:mx-0">
          <AvatarBase
            src={avatarUrl}
            name={displayName || "Користувач"}
            fallback={initials}
            assetVariant="hero"
            size={96}
            shape="circle"
            className="border-4 border-card bg-card text-foreground ring-1 ring-black/5"
            imageClassName="object-cover"
            fallbackClassName="text-2xl font-bold text-foreground"
          />
          <Button
            type="button"
            variant="inverted"
            size="iconXs"
            onClick={handlePickAvatar}
            className="absolute bottom-0.5 right-0.5 border-[3px] border-card shadow-sm"
            aria-label="Змінити фото профілю"
            disabled={avatarUploading}
          >
            {avatarUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {displayName || "Користувач"}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                accessRole === "owner"
                  ? "tone-accent"
                  : accessRole === "admin"
                  ? "border-primary/20 bg-primary/10 text-foreground"
                  : "border-border bg-background/80 text-muted-foreground"
              )}
            >
              {accessRole === "owner" ? "Super Admin" : accessRole === "admin" ? "Admin" : "Member"}
            </span>
            {jobRole ? (
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                {jobRole}
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                employmentStatusTone
              )}
            >
              {getEmploymentStatusLabel(resolvedEmploymentStatus)}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:justify-start">
            {phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                <span className="tabular-nums">{phone}</span>
              </span>
            ) : null}
            {email ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {email}
              </span>
            ) : null}
            {tgUsername ? (
              <span className="inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" aria-hidden />@{tgUsername}
              </span>
            ) : null}
            {birthdayLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <Cake className="h-3.5 w-3.5" aria-hidden />
                ДН — {birthdayLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 text-right lg:block">
          <div className="text-2xs uppercase tracking-caps text-muted-foreground">Стаж</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {employmentDuration || "—"}
          </div>
          {employmentDays !== null && employmentDays >= 0 ? (
            <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {employmentDays} днів у компанії
            </div>
          ) : null}
        </div>
      </div>

      {startDate ? (
        <div className="mt-6 border-t border-border/40 pt-6">
          <div className="relative mx-1 h-1.5 rounded-full bg-muted/60">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full opacity-60",
                journeyEnded
                  ? "bg-muted-foreground/40"
                  : probationActive
                  ? "tone-dot-warning"
                  : "tone-dot-success"
              )}
              style={{ width: `${journeyFillPercent}%` }}
            />
            {/* Старт */}
            <span className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card tone-dot-success shadow-sm" />
            <span className="absolute left-0 top-4 text-left">
              <span className="block text-xs font-semibold tabular-nums text-foreground">
                {formatEmploymentDate(startDate)}
              </span>
              <span className="block text-2xs text-muted-foreground">старт співпраці</span>
            </span>

            {/* Випробувальний пройдено (мітка на прямій, коли він позаду) */}
            {probationMilestonePercent !== null && probationEndDate ? (
              <>
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card tone-dot-success shadow-sm"
                  style={{ left: `${probationMilestonePercent}%` }}
                />
                <span
                  className="absolute top-4 hidden -translate-x-1/2 text-center sm:block"
                  style={{ left: `${probationMilestonePercent}%` }}
                >
                  <span className="block text-xs font-semibold text-foreground">
                    Випробувальний пройдено
                  </span>
                  <span className="block text-2xs tabular-nums text-muted-foreground">
                    {formatEmploymentDate(probationEndDate)}
                  </span>
                </span>
              </>
            ) : null}

            {/* Сьогодні / кінець випробувального */}
            {probationActive && probation ? (
              <>
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card tone-dot-warning shadow-sm"
                  style={{ left: `${journeyFillPercent}%` }}
                />
                <span className="absolute right-0 top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-muted-foreground/40 shadow-sm" />
                <span className="absolute right-0 top-4 text-right">
                  <span className="block text-xs font-semibold text-foreground">{probation.statusLabel}</span>
                  <span className="block text-2xs tabular-nums text-muted-foreground">
                    до {probation.endLabel} · {probation.progress}%
                  </span>
                </span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "absolute right-0 top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card shadow-sm",
                    journeyEnded ? "bg-muted-foreground/40" : "tone-dot-success"
                  )}
                />
                <span className="absolute right-0 top-4 text-right">
                  <span className="block text-xs font-semibold text-foreground">
                    {journeyEnded ? getEmploymentStatusLabel(resolvedEmploymentStatus) : "Сьогодні"}
                  </span>
                  <span className="block text-2xs tabular-nums text-muted-foreground">
                    {employmentDuration || "—"}
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="h-11" aria-hidden />
          <p className="text-xs text-muted-foreground">{employmentDescription}</p>
        </div>
      ) : null}
    </div>
  );

  const todaySection = (label: string, countValue: number, moreHref?: string, moreLabel?: string) => (
    <div className="flex items-center gap-2">
      <span className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">{label}</span>
      <span className="text-2xs tabular-nums text-muted-foreground/80">{countValue}</span>
      {moreHref ? (
        <Link to={moreHref} className="ml-auto text-xs font-semibold text-foreground hover:underline">
          {moreLabel ?? "Всі"} →
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4 pb-8">
      {tab === "overview" ? (
        <>
          {identityCard}

          {avatarDraftUrl ? (
            <div className="rounded-inner border border-border/40 bg-card p-4 shadow-card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative h-40 w-40 overflow-hidden rounded-full border border-border bg-background">
                  <Cropper
                    image={avatarDraftUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Оновлення фото</div>
                    <div className="mt-1 text-sm text-muted-foreground">Піджени кадрування і збережи новий аватар.</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">Zoom</label>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="h-10" onClick={handleCropCancel} disabled={avatarUploading}>
                      Скасувати
                    </Button>
                    <Button type="button" className="h-10" onClick={handleCropSave} disabled={avatarUploading || !croppedAreaPixels}>
                      {avatarUploading ? "Завантажую..." : "Застосувати"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                  Сьогодні
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{todayLabel}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {todayLoading ? (
                  <div className="space-y-2" aria-hidden>
                    <div className="h-9 animate-pulse rounded-lg bg-muted/40" />
                    <div className="h-9 animate-pulse rounded-lg bg-muted/40" />
                    <div className="h-9 animate-pulse rounded-lg bg-muted/40" />
                  </div>
                ) : (
                  <>
                    <div>
                      {todaySection("Нагадування", todayReminders.length, "/notifications")}
                      {todayReminders.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">На сьогодні нагадувань немає.</p>
                      ) : (
                        <div className="mt-1 divide-y divide-border/30">
                          {todayReminders.slice(0, 4).map((reminder) => (
                            <div key={reminder.id} className="flex items-center gap-3 py-2">
                              <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                {formatReminderTime(reminder.remindAt)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">{reminder.name}</div>
                                {reminder.comment ? (
                                  <div className="truncate text-xs text-muted-foreground">{reminder.comment}</div>
                                ) : null}
                              </div>
                              <span className="shrink-0 text-2xs text-muted-foreground">
                                {reminder.source === "lead" ? "лід" : "клієнт"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {myQuotes.length > 0 ? (
                      <div className="border-t border-border/40 pt-3">
                        {todaySection("Мої активні прорахунки", myQuotes.length, "/orders/estimates", "У прорахунки")}
                        <div className="mt-1 divide-y divide-border/30">
                          {myQuotes.slice(0, 3).map((quote) => (
                            <div key={quote.id} className="flex items-center gap-3 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                  <span className="tabular-nums">{quote.number || "Без номера"}</span>
                                  {quote.customer_name ? (
                                    <span className="text-muted-foreground"> · {quote.customer_name}</span>
                                  ) : quote.title ? (
                                    <span className="text-muted-foreground"> · {quote.title}</span>
                                  ) : null}
                                </div>
                              </div>
                              {quote.deadline_at ? (
                                <span
                                  className={cn(
                                    "shrink-0 text-xs tabular-nums",
                                    new Date(quote.deadline_at).getTime() < Date.now()
                                      ? "tone-text-danger font-semibold"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  до {formatDeadlineShort(quote.deadline_at)}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {myDesignTasks.length > 0 ? (
                      <div className="border-t border-border/40 pt-3">
                        {todaySection("Мої дизайн-задачі", myDesignTasks.length, "/design", "У дизайн")}
                        <div className="mt-1 divide-y divide-border/30">
                          {myDesignTasks.slice(0, 3).map((task) => {
                            const deadline = designTaskDeadline(task.metadata);
                            return (
                              <div key={task.id} className="flex items-center gap-3 py-2">
                                <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                  {task.title || "Дизайн-задача"}
                                </div>
                                {deadline ? (
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    до {formatDeadlineShort(deadline)}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {todayReminders.length === 0 && myQuotes.length === 0 && myDesignTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Сьогодні без нагадувань і активних задач — чистий горизонт.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UserCheck className="h-4 w-4 text-primary" aria-hidden />
                    Мій баланс — {year}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {absencesLoading || !myBalance ? (
                    <div className="h-14 animate-pulse rounded-lg bg-muted/40" aria-hidden />
                  ) : (
                    <AbsenceBalanceMeters balance={myBalance} entries={balanceEntries} year={year} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                    Мої заявки
                    <button
                      type="button"
                      onClick={() => setTab("absences")}
                      className="ml-auto text-xs font-semibold text-foreground hover:underline"
                    >
                      Всі →
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {absencesLoading ? (
                    <div className="h-14 animate-pulse rounded-lg bg-muted/40" aria-hidden />
                  ) : myAbsences.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Цього року заявок ще не було.</p>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {myAbsences.slice(0, 3).map((absence) => renderAbsenceRow(absence))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      {tab === "absences" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Card className="self-start">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-primary" aria-hidden />
                Мій баланс — {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {absencesLoading || !myBalance ? (
                <div className="h-14 animate-pulse rounded-lg bg-muted/40" aria-hidden />
              ) : (
                <>
                  <AbsenceBalanceMeters balance={myBalance} entries={balanceEntries} year={year} />
                  <p className="mt-3 border-t border-border/40 pt-2.5 text-2xs text-muted-foreground">
                    Відпустка міряється календарними днями — вихідні всередині неї квоту списують.
                    Day-off і лікарняний рахуються робочими. Свята не списують нічого.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                Мої заявки — {year}
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                  {myAbsences.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {absencesLoading ? (
                <div className="space-y-2" aria-hidden>
                  <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
                  <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
                </div>
              ) : myAbsences.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center">
                  <p className="text-sm font-medium text-foreground">Цього року заявок ще не було</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Відпустка, day-off чи лікарняний — кнопка «Подати заявку» вгорі.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {myAbsences.map((absence) => renderAbsenceRow(absence, { withCancel: true }))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card">
              <div className="mb-5">
                <div className="text-lg font-semibold text-foreground">Особисті дані</div>
                <div className="mt-1 text-sm text-muted-foreground">Інформація, яку бачать інші учасники команди.</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Імʼя</label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Введи імʼя" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Прізвище</label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Введи прізвище" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Дата народження</label>
                  <DateInput value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Телефон</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input value={email} disabled />
                  <p className="text-xs text-muted-foreground">Змінити email можна лише через звернення до адміністратора.</p>
                </div>
              </div>
              <div className="-mx-5 -mb-5 mt-5 flex flex-col gap-3 rounded-b-inner border-t border-border/60 bg-muted/20 px-5 py-3 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground sm:mr-auto">Ці дані бачить уся команда.</p>
                <Button onClick={updateProfile} disabled={updating} className="h-9 sm:min-w-[180px]">
                  {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Зберегти зміни
                </Button>
              </div>
            </div>

            <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card">
              <div className="mb-5">
                <div className="text-lg font-semibold text-foreground">Безпека</div>
                <div className="mt-1 text-sm text-muted-foreground">Оновлення пароля та базовий захист акаунту.</div>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Пароль</label>
                  <Input disabled value="••••••••••••••" type="password" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-[140px]"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  Змінити пароль
                </Button>
              </div>

              <div className="mt-5 border-t border-border/60 pt-5">
                <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-full border border-border bg-muted/30 p-2 text-muted-foreground">
                      <MonitorSmartphone className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        {currentDeviceLabel}
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold", toneBadgeClass.success)}>
                          ця сесія
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {lastSignInLabel ? (
                          <>Вхід <span className="tabular-nums">{lastSignInLabel}</span></>
                        ) : (
                          "Активна сесія цього браузера"
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 md:min-w-[190px]"
                    onClick={() => setSignOutOthersOpen(true)}
                  >
                    Вийти на інших пристроях
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  CRM бачить лише сесію цього браузера — списку інших пристроїв немає ні в кого.
                  Кнопка завершує решту сесій наосліп — поточна лишається активною.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card">
              <div className="mb-5">
                <div className="text-lg font-semibold text-foreground">Telegram-бот</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Сповіщення CRM у Telegram через бота @{TELEGRAM_BOT_USERNAME}. А ще там можна
                  спитати «хто сьогодні відсутній», написати «хворію» чи «day-off 15.08» — і
                  лікарняний або заявка оформляться без відкриття CRM (команда /absence).
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Send className="h-4 w-4 text-primary" />
                      {tgChatId != null ? "Telegram підключено" : "Telegram не підключено"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {tgChatId != null
                        ? tgUsername
                          ? `Акаунт @${tgUsername}`
                          : "Акаунт підключено"
                        : "Натисни «Підключити» — відкриється бот, там натисни Start."}
                    </div>
                  </div>
                  {tgChatId != null ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={tgEnabled ? "primary" : "outline"}
                        className="min-w-[132px]"
                        onClick={handleTelegramToggle}
                        disabled={tgBusy}
                      >
                        {tgEnabled ? "Увімкнено" : "Вимкнено"}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleTelegramDisconnect} disabled={tgBusy}>
                        Відключити
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[168px]"
                      onClick={handleTelegramConnect}
                      disabled={tgBusy}
                    >
                      {tgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Підключити Telegram"}
                    </Button>
                  )}
                </div>
                {tgChatId == null && tgLinkHint ? (
                  <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <span>Натиснув Start у боті?</span>
                    <Button type="button" variant="ghost" className="h-8" onClick={handleTelegramRefresh} disabled={tgBusy}>
                      Я підключив — оновити статус
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card">
              <div className="mb-4">
                <div className="text-lg font-semibold text-foreground">Тихі години</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Коли команду не будять сповіщеннями про події.
                </div>
              </div>
              <div className="rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Moon className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {NOTIFY_UNTIL_HOUR}:00 — {NOTIFY_FROM_HOUR}:00
                  </span>
                  <span className={cn("ml-auto inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold", toneBadgeClass.neutral)}>
                    Київ
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-muted-foreground">
                  Денні події — дні народження, відпустки, нагадування — чекають до {NOTIFY_FROM_HOUR}:00,
                  а не приходять опівночі. Аварійні сигнали системи будять завжди: у тому їхній сенс.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Вікно спільне для всієї команди — персонально його поки не змінити.
                </p>
              </div>
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className="rounded-inner border border-border/40 bg-card p-5 shadow-card">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <BellRing className="h-4 w-4 text-primary" aria-hidden />
                    Що і куди надсилати
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Кожен тип сповіщення — окремо для push і Telegram. У самій CRM сповіщення
                    приходять завжди.
                    {tgChatId == null ? " Telegram увімкнеться після підключення бота." : ""}
                  </div>
                </div>
                <Button asChild type="button" variant="outline" className="shrink-0">
                  <Link to="/notifications">Стрічка сповіщень</Link>
                </Button>
              </div>
              {/* Ролі — з локального стану (memberships_view по справжньому user.id),
                  а НЕ з useAuth: у режимі «Дивитись як» той віддав би ролі людини,
                  за яку дивляться, і власник правив би свої налаштування чужим
                  списком категорій. */}
              <NotificationChannelMatrix
                userId={userId}
                accessRole={accessRole || null}
                jobRole={jobRole}
                telegramLinked={tgChatId != null}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Push, спливні вікна та звук залежать від пристрою — вони лишились у стрічці сповіщень.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) {
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Змінити пароль</DialogTitle>
            <DialogDescription>Новий пароль почне діяти одразу — виходити з акаунта не потрібно.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-new-password">
                Новий пароль
              </label>
              <PasswordInput
                id="profile-new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Мінімум 6 символів"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-confirm-password">
                Повтори пароль
              </label>
              <PasswordInput
                id="profile-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ще раз той самий"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={passwordSaving}>
              Скасувати
            </Button>
            <Button
              type="button"
              onClick={handlePasswordSave}
              disabled={passwordSaving || !newPassword || !confirmPassword}
            >
              {passwordSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Зберегти пароль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={signOutOthersOpen} onOpenChange={setSignOutOthersOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вийти на інших пристроях?</AlertDialogTitle>
            <AlertDialogDescription>
              Усі сесії, крім поточної, буде завершено — на телефоні й інших комп'ютерах доведеться
              увійти заново. Ця вкладка продовжить працювати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOutOthers}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleSignOutOthers();
              }}
              disabled={signingOutOthers}
            >
              {signingOutOthers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Завершити інші сесії
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {absenceDialogInitial ? (
        <AbsenceDialog
          open={absenceDialogOpen}
          onOpenChange={setAbsenceDialogOpen}
          initial={absenceDialogInitial}
          people={
            userId
              ? [
                  {
                    userId,
                    name: displayName || "Я",
                    roleLabel: jobRole ?? undefined,
                    avatarUrl,
                    initials,
                  },
                ]
              : []
          }
          canPickPerson={false}
          balanceOf={(id) => (myBalance && id === myBalance.userId ? myBalance : null)}
          exceptions={workdayCalendar?.exceptions}
          holidayNames={workdayCalendar?.holidayNames}
          saving={absenceSaving}
          mode="request"
          approverLabel={approverLabel}
          todayKey={todayKey}
          findOwnConflict={findOwnConflict}
          onSubmit={handleAbsenceSubmit}
        />
      ) : null}
    </div>
  );
}
