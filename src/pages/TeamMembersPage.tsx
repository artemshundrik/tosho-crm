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
  Link as LinkIcon,
  Clock,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_BADGE_STYLES } from "@/lib/roleBadges";

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

// --- ТИПИ ---
type Member = {
  user_id: string;
  role: "super_admin" | "manager" | "viewer" | "player";
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Invite = {
  id: string;
  role: string;
  email: string | null;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

// --- КОНФІГИ ---
const ROLE_SELECT_OPTIONS = {
  viewer: {
    label: "Viewer (Глядач)",
    description: "Тільки перегляд, без редагування.",
    icon: User,
    colorClass: "text-slate-600 dark:text-slate-400"
  },
  manager: {
    label: "Manager (Менеджер)",
    description: "Може редагувати гравців та матчі.",
    icon: Shield,
    colorClass: "text-blue-600 dark:text-blue-400"
  },
  super_admin: {
    label: "Super Admin",
    description: "Повний доступ до всіх налаштувань.",
    icon: Shield,
    colorClass: "text-purple-600 dark:text-purple-400"
  }
};

export function TeamMembersPage() {
  const { teamId, role: myRole } = useAuth();
  
  // TABS STATE
  const [activeTab, setActiveTab] = useState<"members" | "invites">("members");

  // DATA STATE
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // INVITE MODAL STATE
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // REVOKE CONFIRMATION STATE
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const canManage = myRole === "super_admin";
  const currentRoleData = ROLE_SELECT_OPTIONS[inviteRole as keyof typeof ROLE_SELECT_OPTIONS];

  // --- INITIAL LOAD ---
  useEffect(() => {
    if (teamId) {
      fetchMembers();
      if (canManage) fetchInvites();
    }
  }, [teamId, canManage]);

  // --- API CALLS ---
  async function fetchMembers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_members_view")
      .select("*")
      .eq("team_id", teamId);

    if (error) {
      console.error("View error, fallback to raw", error);
      const { data: rawData } = await supabase.from("team_members").select("*").eq("team_id", teamId);
      if (rawData) {
        setMembers(rawData.map((m: any) => ({
          ...m, email: "Hidden", full_name: "User", avatar_url: null
        })));
      }
    } else {
      setMembers(data as Member[]);
    }
    setLoading(false);
  }

  async function fetchInvites() {
    if (!canManage) return;
    const { data, error } = await supabase
      .from("team_invites")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvites(data as Invite[]);
    }
  }

  // --- ACTIONS ---
  async function updateRole(userId: string, newRole: string) {
    const oldMembers = [...members];
    setMembers(members.map(m => m.user_id === userId ? { ...m, role: newRole as any } : m));
    const { error } = await supabase.from("team_members").update({ role: newRole }).eq("user_id", userId).eq("team_id", teamId);
    if (error) {
      setMembers(oldMembers);
      toast.error("Не вдалося змінити роль");
    } else {
      toast.success("Роль оновлено");
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Видалити цього користувача з команди?")) return;
    const { error } = await supabase.from("team_members").delete().eq("user_id", userId).eq("team_id", teamId);
    if (error) toast.error("Помилка видалення");
    else {
      toast.success("Користувача видалено");
      fetchMembers();
    }
  }

  function confirmRevoke(id: string) {
    setRevokeId(id);
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevokeBusy(true);

    const { error } = await supabase.from("team_invites").delete().eq("id", revokeId);
    
    if (error) {
      toast.error("Не вдалося видалити запрошення");
    } else {
      toast.success("Запрошення скасовано");
      setInvites((prev) => prev.filter((i) => i.id !== revokeId));
    }
    
    setRevokeBusy(false);
    setRevokeId(null);
  }

  async function generateInvite() {
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_team_invite", {
        p_role: inviteRole,
        p_email: null,
      });
      if (error) throw error;
      
      const link = `${window.location.origin}/invite?code=${data}`;
      setGeneratedLink(link);
      fetchInvites();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviteBusy(false);
    }
  }

  // --- FILTERS & HELPERS ---
  const filteredMembers = members.filter(m => 
    (m.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (m.email?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  const getLinkFromToken = (token: string) => `${window.location.origin}/invite?code=${token}`;
  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();
  
  // Форматування дати з часом
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString('uk-UA', { 
       dateStyle: 'short', 
       timeStyle: 'short' 
    });
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 animate-in fade-in duration-500">
      
      <OperationalSummary
        title="Доступ до команди"
        subtitle="Керування учасниками та активними запрошеннями."
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

      {/* FIXED: Shadow-none для плоскої картки */}
      <Card className="rounded-[32px] border border-border bg-card shadow-none overflow-hidden flex flex-col">
        {/* --- TABS HEADER --- */}
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5 md:flex-row md:items-center md:justify-between">
          
          {/* FIXED: Tabs стиль як у FilterBar (Segmented Control) */}
          <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
            <button
              onClick={() => setActiveTab("members")}
              className={cn(
                "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                activeTab === "members" 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Учасники ({members.length})
            </button>
            {canManage && (
               <button
               onClick={() => setActiveTab("invites")}
               className={cn(
                 "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 flex items-center gap-2",
                 activeTab === "invites" 
                   ? "bg-card text-foreground shadow-sm" 
                   : "text-muted-foreground hover:text-foreground"
               )}
             >
               Запрошення ({invites.filter(i => !i.used_at && !isExpired(i.expires_at)).length})
             </button>
            )}
          </div>

          {activeTab === "members" && (
            <div className="relative w-full md:w-72">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
               <Input 
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 className="pl-10 h-10 bg-background border-input rounded-xl"
                 placeholder="Пошук учасників..."
               />
            </div>
          )}
        </div>

        {/* --- CONTENT: MEMBERS --- */}
        {activeTab === "members" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[40%] pl-6">Користувач</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Приєднався</TableHead>
                  <TableHead className="text-right pr-6">Дії</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                   Array(3).fill(0).map((_, i) => (
                      <TableRow key={i} className="h-[72px]">
                         <TableCell className="pl-6"><Skeleton className="h-10 w-32" /></TableCell>
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
                    const initials = (m.full_name || m.email || "U").substring(0, 2).toUpperCase();
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
                              <span className="text-sm font-semibold text-foreground">{m.full_name || "Користувач"}</span>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                 <Mail className="w-3 h-3 opacity-70" />
                                 <span className="truncate max-w-[200px]">{m.email || "—"}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("px-2.5 py-1 font-medium rounded-lg", ROLE_BADGE_STYLES[m.role]?.className)}>
                             {ROLE_BADGE_STYLES[m.role]?.label || m.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 opacity-70" />
                              {/* FIXED: Added Time */}
                              <span>{formatDate(m.created_at)}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 group-hover:opacity-100">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                                <DropdownMenuLabel>Змінити права</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => updateRole(m.user_id, "viewer")}>Viewer</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateRole(m.user_id, "manager")}>Manager</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateRole(m.user_id, "super_admin")}>Super Admin</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600" onClick={() => removeMember(m.user_id)}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Видалити
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
        )}

        {/* --- CONTENT: INVITES --- */}
        {activeTab === "invites" && canManage && (
          <div className="overflow-x-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
             <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="pl-6 w-[40%]">Посилання / Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Створено</TableHead>
                  <TableHead className="text-right pr-6">Дії</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        Немає активних запрошень.
                     </TableCell>
                   </TableRow>
                ) : (
                  invites.map((inv) => {
                    const expired = isExpired(inv.expires_at);
                    const used = !!inv.used_at;
                    
                    return (
                      <TableRow key={inv.id} className="h-[64px] hover:bg-muted/40 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted border border-border">
                                <LinkIcon className="w-4 h-4 text-muted-foreground" />
                             </div>
                             <div className="flex flex-col max-w-[240px]">
                                <span className="text-sm font-medium truncate text-foreground">
                                   {inv.email || "Публічне посилання"}
                                </span>
                                <span className="text-xs text-muted-foreground truncate font-mono opacity-70">
                                   ...{inv.token.slice(-8)}
                                </span>
                             </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs rounded-md", ROLE_BADGE_STYLES[inv.role]?.className)}>
                             {ROLE_BADGE_STYLES[inv.role]?.label || inv.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {used ? (
                             <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">Використано</Badge>
                          ) : expired ? (
                             <Badge variant="destructive" className="bg-danger-soft text-danger-foreground border-danger-soft-border hover:bg-danger-soft">Прострочено</Badge>
                          ) : (
                             <Badge variant="default" className="bg-success-soft text-success-foreground border-success-soft-border hover:bg-success-soft shadow-none">Активне</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2 text-sm text-muted-foreground" title={new Date(inv.created_at).toLocaleString()}>
                              <Clock className="w-3.5 h-3.5 opacity-70" />
                              {/* FIXED: Added Time */}
                              <span>{formatDate(inv.created_at)}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                           <div className="flex items-center justify-end gap-2">
                              {!expired && !used && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" 
                                  onClick={() => {
                                    navigator.clipboard.writeText(getLinkFromToken(inv.token));
                                    toast.success("Посилання скопійовано");
                                  }}
                                >
                                   <Copy className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirmRevoke(inv.id)}>
                                 <Trash2 className="w-4 h-4" />
                              </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* --- CREATE INVITE DIALOG --- */}
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
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="group flex w-full items-center justify-between rounded-xl border border-input bg-background dark:bg-muted/10 px-3 py-3 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200 hover:border-primary/50 dark:hover:border-primary/30 h-14">
                      <div className="flex flex-row items-center gap-3 overflow-hidden">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted dark:bg-accent/40 border border-border">
                          {currentRoleData && (<currentRoleData.icon className={cn("h-4 w-4", currentRoleData.colorClass)} />)}
                        </div>
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
                      <Input value={generatedLink} readOnly className="font-mono text-sm bg-muted/50 h-11 border-dashed focus-visible:ring-0 text-foreground" />
                      <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        toast.success("Скопійовано в буфер обміну");
                      }}>
                        <Copy className="w-5 h-5" />
                      </Button>
                    </div>
                 </div>
                 <Button variant="ghost" className="w-full h-11" onClick={() => setInviteOpen(false)}>Закрити</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* --- REVOKE CONFIRMATION DIALOG (NEW) --- */}
      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-[24px]">
           <div className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center mb-4 text-destructive border border-danger-soft-border">
                 <AlertTriangle className="w-7 h-7" />
              </div>
              <DialogHeader>
                 <DialogTitle className="text-xl font-bold text-foreground text-center">Скасувати запрошення?</DialogTitle>
                 <DialogDescription className="text-muted-foreground text-center mt-2">
                    Це посилання перестане працювати, і ніхто не зможе приєднатися за ним. Цю дію не можна скасувати.
                 </DialogDescription>
              </DialogHeader>
           </div>
           
           <div className="p-6 pt-0 flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 h-11 rounded-[var(--btn-radius)] border-input hover:bg-accent hover:text-accent-foreground" 
                onClick={() => setRevokeId(null)}
              >
                 Скасувати
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1 h-11 rounded-[var(--btn-radius)] bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md shadow-destructive/20"
                onClick={handleRevoke}
                disabled={revokeBusy}
              >
                 {revokeBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                 Так, видалити
              </Button>
           </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
