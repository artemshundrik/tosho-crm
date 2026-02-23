import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, MoreVertical, User } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { AppDropdown } from "@/components/app/AppDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { ROLE_TEXT_CLASSES } from "@/lib/roleBadges";
import { resolveWorkspaceId } from "@/lib/workspace";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

const ACCESS_ROLE_NAMES: Record<string, string> = {
  owner: "Super Admin",
  admin: "Admin",
  member: "Member",
};

const JOB_ROLE_NAMES: Record<string, string> = {
  manager: "Менеджер",
  designer: "Дизайнер",
  logistics: "Логіст",
  accountant: "Бухгалтер",
  seo: "SEO",
  member: "Member",
};

type UserMenuProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  compact?: boolean;
};

type UserState = {
  name: string;
  accessRole: string;
  jobRole: string | null;
  initials: string;
  avatarUrl: string | null;
  roleKey: string;
};

let cachedUserData: UserState | null = null;

export function UserMenu({ mobile = false, onNavigate, compact = false }: UserMenuProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!cachedUserData);
  const [userData, setUserData] = useState<UserState>(
    cachedUserData ?? {
      name: "Завантаження...",
      accessRole: "...",
      jobRole: null,
      initials: "..",
      avatarUrl: null,
      roleKey: "viewer",
    }
  );

  useEffect(() => {
    async function getUserData() {
      // 1. Отримуємо дані про самого юзера (email, ім'я)
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Пробуємо взяти ім'я з метаданих або з пошти
        const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Користувач";
        
        // Генеруємо ініціали
        const initials = fullName
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();

        const workspaceId = await resolveWorkspaceId(user.id);

        let rawRole = "viewer";
        let accessRoleLabel = ACCESS_ROLE_NAMES.member;
        let jobRoleLabel: string | null = null;
        if (workspaceId) {
          const { data: membership } = await supabase
            .schema("tosho")
            .from("memberships_view")
            .select("access_role,job_role")
            .eq("workspace_id", workspaceId)
            .eq("user_id", user.id)
            .maybeSingle();

          const membershipData = (membership as { access_role?: string | null; job_role?: string | null } | null) ?? null;
          const accessRole = membershipData?.access_role ?? "member";
          const jobRole = membershipData?.job_role ?? null;

          accessRoleLabel = ACCESS_ROLE_NAMES[accessRole] ?? "Member";
          if (jobRole && jobRole !== "member") {
            jobRoleLabel = JOB_ROLE_NAMES[jobRole] ?? jobRole;
          }

          if (accessRole === "owner") rawRole = "super_admin";
          else if (accessRole === "admin") rawRole = "manager";
          else rawRole = "viewer";
        }

        const rawAvatarUrl = (user.user_metadata?.avatar_url as string | undefined) || null;
        const avatarUrl = await resolveAvatarDisplayUrl(supabase, rawAvatarUrl, AVATAR_BUCKET);

        const nextData: UserState = {
          name: fullName,
          accessRole: accessRoleLabel,
          jobRole: jobRoleLabel,
          initials: initials,
          avatarUrl,
          roleKey: rawRole
        };
        cachedUserData = nextData;
        setUserData(nextData);
      }
      setLoading(false);
    }
    getUserData();
  }, []);

  useEffect(() => {
    const handleAvatarUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ avatarUrl?: string }>;
      const rawAvatar = customEvent.detail?.avatarUrl ?? null;
      const nextAvatar = await resolveAvatarDisplayUrl(supabase, rawAvatar, AVATAR_BUCKET);
      setUserData((prev) => {
        const next = { ...prev, avatarUrl: nextAvatar };
        cachedUserData = next;
        return next;
      });
    };

    window.addEventListener("profile:avatar-updated", handleAvatarUpdated as EventListener);
    return () => {
      window.removeEventListener("profile:avatar-updated", handleAvatarUpdated as EventListener);
    };
  }, []);

  const handleLogout = async () => {
    onNavigate?.();
    await supabase.auth.signOut();
    navigate("/login");
  };

  // === Мобільна версія ===
  if (mobile) {
    if (loading) {
      return (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] p-3 bg-muted/40">
          <Skeleton className="h-9 w-9 rounded-[var(--radius-lg)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-[var(--radius-lg)]" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] p-3 bg-muted/40">
        <Button
          type="button"
          variant="ghost"
          className="h-auto flex-1 justify-start gap-3 px-0 py-0"
          onClick={() => {
            onNavigate?.();
            navigate("/profile");
          }}
        >
          <AvatarBase
            src={userData.avatarUrl}
            name={userData.name}
            fallback={userData.initials}
            size={36}
            shape="rounded"
            className="border-border"
            imageClassName="object-cover"
          />
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[13px] font-semibold">{userData.name}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px]">
              <span className={cn("truncate", ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground")}>
                {userData.accessRole}
              </span>
              {userData.jobRole ? (
                <>
                  <span className="text-muted-foreground/70">•</span>
                  <span className="truncate text-muted-foreground">{userData.jobRole}</span>
                </>
              ) : null}
            </div>
          </div>
        </Button>
        <Button
          type="button"
          variant="controlDestructive"
          size="iconSm"
          onClick={handleLogout}
          title="Вийти"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // === Десктопна версія ===
  if (loading) {
    if (compact) {
      return (
        <div className="flex items-center justify-center">
          <Skeleton className="h-10 w-10 rounded-[var(--radius-lg)]" />
        </div>
      );
    }
    return (
      <div className="w-full rounded-[var(--radius-lg)] border border-border bg-card/60 px-3 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-[var(--radius-lg)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-8 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-center">
        <AppDropdown
          align="start"
          side="top"
          sideOffset={10}
          contentClassName="w-[250px]"
          trigger={
            <Button
              type="button"
              variant="menu"
              size="icon"
              className="h-10 w-10 rounded-[var(--radius-lg)] p-0"
              title={userData.name}
              aria-label="Меню профілю"
            >
              <AvatarBase
                src={userData.avatarUrl}
                name={userData.name}
                fallback={userData.initials}
                size={32}
                shape="rounded"
                className="border-border"
                imageClassName="object-cover"
              />
            </Button>
          }
          items={[
            { type: "label", label: "Акаунт" },
            { type: "separator" },
            {
              label: (
                <>
                  <User className="mr-2 h-4 w-4" />
                  Мій профіль
                </>
              ),
              onSelect: () => navigate("/profile"),
            },
            { type: "separator" },
            {
              label: (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Вийти
                </>
              ),
              onSelect: handleLogout,
              destructive: true,
            },
          ]}
        />
      </div>
    );
  }

  return (
    <AppDropdown
      align="start"
      side="top"
      sideOffset={10}
      contentClassName="w-[250px]"
      triggerClassName="flex w-full"
      trigger={
        <Button
          type="button"
          variant="menu"
          size="md"
          className={cn(
            "w-full h-auto rounded-[var(--radius-lg)] px-2 py-2.5 text-left"
          )}
        >
          <div className="flex items-center gap-2">
            <AvatarBase
              src={userData.avatarUrl}
              name={userData.name}
              fallback={userData.initials}
              size={36}
              shape="rounded"
              className="border-border"
              imageClassName="object-cover"
            />

            <div className="min-w-0 flex-1 text-left leading-tight">
              <div className="truncate text-[13px] font-semibold">{userData.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                <span className={cn("truncate", ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground")}>
                  {userData.accessRole}
                </span>
                {userData.jobRole ? (
                  <>
                    <span className="text-muted-foreground/70">•</span>
                    <span className="truncate text-muted-foreground">{userData.jobRole}</span>
                  </>
                ) : null}
              </div>
            </div>

            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </Button>
      }
      items={[
        { type: "label", label: "Акаунт" },
        { type: "separator" },
        {
          label: (
            <>
              <User className="mr-2 h-4 w-4" />
              Мій профіль
            </>
          ),
          onSelect: () => navigate("/profile"),
        },
        { type: "separator" },
        {
          label: (
            <>
              <LogOut className="mr-2 h-4 w-4" />
              Вийти
            </>
          ),
          onSelect: handleLogout,
          destructive: true,
        },
      ]}
    />
  );
}
