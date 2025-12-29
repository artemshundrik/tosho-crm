import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import {
  Shield,
  MoreHorizontal,
  Trash2,
  UserCog,
  Check,
  Copy,
  Loader2,
  Search,
  User,
  Mail,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Типи
type Member = {
  user_id: string;
  role: "super_admin" | "manager" | "viewer" | "player";
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

// Конфігурація для бейджів у таблиці
const ROLE_CONFIG: Record<string, { label: string; style: string }> = {
  super_admin: { 
    label: "Super Admin", 
    style: "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-500/20" 
  },
  manager: { 
    label: "Менеджер", 
    style: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-500/20" 
  },
  viewer: { 
    label: "Глядач", 
    style: "bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-400 dark:border-slate-500/20" 
  },
  player: {
    label: "Гравець",
    style: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-500/20"
  }
};

// Конфігурація для Select Trigger (Інпут вибору ролі)
const ROLE_SELECT_OPTIONS = {
  viewer: {
    label: "Viewer (Глядач)",
    description: "Тільки перегляд, без редагування.", // Додано опис
    icon: User,
    colorClass: "text-slate-600 dark:text-slate-400"
  },
  manager: {
    label: "Manager (Менеджер)",
    description: "Може редагувати гравців та матчі.", // Додано опис
    icon: Shield,
    colorClass: "text-blue-600 dark:text-blue-400"
  },
  super_admin: {
    label: "Super Admin",
    description: "Повний доступ до всіх налаштувань.", // Додано опис
    icon: Shield,
    colorClass: "text-purple-600 dark:text-purple-400"
  }
};

export function TeamMembersPage() {
  const { teamId, role: myRole } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Invite state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const canManage = myRole === "super_admin";

  const currentRoleData = ROLE_SELECT_OPTIONS[inviteRole as keyof typeof ROLE_SELECT_OPTIONS];

  useEffect(() => {
    if (teamId) fetchMembers();
  }, [teamId]);

  async function fetchMembers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_members_view")
      .select("*")
      .eq("team_id", teamId);

    if (error) {
      console.error("View error:", error);
      const { data: rawData, error: rawError } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", teamId);
      
      if (!rawError && rawData) {
        setMembers(rawData.map((m: any) => ({
          ...m,
          email: "Hidden (Run SQL)",
          full_name: "Користувач",
          avatar_url: null
        })));
      }
    } else {
      setMembers(data as Member[]);
    }
    setLoading(false);
  }

  async function updateRole(userId: string, newRole: string) {
    const oldMembers = [...members];
    setMembers(members.map(m => m.user_id === userId ? { ...m, role: newRole as any } : m));

    const { error } = await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("user_id", userId)
      .eq("team_id", teamId);

    if (error) {
      setMembers(oldMembers);
      toast.error("Не вдалося змінити роль");
    } else {
      toast.success("Роль оновлено");
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Видалити цього користувача з команди? Він втратить доступ.")) return;

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("user_id", userId)
      .eq("team_id", teamId);

    if (error) toast.error("Помилка видалення");
    else {
      toast.success("Користувача видалено");
      fetchMembers();
    }
  }

  async function generateInvite() {
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_team_invite", {
        p_role: inviteRole,
        p_email: null,
      });
      if (error) throw error;
      setGeneratedLink(`${window.location.origin}/invite?code=${data}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviteBusy(false);
    }
  }

  const filteredMembers = members.filter(m => 
    (m.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (m.email?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    m.role.includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 animate-in fade-in duration-500">
      
      <OperationalSummary
        title="Доступ до команди"
        subtitle="Керування адміністраторами, менеджерами та правами доступу."
        hideNextUp
        primaryAction={canManage ? {
          label: "Запросити людину",
          iconLeft: UserCog,
          onClick: () => {
             setGeneratedLink(null);
             setInviteOpen(true);
          },
          variant: "default"
        } : undefined}
      />

      <Card className="rounded-[32px] border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Учасники з доступом</div>
              <div className="text-xs text-muted-foreground">Всього: {members.length}</div>
            </div>
          </div>

          <div className="relative w-full md:w-72">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
             <Input 
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="pl-10 h-10 bg-background border-input rounded-xl"
               placeholder="Пошук по імені або email..."
             />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="w-[40%] pl-6">Користувач</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Дата приєднання</TableHead>
                <TableHead className="text-right pr-6">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 Array(3).fill(0).map((_, i) => (
                    <TableRow key={i} className="h-[72px]">
                       <TableCell className="pl-6"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div></div></TableCell>
                       <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                       <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                       <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                 ))
              ) : filteredMembers.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      Користувачів не знайдено.
                   </TableCell>
                 </TableRow>
              ) : (
                filteredMembers.map((m) => {
                  const initials = (m.full_name || m.email || "U")
                    .substring(0, 2)
                    .toUpperCase();
                    
                  return (
                    <TableRow key={m.user_id} className="h-[72px] hover:bg-muted/40 transition-colors group">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border bg-muted/50">
                            <AvatarImage src={m.avatar_url || ""} />
                            <AvatarFallback className="text-xs font-bold text-muted-foreground bg-slate-100 dark:bg-slate-800">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-foreground">
                              {m.full_name || "Користувач"}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                               <Mail className="w-3 h-3 opacity-70" />
                               <span className="truncate max-w-[200px]">{m.email || "—"}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant="outline" className={cn("px-2.5 py-1 font-medium rounded-lg", ROLE_CONFIG[m.role]?.style)}>
                           {ROLE_CONFIG[m.role]?.label || m.role}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                         <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5 opacity-70" />
                            <span>
                               {m.created_at ? new Date(m.created_at).toLocaleDateString('uk-UA') : "—"}
                            </span>
                         </div>
                      </TableCell>

                      <TableCell className="text-right pr-6">
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl">
                              <DropdownMenuLabel>Змінити права</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => updateRole(m.user_id, "viewer")}>
                                 <User className="mr-2 h-4 w-4 opacity-70" /> Viewer (Глядач)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateRole(m.user_id, "manager")}>
                                 <Shield className="mr-2 h-4 w-4 opacity-70" /> Manager
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateRole(m.user_id, "super_admin")}>
                                 <Shield className="mr-2 h-4 w-4 text-purple-600" /> Super Admin
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600 focus:text-red-600 focus:bg-red-50" 
                                onClick={() => {
                                   navigator.clipboard.writeText(m.user_id);
                                   toast.success("ID скопійовано: " + m.user_id);
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" /> Скопіювати UID
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => removeMember(m.user_id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Видалити доступ
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* INVITE MODAL */}
      <Dialog open={inviteOpen} onOpenChange={(open) => {
         setInviteOpen(open);
         if(!open) setGeneratedLink(null);
      }}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Запросити в команду</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Створити одноразове посилання для приєднання нового учасника.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6">
            {!generatedLink ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-base font-medium text-foreground">Рівень доступу</Label>
                  
                  {/* --- CUSTOM SELECT TRIGGER --- */}
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger 
                      className="
                        group flex w-full items-center justify-between 
                        rounded-xl
                        border border-input 
                        bg-background dark:bg-muted/10 
                        px-3 py-3 
                        text-sm text-foreground
                        ring-offset-background 
                        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 
                        disabled:cursor-not-allowed disabled:opacity-50
                        transition-all duration-200
                        hover:border-primary/50 dark:hover:border-primary/30
                        h-14
                      "
                    >
                      <div className="flex flex-row items-center gap-3 overflow-hidden">
                        {/* Контейнер іконки */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted dark:bg-accent/40 border border-border">
                          {currentRoleData && (
                            <currentRoleData.icon className={cn("h-4 w-4", currentRoleData.colorClass)} />
                          )}
                        </div>
                        {/* Текст (тільки Заголовок) */}
                        <span className="truncate font-medium text-foreground text-sm">
                          {currentRoleData?.label || "Оберіть роль"}
                        </span>
                      </div>
                    </SelectTrigger>
                    
                    <SelectContent>
                      {Object.entries(ROLE_SELECT_OPTIONS).map(([key, role]) => (
                        <SelectItem key={key} value={key} className="py-2.5 cursor-pointer">
                          <div className="flex flex-row items-center gap-3">
                            <role.icon className={cn("w-4 h-4 shrink-0", role.colorClass)} />
                            <div className="flex flex-col text-left">
                               <span className="font-medium text-sm text-foreground">{role.label}</span>
                               <span className="text-xs text-muted-foreground">{role.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* --- END CUSTOM SELECT --- */}

                </div>
                
                <Button onClick={generateInvite} disabled={inviteBusy} className="w-full h-12 text-base rounded-xl shadow-md" size="lg">
                  {inviteBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Створити посилання"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                 <div className="flex flex-col items-center justify-center p-6 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
                   <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3 shadow-sm">
                      <Check className="w-6 h-6" />
                   </div>
                   <span className="font-bold text-lg text-foreground">Посилання готове!</span>
                   <span className="text-sm opacity-80 mt-1 text-center max-w-xs text-muted-foreground">
                     Надішли його новому учаснику. Воно діє 24 години.
                   </span>
                 </div>
                 
                 <div className="space-y-2">
                    <Label className="font-medium text-foreground">Посилання для копіювання</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={generatedLink} 
                        readOnly 
                        className="font-mono text-sm bg-muted/50 h-11 border-dashed focus-visible:ring-0 text-foreground" 
                      />
                      <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        toast.success("Скопійовано в буфер обміну");
                      }}>
                        <Copy className="w-5 h-5" />
                      </Button>
                    </div>
                 </div>

                 <Button variant="ghost" className="w-full h-11" onClick={() => setInviteOpen(false)}>
                    Закрити
                 </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}