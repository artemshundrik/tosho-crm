import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { User, Mail, Save, Loader2, Camera, Lock, Globe, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/app/page-skeleton-templates";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Cropper, { type Area } from "react-easy-crop";
import { usePageCache } from "@/hooks/usePageCache";
import { resolveWorkspaceId } from "@/lib/workspace";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";
import { buildUserNameFromMetadata, getInitialsFromName, toFullName } from "@/lib/userName";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

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
  
  // Показуємо skeleton тільки якщо немає кешу
  const shouldShowSkeleton = loading && !hasCache;
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
        setFirstName(resolvedName.firstName);
        setLastName(resolvedName.lastName);
        setFullName(resolvedName.fullName);
        setDisplayName(resolvedName.displayName);
        setBirthDate(metaBirthDate);
        const rawAvatarUrl = (user.user_metadata?.avatar_url as string | undefined) || null;
        const displayAvatarUrl = await resolveAvatarDisplayUrl(supabase, rawAvatarUrl, AVATAR_BUCKET);
        setAvatarUrl(displayAvatarUrl);

        const i = getInitialsFromName(resolvedName.displayName, user.email);
        setInitials(i);

        const resolvedWorkspaceId = await resolveWorkspaceId(user.id);
        let resolvedAccessRole = "member";
        let resolvedJobRole: string | null = null;

        if (resolvedWorkspaceId) {
          const { data: membership } = await supabase
            .schema("tosho")
            .from("memberships_view")
            .select("access_role, job_role")
            .eq("workspace_id", resolvedWorkspaceId)
            .eq("user_id", user.id)
            .single();

          resolvedAccessRole = (membership?.access_role as string) || "member";
          resolvedJobRole = (membership?.job_role as string) || null;
        }

        setAccessRole(resolvedAccessRole);
        setJobRole(resolvedJobRole);

        setCache({
          userId: user.id,
          firstName: resolvedName.firstName,
          lastName: resolvedName.lastName,
          fullName: resolvedName.fullName,
          displayName: resolvedName.displayName,
          birthDate: metaBirthDate,
          email: user.email || "",
          accessRole: resolvedAccessRole,
          jobRole: resolvedJobRole,
          initials: i,
          avatarUrl: displayAvatarUrl,
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

  const getCroppedBlob = async (imageSrc: string, cropArea: Area): Promise<Blob | null> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

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
      size,
      size
    );

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
  };

  const uploadAvatarBlob = async (blob: Blob) => {
    if (!userId) return;
    setAvatarUploading(true);
    try {
      const fileName = `avatar-${Date.now()}.png`;
      const uploadedPath = `avatars/${userId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedPath, blob, { upsert: true, contentType: blob.type || "image/png" });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedPath);
      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (updateError) throw updateError;
      await supabase.auth.refreshSession();
      const displayAvatarUrl = await resolveAvatarDisplayUrl(supabase, publicUrl, AVATAR_BUCKET);
      setAvatarUrl(displayAvatarUrl);
      setAvatarDraftUrl(null);
      commitCache({ avatarUrl: displayAvatarUrl });
      window.dispatchEvent(
        new CustomEvent("profile:avatar-updated", { detail: { avatarUrl: displayAvatarUrl } })
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
    const blob = await getCroppedBlob(avatarDraftUrl, croppedAreaPixels);
    if (!blob) return;
    await uploadAvatarBlob(blob);
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
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: nextFirstName || null,
          last_name: nextLastName || null,
          full_name: nextFullName || null,
          birth_date: birthDate || null,
          avatar_url: avatarUrl,
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

  if (loading) {
    if (shouldShowSkeleton) return <DetailSkeleton />;
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-8">
      
      {/* Картка профілю: використовуємо системні змінні для кольорів та радіусів */}
      <div className={cn(
        "bg-card border border-border overflow-hidden",
        "shadow-surface", // Твій кастомний клас тіні з CSS
        "rounded-[var(--radius-section)]" // Велике заокруглення (як --radius-section)
      )}>
        
        {/* Banner: градієнт на основі Primary кольору (працює і в темній темі) */}
        <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/5 to-background/0 relative">
          <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
        </div>
        
        <div className="px-6 pb-8 md:px-10">
          {/* Avatar Row */}
          <div className="relative -mt-12 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-6">
              
              {/* Avatar Wrapper */}
              <div className="relative group mx-auto sm:mx-0">
                <AvatarBase
                  src={avatarUrl}
                  name={displayName || "Користувач"}
                  fallback={initials}
                  size={112}
                  shape="circle"
                  className="border-[4px] border-card shadow-lg bg-card text-foreground"
                  imageClassName="object-cover"
                  fallbackClassName="text-3xl font-bold text-foreground"
                />
                
                {/* Edit Photo Button */}
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
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
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
              
              <div className="mb-3 space-y-1.5 text-center sm:text-left">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">{displayName || "Користувач"}</h2>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                   {/* Role Badge: Soft style */}
                   <div
                     className={cn(
                       "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold",
                       accessRole === "owner"
                         ? "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-500/20"
                         : accessRole === "admin"
                         ? "bg-primary/10 text-foreground border-primary/20"
                         : "bg-muted text-muted-foreground border-border"
                     )}
                   >
                      {accessRole === "owner"
                        ? "Super Admin"
                        : accessRole === "admin"
                        ? "Admin"
                        : "Member"}
                   </div>
                   <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Kyiv, UA
                   </span>
                </div>
              </div>
            </div>

            <Button onClick={updateProfile} disabled={updating} className="shadow-sm hidden sm:flex">
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Зберегти зміни
            </Button>
          </div>

          {avatarDraftUrl ? (
            <div className="mb-8 rounded-[var(--radius-inner)] border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="relative h-36 w-36 overflow-hidden rounded-full border border-border bg-background">
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

                <div className="flex flex-col gap-3 md:flex-1">
                  <label className="text-xs font-semibold text-muted-foreground">Zoom</label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={handleCropCancel}
                      disabled={avatarUploading}
                    >
                      Скасувати
                    </Button>
                    <Button
                      type="button"
                      className="h-9"
                      onClick={handleCropSave}
                      disabled={avatarUploading || !croppedAreaPixels}
                    >
                      {avatarUploading ? "Завантажую..." : "Застосувати"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <Separator className="my-8" />

          {/* Form Grid */}
          <div className="grid gap-8 md:grid-cols-[250px_1fr]">
            
            {/* Section Title */}
            <div>
               <h3 className="text-lg font-semibold text-foreground">Особисті дані</h3>
               <p className="text-sm text-muted-foreground mt-1">Інформація, яку бачать інші учасники команди.</p>
            </div>

            {/* Inputs */}
            <div className="space-y-5 max-w-lg">
              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Імʼя
                </label>
                <Input 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Введи імʼя"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Прізвище
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Введи прізвище"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Дата народження
                </label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Email
                </label>
                <Input 
                  value={email}
                  disabled
                />
                <p className="text-[11px] text-muted-foreground px-1">
                  Змінити email можна лише через звернення до адміністратора.
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Security Section */}
          <div className="grid gap-8 md:grid-cols-[250px_1fr]">
            <div>
               <h3 className="text-lg font-semibold text-foreground">Безпека</h3>
               <p className="text-sm text-muted-foreground mt-1">Оновлення пароля та захист акаунту.</p>
            </div>

            <div className="space-y-5 max-w-lg">
               <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Пароль
                </label>
                <div className="flex gap-3">
                   <div className="relative w-full">
                     <Input 
                        disabled 
                        value="••••••••••••••" 
                        type="password"
                     />
                   </div>
                   <Button asChild variant="outline" className="h-10">
                     <Link to="/reset-password">Змінити</Link>
                   </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Mobile Save Button */}
          <div className="mt-8 sm:hidden">
            <Button onClick={updateProfile} disabled={updating} className="w-full h-11 text-base">
              {updating ? "Зберігаю..." : "Зберегти зміни"}
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
