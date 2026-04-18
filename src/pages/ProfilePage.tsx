import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Save, Loader2, Camera, Globe, BriefcaseBusiness, Hourglass, BellRing } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/app/page-skeleton-templates";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { AvatarBase } from "@/components/app/avatar-kit";
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
import { getCurrentWorkspaceMemberDirectoryEntry, upsertWorkspaceMemberProfile } from "@/lib/workspaceMemberDirectory";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";
const STORAGE_CACHE_CONTROL = "31536000, immutable";
const AVATAR_XS_SIZE = 40;
const AVATAR_MD_SIZE = 64;
const AVATAR_HERO_SIZE = 192;

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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

export function ProfilePage() {
  const { cached, setCache } = usePageCache<ProfileCache>("profile");
  
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

  const getProfile = async () => {
    try {
      // Завантажуємо тільки якщо немає кешу
      if (!hasCache) {
        setLoading(true);
      }
      const { data: { user } } = await supabase.auth.getUser();

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

      const workspaceId = await resolveWorkspaceId(userId);
      if (workspaceId) {
        await upsertWorkspaceMemberProfile({
          workspaceId,
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
        const workspaceId = await resolveWorkspaceId(userId);
        if (workspaceId) {
          await upsertWorkspaceMemberProfile({
            workspaceId,
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

      toast.success("Профіль оновлено!", {
        description: "Твоє нове ім'я збережено в системі.",
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
      setTimeout(() => window.location.reload(), 1000);

    } catch (error: unknown) {
      toast.error("Помилка оновлення", {
        description: getErrorMessage(error, "Не вдалося оновити профіль."),
      });
    } finally {
      setUpdating(false);
    }
  };

  if (showSkeleton) return <DetailSkeleton />;

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
  const employmentHeadline =
    resolvedEmploymentStatus === "active"
      ? "Штатний статус підтверджено"
      : resolvedEmploymentStatus === "inactive"
      ? "Співпрацю завершено"
      : resolvedEmploymentStatus === "rejected"
      ? "Після випробувального не прийнято"
      : probation
      ? `До ${probation.endLabel}`
      : "Кінець випробувального не вказано";
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

  return (
    <div className="mx-auto max-w-6xl py-6">
      <div className="overflow-hidden rounded-[var(--radius-section)] border border-border bg-card shadow-surface">
        <div className="relative overflow-hidden border-b border-border bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_32%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] px-6 pb-8 pt-6 md:px-10">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,hsl(var(--surface-sheen))_18%,transparent_36%)] opacity-60 dark:opacity-20" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-col gap-5 md:flex-row md:items-end">
              <div className="relative mx-auto shrink-0 md:mx-0">
                <AvatarBase
                  src={avatarUrl}
                  name={displayName || "Користувач"}
                  fallback={initials}
                  assetVariant="hero"
                  size={120}
                  shape="circle"
                  className="border-[5px] border-card bg-card text-foreground ring-1 ring-black/5"
                  imageClassName="object-cover"
                  fallbackClassName="text-3xl font-bold text-foreground"
                />
                <Button
                  type="button"
                  variant="inverted"
                  size="iconXs"
                  onClick={handlePickAvatar}
                  className="absolute bottom-1 right-1 border-[3px] border-card shadow-sm"
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

              <div className="space-y-3 text-center md:text-left">
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">{displayName || "Користувач"}</h1>
                  <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
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
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      Kyiv, UA
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[var(--radius)] border border-border/70 bg-background/75 px-3 py-2 text-left">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Старт</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {startDate ? formatEmploymentDate(startDate) : "Не вказано"}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius)] border border-border/70 bg-background/75 px-3 py-2 text-left">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Стаж</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{employmentDuration || "Ще не задано"}</div>
                  </div>
                  <div className="rounded-[var(--radius)] border border-border/70 bg-background/75 px-3 py-2 text-left">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Статус</div>
                    <div className="mt-1">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", employmentStatusTone)}>
                        {getEmploymentStatusLabel(resolvedEmploymentStatus)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={updateProfile} disabled={updating} className="hidden h-11 min-w-[220px] sm:inline-flex">
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Зберегти зміни
            </Button>
          </div>
        </div>

        <div className="px-6 py-6 md:px-10">
          {avatarDraftUrl ? (
            <div className="mb-6 rounded-[var(--radius-inner)] border border-border bg-muted/20 p-4">
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
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Zoom</label>
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

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <div className="space-y-6">
              <div className="rounded-[var(--radius-inner)] border border-border bg-background/70 p-5">
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
                    <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
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
              </div>

              <div className="rounded-[var(--radius-inner)] border border-border bg-background/70 p-5">
                <div className="mb-5">
                  <div className="text-lg font-semibold text-foreground">Безпека</div>
                  <div className="mt-1 text-sm text-muted-foreground">Оновлення пароля та базовий захист акаунту.</div>
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Пароль</label>
                    <Input disabled value="••••••••••••••" type="password" />
                  </div>
                  <Button asChild variant="outline" className="h-10 min-w-[140px]">
                    <Link to="/reset-password">Змінити</Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-[var(--radius-inner)] border border-border bg-background/70 p-5">
                <div className="mb-5">
                  <div className="text-lg font-semibold text-foreground">Сповіщення</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Push, in-app сповіщення та звук тепер зібрані в одному центрі керування.
                  </div>
                </div>
                <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <BellRing className="h-4 w-4 text-primary" />
                      Центр сповіщень
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Відкрий сторінку сповіщень, щоб керувати push, in-app popup та звуком.
                    </div>
                  </div>
                  <Button asChild type="button" variant="outline" className="min-w-[168px]">
                    <Link to="/notifications">Відкрити</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[var(--radius-inner)] border border-border bg-muted/20 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-foreground">Робота в компанії</div>
                    <div className="mt-1 text-sm text-muted-foreground">Стаж, статус роботи і поточний стан співпраці.</div>
                  </div>
                  <div className="rounded-full border border-border bg-background p-2.5 text-muted-foreground">
                    <BriefcaseBusiness className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Дата старту</div>
                      <div className="mt-1.5 text-base font-semibold text-foreground">
                        {startDate ? formatEmploymentDate(startDate) : "Поки не вказано"}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius)] border border-border/70 bg-background px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Стаж</div>
                      <div className="mt-1.5 text-base font-semibold text-foreground">{employmentDuration || "Ще не задано"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {employmentDays !== null && employmentDays >= 0 ? `${employmentDays} днів у компанії` : "Потрібна дата початку"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius)] border border-border/70 bg-background px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {resolvedEmploymentStatus === "probation" ? "Випробувальний термін" : "Статус роботи"}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{employmentHeadline}</div>
                      </div>
                      <div className="rounded-full border border-border bg-muted/30 p-2 text-muted-foreground">
                        <Hourglass className="h-4 w-4" />
                      </div>
                    </div>

                    <div className="mt-4">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", employmentStatusTone)}>
                        {getEmploymentStatusLabel(resolvedEmploymentStatus)}
                      </span>
                    </div>

                    {resolvedEmploymentStatus === "probation" && probation ? (
                      <>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-muted-foreground">{probation.statusLabel}</span>
                          <span className="text-xs text-muted-foreground">{probation.progress}%</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/50">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width]",
                              probation.status === "completed"
                                ? "tone-dot-success"
                                : probation.status === "active"
                                ? "tone-dot-warning"
                                : "bg-muted-foreground/40"
                            )}
                            style={{ width: `${probation.progress}%` }}
                          />
                        </div>
                      </>
                    ) : null}

                    <div
                      className={cn(
                        "mt-4 rounded-[var(--radius)] border px-3 py-3 text-sm",
                        resolvedEmploymentStatus === "active"
                          ? "tone-success-subtle text-foreground"
                          : resolvedEmploymentStatus === "inactive"
                          ? "border-border/70 bg-muted/20 text-foreground"
                          : resolvedEmploymentStatus === "rejected"
                          ? "tone-danger-subtle text-foreground"
                          : "tone-warning-subtle text-foreground"
                      )}
                    >
                      {employmentDescription}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="sm:hidden">
            <Button onClick={updateProfile} disabled={updating} className="h-11 w-full text-base">
              {updating ? "Зберігаю..." : "Зберегти зміни"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
