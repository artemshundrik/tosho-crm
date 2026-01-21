import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  ShieldAlert,
  MoreHorizontal,
  Search,
  Mail,
  Calendar,
  Link as LinkIcon,
  Clock,
  Copy,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableActionCell,
  TableActionHeaderCell,
  TableEmptyRow,
  TableTextHeaderCell,
} from "@/components/app/table-kit";
import { AppDropdown } from "@/components/app/AppDropdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarBase } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { usePageCache } from "@/hooks/usePageCache";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
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
import { CONTROL_BASE } from "@/components/ui/controlStyles";

// --- TYPES ---
type Member = {
  user_id: string;
  email: string | null;
  access_role: string | null;
  job_role: string | null;
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  access_role: string;
  job_role: string | null;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

type WorkspaceIdResult = { id: string };

type TeamMembersPageCache = {
  workspaceId: string | null;
  members: Member[];
  invites: Invite[];
};

type AccessRoleOption = {
  label: string;
  value: string;
};

type JobRoleOption = {
  label: string;
  value: string;
};

const ACCESS_ROLE_LABELS: Record<string, string> = {
  owner: "Super Admin",
  admin: "Admin",
};

const JOB_ROLE_LABELS: Record<string, string> = {
  manager: "Менеджер",
  designer: "Дизайнер",
  logistics: "Логіст",
  accountant: "Бухгалтер",
};

const ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Super Admin" },
];

const JOB_ROLE_OPTIONS: JobRoleOption[] = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Менеджер" },
  { value: "designer", label: "Дизайнер" },
  { value: "logistics", label: "Логіст" },
  { value: "accountant", label: "Бухгалтер" },
];

function getAccessRoleLabel(role: string | null) {
  return ACCESS_ROLE_LABELS[role ?? ""] ?? "Member";
}

function getJobRoleLabel(role: string | null) {
  return JOB_ROLE_LABELS[role ?? ""] ?? "Member";
}

function getAccessBadgeClass(role: string | null) {
  if (role === "owner") return "bg-purple-500/10 border-purple-500/25 text-foreground";
  if (role === "admin") return "bg-primary/10 border-primary/20 text-foreground";
  return "bg-muted/50 border-border text-muted-foreground";
}

function getJobBadgeClass(role: string | null) {
  if (!role) return "bg-muted/50 border-border text-muted-foreground";
  return "bg-muted/30 border-border text-muted-foreground";
}

