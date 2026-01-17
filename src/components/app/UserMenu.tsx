import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, MoreVertical, SlidersHorizontal, User } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { AppDropdown } from "@/components/app/AppDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { ROLE_TEXT_CLASSES } from "@/lib/roleBadges";

// Словник для красивого відображення ролей
const ROLE_NAMES: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Менеджер",
  viewer: "Глядач",
  player: "Гравець"
};

export function UserMenu({ mobile = false }: { mobile?: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({
    name: "Завантаження...",
    role: "...",
    initials: "..",
    avatarUrl: null as string | null,
    roleKey: "viewer"
  });

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

        // 2. Отримуємо реальну роль через RPC функцію (як в App.tsx)
        const { data: roleData } = await supabase.rpc('current_team_role');
        
        // Перетворюємо 'super_admin' -> 'Super Admin'
        const rawRole = (roleData as string) || "viewer";
        const displayRole = ROLE_NAMES[rawRole] || rawRole;

        setUserData({
          name: fullName,
          role: displayRole,
          initials: initials,
          avatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
          roleKey: rawRole
        });
      }
      setLoading(false);
    }
    getUserData();
  }, []);

  const handleLogout = async () => {
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
        <AvatarBase
          src={userData.avatarUrl}
          name={userData.name}
          fallback={userData.initials}
          size={36}
          shape="rounded"
          className="border-border"
          imageClassName="object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{userData.name}</div>
          <div
            className={cn("truncate text-[11px]", ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground")}
          >
            {userData.role}
          </div>
        </div>
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
              <div
                className={cn(
                  "truncate text-[11px] mt-0.5",
                  ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground"
                )}
              >
                {userData.role}
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
