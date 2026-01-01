import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, MoreVertical, SlidersHorizontal, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    }
    getUserData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // === Мобільна версія ===
  if (mobile) {
    return (
      <div className="flex items-center gap-3 rounded-xl p-3 bg-muted/40">
        <Avatar className="h-9 w-9 rounded-xl border border-border">
          {userData.avatarUrl ? (
            <AvatarImage src={userData.avatarUrl} className="object-cover" />
          ) : null}
          <AvatarFallback className="rounded-xl bg-muted text-xs font-semibold text-muted-foreground">
            {userData.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{userData.name}</div>
          <div
            className={cn("truncate text-[11px]", ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground")}
          >
            {userData.role}
          </div>
        </div>
        <button 
          onClick={handleLogout} 
          className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors"
          title="Вийти"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // === Десктопна версія ===
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full rounded-xl p-2.5 transition-colors text-left",
            "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          )}
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 rounded-xl border border-border">
              {userData.avatarUrl ? (
                <AvatarImage src={userData.avatarUrl} className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-xl bg-muted text-xs font-semibold text-muted-foreground">
                {userData.initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px] font-semibold">{userData.name}</div>
              {/* Тут тепер буде писати роль (права) */}
              <div
                className={cn("truncate text-[11px]", ROLE_TEXT_CLASSES[userData.roleKey] || "text-muted-foreground")}
              >
                {userData.role}
              </div>
            </div>

            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[250px]" align="start" side="top" sideOffset={10}>
        <DropdownMenuLabel>Акаунт</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")}>
          <User className="mr-2 h-4 w-4" />
          Мій профіль
        </DropdownMenuItem>

       

        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Вийти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