export function TeamMembersPage() {
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"members" | "invites">("members");

  const { cached, setCache } = usePageCache<TeamMembersPageCache>("team-members");
  const hasCache = Boolean(cached);

  const [workspaceId, setWorkspaceId] = useState<string | null>(cached?.workspaceId ?? null);
  const [workspaceLoading, setWorkspaceLoading] = useState(!hasCache);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>(cached?.members ?? []);
  const [membersLoading, setMembersLoading] = useState(!hasCache);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [invites, setInvites] = useState<Invite[]>(cached?.invites ?? []);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccessRole, setInviteAccessRole] = useState("admin");
  const [inviteJobRole, setInviteJobRole] = useState("member");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "invites" || tab === "members") {
      setActiveTab(tab);
    }
  }, [params]);

  const canManage = useMemo(() => {
    if (!currentUserId) return false;
    const me = members.find((m) => m.user_id === currentUserId);
    return me?.access_role === "owner" || me?.access_role === "admin";
  }, [currentUserId, members]);

  const headerActions = useMemo(() => {
    if (!canManage) return null;
    return (
      <Button
        variant="primary"
        onClick={() => {
          setActiveTab("invites");
          setInviteOpen(true);
          setGeneratedLink(null);
          setInviteEmail("");
          setInviteAccessRole("admin");
          setInviteJobRole("member");
          setParams({ tab: "invites" });
        }}
      >
        Інвайт
      </Button>
    );
  }, [canManage, setParams]);
  usePageHeaderActions(headerActions, [canManage]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) return;
      setCurrentUserId(data.user?.id ?? null);
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasCache) {
      if (workspaceLoading) setWorkspaceLoading(false);
      if (membersLoading) setMembersLoading(false);
    }
  }, [hasCache, workspaceLoading, membersLoading]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceId = async () => {
      if (!hasCache) setWorkspaceLoading(true);
      setWorkspaceError(null);

      let resolvedId: string | null = null;

      try {
        const { data: rpcData, error: rpcError } = await supabase
          .schema("tosho")
          .rpc("current_workspace_id");

        if (!rpcError && rpcData) {
          resolvedId = rpcData as string;
        }

        if (!resolvedId) {
          const { data, error } = await supabase
            .schema("tosho")
            .from("workspaces")
            .select("id")
            .limit(1)
            .single<WorkspaceIdResult>();

          if (error) {
            if (!cancelled) setWorkspaceError(error.message);
          } else {
            resolvedId = data?.id ?? null;
          }
        }
      } catch (error: any) {
        if (!cancelled) setWorkspaceError(error?.message ?? "Unknown error");
      } finally {
        if (!cancelled) {
          setWorkspaceId(resolvedId);
          setWorkspaceLoading(false);
        }
      }
    };

    void loadWorkspaceId();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    const loadMembers = async () => {
      if (!hasCache) setMembersLoading(true);
      setMembersError(null);

      try {
        const { data, error } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("user_id,email,access_role,job_role,created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (error) {
          setMembersError(error.message);
          setMembers([]);
        } else {
          setMembers((data as Member[]) ?? []);
        }
      } catch (error: any) {
        if (!cancelled) {
          setMembersError(error?.message ?? "Unknown error");
          setMembers([]);
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !canManage) {
      setInvites([]);
      setInvitesLoading(false);
      return;
    }

    let cancelled = false;

    const loadInvites = async () => {
      if (!hasCache) setInvitesLoading(true);
      setInvitesError(null);

      try {
        const { data, error } = await supabase
          .schema("tosho")
          .from("workspace_invites")
          .select("id,email,access_role,job_role,token,created_at,expires_at,accepted_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setInvitesError(error.message);
          setInvites([]);
        } else {
          setInvites((data as Invite[]) ?? []);
        }
      } catch (error: any) {
        if (!cancelled) {
          setInvitesError(error?.message ?? "Unknown error");
          setInvites([]);
        }
      } finally {
        if (!cancelled) setInvitesLoading(false);
      }
    };

    void loadInvites();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, canManage]);

  useEffect(() => {
    if (workspaceError) {
      toast.error("Не вдалося завантажити workspace", { description: workspaceError });
    }
  }, [workspaceError]);

  useEffect(() => {
    if (membersError) {
      toast.error("Не вдалося завантажити учасників", { description: membersError });
    }
  }, [membersError]);

  useEffect(() => {
    if (invitesError) {
      toast.error("Не вдалося завантажити інвайти", { description: invitesError });
    }
  }, [invitesError]);

  useEffect(() => {
    if (!workspaceId) return;
    setCache({
      workspaceId,
      members,
      invites,
    });
  }, [workspaceId, members, invites, setCache]);

  const filteredMembers = members.filter((m) => {
    const email = (m.email ?? "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return email.includes(q);
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("uk-UA", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const getInviteLink = (token: string) => `${window.location.origin}/invite?token=${token}`;

  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();

  const handleTabChange = (next: "members" | "invites") => {
    setActiveTab(next);
    setParams(next === "invites" ? { tab: "invites" } : {});
  };

  const createInvite = async () => {
    if (!workspaceId) return;
    if (!inviteEmail) {
      toast.error("Вкажіть email для інвайту");
      return;
    }

    setInviteBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Не вдалося підтвердити авторизацію");
        return;
      }

      const response = await fetch("/.netlify/functions/create-workspace-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          accessRole: inviteAccessRole,
          jobRole: inviteJobRole === "member" ? null : inviteJobRole,
          expiresInDays: 7,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Invite failed");
      }

      const token = payload?.token as string | undefined;
      if (token) {
        setGeneratedLink(getInviteLink(token));
      } else {
        setGeneratedLink(null);
      }

      const { data: invitesData } = await supabase
        .schema("tosho")
        .from("workspace_invites")
        .select("id,email,access_role,job_role,token,created_at,expires_at,accepted_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      setInvites((invitesData as Invite[]) ?? []);
    } catch (e: any) {
      toast.error("Не вдалося створити інвайт", { description: e?.message });
    } finally {
      setInviteBusy(false);
    }
  };

  const confirmRevoke = (id: string) => {
    setRevokeId(id);
  };

  const handleRevoke = async () => {
    if (!revokeId || !workspaceId) return;
    setRevokeBusy(true);

    const { error } = await supabase
      .schema("tosho")
      .from("workspace_invites")
      .delete()
      .eq("id", revokeId)
      .eq("workspace_id", workspaceId);

    if (error) {
      toast.error("Не вдалося видалити інвайт", { description: error.message });
    } else {
      setInvites((prev) => prev.filter((i) => i.id !== revokeId));
      toast.success("Інвайт скасовано");
    }

    setRevokeBusy(false);
    setRevokeId(null);
  };

  const showSkeleton = useMinimumLoading(
    (workspaceLoading || membersLoading || (activeTab === "invites" && invitesLoading)) && !hasCache
  );

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
          <div className="p-6">
            <div className="text-sm font-semibold text-foreground">Workspace not selected</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Немає доступного workspace. Перевір права доступу або створіть workspace.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20">
      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Доступ до команди</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                Керування учасниками та рівнями доступу в workspace.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activeTab === "members"}
                onClick={() => handleTabChange("members")}
              >
                Учасники ({members.length})
              </Button>
              {canManage ? (
                <Button
                  type="button"
                  variant="segmented"
                  size="xs"
                  aria-pressed={activeTab === "invites"}
                  onClick={() => handleTabChange("invites")}
                >
                  Запрошення ({invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length})
                </Button>
              ) : null}
            </div>

            {activeTab === "members" ? (
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 bg-background border-input rounded-[var(--radius-lg)]"
                  placeholder="Пошук учасників..."
                />
              </div>
            ) : null}
          </div>
        </div>

        {activeTab === "members" ? (
          <div className="overflow-x-auto">
            <Table variant="list" size="md">
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableTextHeaderCell widthClass="w-[40%]" className="pl-6">
                    Користувач
                  </TableTextHeaderCell>
                  <TableTextHeaderCell>Доступ</TableTextHeaderCell>
                  <TableTextHeaderCell>Роль</TableTextHeaderCell>
                  <TableTextHeaderCell>Приєднався</TableTextHeaderCell>
                  <TableActionHeaderCell>Дії</TableActionHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersError ? (
                  <TableEmptyRow colSpan={5}>Помилка завантаження: {membersError}</TableEmptyRow>
                ) : filteredMembers.length === 0 ? (
                  <TableEmptyRow colSpan={5}>Нема учасників.</TableEmptyRow>
                ) : (
                  filteredMembers.map((m) => {
                    const initials = (m.email || "U").substring(0, 2).toUpperCase();
                    return (
                      <TableRow key={m.user_id} className="hover:bg-muted/40 transition-colors group">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <AvatarBase
                              src={null}
                              name={m.email || "Користувач"}
                              fallback={initials}
                              size={48}
                              shape="circle"
                              className="border-border bg-muted/50"
                              fallbackClassName="text-xs font-bold"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">
                                {m.email || "Користувач"}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="w-3 h-3 opacity-70" />
                                <span className="truncate max-w-[200px]">{m.email || "—"}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2.5 py-1 font-medium rounded-[var(--radius)]", getAccessBadgeClass(m.access_role))}
                          >
                            {getAccessRoleLabel(m.access_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2.5 py-1 font-medium rounded-[var(--radius)]", getJobBadgeClass(m.job_role))}
                          >
                            {getJobRoleLabel(m.job_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5 opacity-70" />
                            <span>{formatDate(m.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableActionCell className="pr-6">
                          <AppDropdown
                            align="end"
                            contentClassName="w-48"
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            }
                            items={[
                              { type: "label", label: "Дії" },
                              { type: "separator" },
                              { label: "Тільки перегляд", disabled: true, muted: true },
                            ]}
                          />
                        </TableActionCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {activeTab === "invites" && canManage ? (
          <div className="overflow-x-auto">
            <Table variant="list" size="md">
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableTextHeaderCell widthClass="w-[40%]" className="pl-6">
                    Посилання / Email
                  </TableTextHeaderCell>
                  <TableTextHeaderCell>Доступ</TableTextHeaderCell>
                  <TableTextHeaderCell>Роль</TableTextHeaderCell>
                  <TableTextHeaderCell>Статус</TableTextHeaderCell>
                  <TableTextHeaderCell>Створено</TableTextHeaderCell>
                  <TableActionHeaderCell>Дії</TableActionHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitesError ? (
                  <TableEmptyRow colSpan={6}>Помилка завантаження: {invitesError}</TableEmptyRow>
                ) : invites.length === 0 ? (
                  <TableEmptyRow colSpan={6}>Немає активних запрошень.</TableEmptyRow>
                ) : (
                  invites.map((inv) => {
                    const expired = isExpired(inv.expires_at);
                    const used = !!inv.accepted_at;

                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/40 transition-colors">
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
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)]", getAccessBadgeClass(inv.access_role))}
                          >
                            {getAccessRoleLabel(inv.access_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)]", getJobBadgeClass(inv.job_role))}
                          >
                            {getJobRoleLabel(inv.job_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {used ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                              Використано
                            </Badge>
                          ) : expired ? (
                            <Badge
                              variant="destructive"
                              className="bg-danger-soft text-danger-foreground border-danger-soft-border hover:bg-danger-soft"
                            >
                              Прострочено
                            </Badge>
                          ) : (
                            <Badge
                              variant="default"
                              className="bg-success-soft text-success-foreground border-success-soft-border hover:bg-success-soft shadow-none"
                            >
                              Активне
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground" title={new Date(inv.created_at).toLocaleString()}>
                            <Clock className="w-3.5 h-3.5 opacity-70" />
                            <span>{formatDate(inv.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableActionCell className="pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {!expired && !used ? (
                              <Button
                                size="iconXs"
                                variant="control"
                                onClick={() => {
                                  navigator.clipboard.writeText(getInviteLink(inv.token));
                                  toast.success("Посилання скопійовано");
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            ) : null}
                            <Button size="iconXs" variant="controlDestructive" onClick={() => confirmRevoke(inv.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableActionCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Card>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setGeneratedLink(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Запросити в workspace</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Створити посилання для доступу до workspace.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            {!generatedLink ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Email</Label>
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Рівень доступу</Label>
                  <Select value={inviteAccessRole} onValueChange={setInviteAccessRole}>
                    <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>{
                      ACCESS_ROLE_OPTIONS.find((o) => o.value === inviteAccessRole)?.label
                    }</SelectTrigger>
                    <SelectContent>
                      {ACCESS_ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Роль у команді</Label>
                  <Select value={inviteJobRole} onValueChange={setInviteJobRole}>
                    <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>{
                      JOB_ROLE_OPTIONS.find((o) => o.value === inviteJobRole)?.label
                    }</SelectTrigger>
                    <SelectContent>
                      {JOB_ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createInvite} disabled={inviteBusy} className="w-full h-11">
                  {inviteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Створити інвайт"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center p-6 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 rounded-[var(--radius-inner)] border border-emerald-100 dark:border-emerald-900/50">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3 shadow-sm">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-lg text-foreground">Посилання готове!</span>
                  <span className="text-sm opacity-80 mt-1 text-center max-w-xs text-muted-foreground">
                    Надішли його новому учаснику.
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium text-foreground">Посилання для копіювання</Label>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="font-mono text-sm bg-muted/50 h-11 border-dashed text-foreground" />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-11 w-11 shrink-0"
                      onClick={() => {
                        if (!generatedLink) return;
                        navigator.clipboard.writeText(generatedLink);
                        toast.success("Скопійовано в буфер обміну");
                      }}
                    >
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

      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-[24px]">
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center mb-4 text-destructive border border-danger-soft-border">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-center">Скасувати інвайт?</DialogTitle>
              <DialogDescription className="text-muted-foreground text-center mt-2">
                Це посилання перестане працювати, і ніхто не зможе приєднатися за ним.
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
    </div>
  );
}
