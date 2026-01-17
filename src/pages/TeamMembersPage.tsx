import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import {
  ShieldAlert,
  Crown,
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
import { logActivity } from "@/lib/activityLogger";

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
import { AppDropdown } from "@/components/app/AppDropdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
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
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { usePageData } from "@/hooks/usePageData";
import { CONTROL_BASE } from "@/components/ui/controlStyles";

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
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted/50 border-border"
  },
  manager: {
    label: "Manager (Менеджер)",
    description: "Може редагувати гравців та матчі.",
    icon: ShieldAlert,
    iconClass: "text-primary",
    badgeClass: "bg-primary/10 border-primary/20"
  },
  super_admin: {
    label: "Super Admin",
    description: "Повний доступ до всіх налаштувань.",
    icon: Crown,
    iconClass: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-500/10 border-purple-500/25"
  }
};

export function TeamMembersPage() {
  const { teamId, role: myRole, userId: currentUserId } = useAuth();
  
  // TABS STATE
  const [activeTab, setActiveTab] = useState<"members" | "invites">("members");

  // DATA STATE
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // INVITE MODAL STATE
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // REVOKE CONFIRMATION STATE
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  // REMOVE MEMBER CONFIRMATION STATE
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const canManage = myRole === "super_admin";
  const currentRoleData = ROLE_SELECT_OPTIONS[inviteRole as keyof typeof ROLE_SELECT_OPTIONS];

  const { data, showSkeleton, refetch } = usePageData<{ members: Member[]; invites: Invite[] }>({
    cacheKey: `team-members:${teamId ?? "none"}:${canManage ? "admin" : "viewer"}`,
    loadFn: async () => {
      if (!teamId) return { members: [], invites: [] };

      const { data, error } = await supabase
        .from("team_members_view")
        .select("*")
        .eq("team_id", teamId);

      let nextMembers: Member[] = [];
      if (error) {
        console.error("View error, fallback to raw", error);
        const { data: rawData } = await supabase.from("team_members").select("*").eq("team_id", teamId);
        if (rawData) {
          nextMembers = rawData.map((m: any) => ({
            ...m,
            email: "Hidden",
            full_name: "User",
            avatar_url: null,
          })) as Member[];
        }
      } else {
        nextMembers = (data as Member[]) ?? [];
      }

      let nextInvites: Invite[] = [];
      if (canManage) {
        const { data: invitesData, error: invitesError } = await supabase
          .from("team_invites")
          .select("*")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });
        if (!invitesError && invitesData) {
          nextInvites = invitesData as Invite[];
        }
      }

      return { members: nextMembers, invites: nextInvites };
    },
  });

  useEffect(() => {
    if (!data) return;
    setMembers(data.members);
    setInvites(data.invites);
  }, [data]);

  // --- ACTIONS ---
  async function updateRole(targetUserId: string, newRole: string) {
    const oldMembers = [...members];
    setMembers(members.map(m => m.user_id === targetUserId ? { ...m, role: newRole as any } : m));
    const { error } = await supabase.from("team_members").update({ role: newRole }).eq("user_id", targetUserId).eq("team_id", teamId);
    if (error) {
      setMembers(oldMembers);
      toast.error("Не вдалося змінити роль");
    } else {
      toast.success("Роль оновлено");
      const target = members.find((m) => m.user_id === targetUserId);
      const targetLabel = target?.full_name || target?.email || "учасника";
      const roleLabel = ROLE_BADGE_STYLES[newRole]?.label || newRole;
      logActivity({
        teamId,
        userId: currentUserId,
        action: "update_role",
        entityType: "team",
        entityId: targetUserId,
        title: `Змінено роль ${targetLabel} на ${roleLabel}`,
        href: "/settings/members",
      });
    }
  }

  function confirmRemove(userId: string) {
    setRemoveId(userId);
  }

  async function handleRemoveMember() {
    if (!removeId) return;
    if (!teamId) {
      toast.error("Не визначено команду");
      return;
    }
    if (removeId === currentUserId) {
      toast.error("Не можна видалити себе з команди");
      return;
    }

    setRemoveBusy(true);
    const { data, error } = await supabase
      .from("team_members")
      .delete()
      .eq("user_id", removeId)
      .eq("team_id", teamId)
      .select("user_id");
    setRemoveBusy(false);

    if (error) {
      toast.error("Помилка видалення", { description: error.message });
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Не вдалося видалити", { description: "Запис не знайдено або немає прав." });
      return;
    }

    toast.success("Користувача видалено");
    setMembers((prev) => prev.filter((m) => m.user_id !== removeId));
    const removed = members.find((m) => m.user_id === removeId);
    const removedLabel = removed?.full_name || removed?.email || "учасника";
    logActivity({
      teamId,
      userId: currentUserId,
      action: "remove_member",
      entityType: "team",
      entityId: removeId,
      title: `Видалено учасника ${removedLabel}`,
      href: "/settings/members",
    });
    setRemoveId(null);
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
      logActivity({
        teamId,
        userId: currentUserId,
        action: "revoke_invite",
        entityType: "team",
        entityId: revokeId,
        title: "Скасовано інвайт",
        href: "/settings/members",
      });
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
      await refetch();
      const roleLabel = ROLE_BADGE_STYLES[inviteRole]?.label || inviteRole;
      logActivity({
        teamId,
        userId: currentUserId,
        action: "create_invite",
        entityType: "team",
        title: `Створено інвайт (${roleLabel})`,
        href: "/settings/members",
      });
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

  const headerActions = useMemo(() => {
    if (!canManage) return null;
    return (
      <Button
        variant="primary"
        onClick={() => {
          setGeneratedLink(null);
          setInviteOpen(true);
        }}
      >
        Запросити людину
      </Button>
    );
  }, [canManage]);

  usePageHeaderActions(headerActions, [canManage]);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 animate-in fade-in duration-500">
      
      {/* FIXED: Shadow-none для плоскої картки */}
      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
        {/* --- TABS HEADER --- */}
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Доступ до команди</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                Керування учасниками та активними запрошеннями.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* FIXED: Tabs стиль як у FilterBar (Segmented Control) */}
            <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activeTab === "members"}
                onClick={() => setActiveTab("members")}
              >
                Учасники ({members.length})
              </Button>
              {canManage && (
                 <Button
                 type="button"
                 variant="segmented"
                 size="xs"
                 aria-pressed={activeTab === "invites"}
                 onClick={() => setActiveTab("invites")}
               >
                 Запрошення ({invites.filter(i => !i.used_at && !isExpired(i.expires_at)).length})
               </Button>
              )}
            </div>

            {activeTab === "members" && (
              <div className="relative w-full md:w-72">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                 <Input 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="pl-10 h-10 bg-background border-input rounded-[var(--radius-lg)]"
                   placeholder="Пошук учасників..."
                 />
              </div>
            )}
          </div>
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
                {filteredMembers.length === 0 ? (
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
                          <Badge variant="outline" className={cn("px-2.5 py-1 font-medium rounded-[var(--radius)]", ROLE_BADGE_STYLES[m.role]?.className)}>
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
                            <AppDropdown
                              align="end"
                              contentClassName="w-56"
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-50 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              }
                              items={[
                                { type: "label", label: "Змінити права" },
                                { type: "separator" },
                                { label: "Viewer", onSelect: () => updateRole(m.user_id, "viewer") },
                                { label: "Manager", onSelect: () => updateRole(m.user_id, "manager") },
                                { label: "Super Admin", onSelect: () => updateRole(m.user_id, "super_admin") },
                                { type: "separator" },
                                {
                                  label: (
                                    <>
                                      <Trash2 className="w-4 h-4 mr-2" /> Видалити
                                    </>
                                  ),
                                  onSelect: () => confirmRemove(m.user_id),
                                  destructive: true,
                                },
                              ]}
                            />
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
                             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-muted border border-border">
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
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)]", ROLE_BADGE_STYLES[inv.role]?.className)}>
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
                                <Button
                                  size="iconXs"
                                  variant="control"
                                  onClick={() => {
                                    navigator.clipboard.writeText(getLinkFromToken(inv.token));
                                    toast.success("Посилання скопійовано");
                                  }}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="iconXs" variant="controlDestructive" onClick={() => confirmRevoke(inv.id)}>
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
                <div className="space-y-0">
                  <Label className="text-base font-medium text-foreground mb-3 block">Рівень доступу</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className={cn(CONTROL_BASE, "group h-14 px-3 py-3")}>
                      <div className="flex flex-row items-center gap-3 overflow-hidden">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border",
                            currentRoleData?.badgeClass
                          )}
                        >
                          {currentRoleData && (
                            <currentRoleData.icon className={cn("h-4 w-4", currentRoleData.iconClass)} />
                          )}
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
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] border",
                                role.badgeClass
                              )}
                            >
                              <role.icon className={cn("h-4 w-4", role.iconClass)} />
                            </div>
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
                <Button onClick={generateInvite} disabled={inviteBusy} className="w-full h-12 text-base shadow-md" size="lg">
                  {inviteBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Створити посилання"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                 <div className="flex flex-col items-center justify-center p-6 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 rounded-[var(--radius-inner)] border border-emerald-100 dark:border-emerald-900/50">
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
                      <Input value={generatedLink} readOnly className="font-mono text-sm bg-muted/50 h-11 border-dashed text-foreground" />
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
              <Button variant="outline" className="flex-1 h-11" onClick={() => setRevokeId(null)}>
                 Скасувати
              </Button>
              <Button 
                variant="destructiveSolid" 
                className="flex-1 h-11"
                onClick={handleRevoke}
                disabled={revokeBusy}
              >
                 {revokeBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                 Так, видалити
              </Button>
           </div>
        </DialogContent>
      </Dialog>

      {/* --- REMOVE MEMBER CONFIRMATION DIALOG --- */}
      <Dialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-[24px]">
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center mb-4 text-destructive border border-danger-soft-border">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-center">Видалити учасника?</DialogTitle>
              <DialogDescription className="text-muted-foreground text-center mt-2">
                Користувача буде виключено з команди. Цю дію не можна скасувати.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 pt-0 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setRemoveId(null)}
              disabled={removeBusy}
            >
              Скасувати
            </Button>
            <Button
              variant="destructiveSolid"
              className="flex-1 h-11"
              onClick={handleRemoveMember}
              disabled={removeBusy}
            >
              {removeBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Так, видалити
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
