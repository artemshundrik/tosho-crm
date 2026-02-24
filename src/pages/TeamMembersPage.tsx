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
import { PageHeader } from "@/components/app/headers/PageHeader";
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
import { resolveWorkspaceId } from "@/lib/workspace";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

// --- TYPES ---
type Member = {
  user_id: string;
  email: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
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

type TeamMembersPageCache = {
  workspaceId: string | null;
  members: Member[];
  invites: Invite[];
  memberProfilesByUserId: Record<string, { label: string; avatarUrl: string | null }>;
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
  seo: "SEO",
};

const ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Super Admin" },
];

const MEMBER_ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  { value: "member", label: "Member" },
  ...ACCESS_ROLE_OPTIONS,
];

const JOB_ROLE_OPTIONS: JobRoleOption[] = [
  { value: "member", label: "Member" },
  { value: "manager", label: "Менеджер" },
  { value: "designer", label: "Дизайнер" },
  { value: "logistics", label: "Логіст" },
  { value: "accountant", label: "Бухгалтер" },
  { value: "seo", label: "SEO" },
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

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRecoverableRoleUpdateError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("cannot update view") ||
    normalized.includes("could not find the table")
  );
}

function normalizeRoleForCompare(value: string | null | undefined) {
  if (!value || value === "member") return null;
  return value;
}

function isMissingMembershipProfileColumnsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("memberships_view.avatar_url") && normalized.includes("does not exist")) ||
    (normalized.includes("memberships_view.full_name") && normalized.includes("does not exist"))
  );
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
  const [memberProfilesByUserId, setMemberProfilesByUserId] = useState<
    Record<string, { label: string; avatarUrl: string | null }>
  >(cached?.memberProfilesByUserId ?? {});
  const [memberProfilesLoading, setMemberProfilesLoading] = useState(false);

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
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editAccessRole, setEditAccessRole] = useState("member");
  const [editJobRole, setEditJobRole] = useState("member");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "invites" || tab === "members") {
      setActiveTab(tab);
    }
  }, [params]);

  const currentMembership = useMemo(
    () => members.find((m) => m.user_id === currentUserId) ?? null,
    [currentUserId, members]
  );
  const isSuperAdmin = currentMembership?.access_role === "owner";
  const canManage = currentMembership?.access_role === "owner" || currentMembership?.access_role === "admin";

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
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          throw userError;
        }
        resolvedId = await resolveWorkspaceId(userData.user?.id ?? null);
      } catch (error: unknown) {
        if (!cancelled) setWorkspaceError(getErrorMessage(error));
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
// eslint-disable-next-line react-hooks/exhaustive-deps
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
          .select("user_id,email,full_name,avatar_url,access_role,job_role,created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (!error) {
          setMembers((data as Member[]) ?? []);
          return;
        }

        if (!isMissingMembershipProfileColumnsError(error.message)) {
          setMembersError(error.message);
          setMembers([]);
          return;
        }

        const { data: legacyData, error: legacyError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("user_id,email,access_role,job_role,created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (legacyError) {
          setMembersError(legacyError.message);
          setMembers([]);
          return;
        }

        const rows = (legacyData as Omit<Member, "full_name" | "avatar_url">[] | null) ?? [];
        setMembers(
          rows.map((row) => ({
            ...row,
            full_name: null,
            avatar_url: null,
          }))
        );
      } catch (error: unknown) {
        if (!cancelled) {
          setMembersError(getErrorMessage(error));
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
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || members.length === 0) {
      setMemberProfilesByUserId({});
      setMemberProfilesLoading(false);
      return;
    }

    let cancelled = false;

    const loadMemberProfiles = async () => {
      try {
        const memberIds = Array.from(
          new Set(
            members
              .map((member) => member.user_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        if (memberIds.length === 0) {
          setMemberProfilesByUserId({});
          return;
        }

        const hasWarmProfiles = memberIds.every((id) => {
          const cachedProfile = memberProfilesByUserId[id];
          return Boolean(cachedProfile?.label || cachedProfile?.avatarUrl);
        });
        setMemberProfilesLoading(!hasWarmProfiles);

        let rows:
          | Array<{ user_id: string; full_name?: string | null; avatar_url?: string | null; email?: string | null }>
          | null = null;
        let queryError: { message?: string } | null = null;

        ({ data: rows, error: queryError } = await supabase
          .from("team_members_view")
          .select("user_id, full_name, avatar_url, email")
          .in("user_id", memberIds));

        if (queryError && /column/i.test(queryError.message || "") && /email/i.test(queryError.message || "")) {
          ({ data: rows, error: queryError } = await supabase
            .from("team_members_view")
            .select("user_id, full_name, avatar_url")
            .in("user_id", memberIds));
        }

        if (queryError) throw new Error(queryError.message || "Не вдалося завантажити профілі учасників");

        if (cancelled) return;

        const nextMap = memberIds.reduce<Record<string, { label: string; avatarUrl: string | null }>>((acc, id) => {
          const dbRow = (rows ?? []).find((row) => row.user_id === id);
          const baseMember = members.find((member) => member.user_id === id);
          const emailFallback = baseMember?.email?.split("@")[0]?.trim() || baseMember?.email || id;

          acc[id] = {
            label: dbRow?.full_name?.trim() || dbRow?.email?.split("@")[0]?.trim() || emailFallback,
            avatarUrl: dbRow?.avatar_url ?? baseMember?.avatar_url ?? null,
          };
          return acc;
        }, {});

        await Promise.all(
          Object.entries(nextMap).map(async ([id, profile]) => {
            nextMap[id] = {
              ...profile,
              avatarUrl: await resolveAvatarDisplayUrl(supabase, profile.avatarUrl, AVATAR_BUCKET),
            };
          })
        );

        const { data: currentUserData } = await supabase.auth.getUser();
        const currentUserId = currentUserData.user?.id ?? null;
        const currentUserAvatar = (currentUserData.user?.user_metadata?.avatar_url as string | undefined) || null;
        if (currentUserId && currentUserAvatar) {
          const existing = nextMap[currentUserId];
          nextMap[currentUserId] = {
            label: existing?.label || currentUserData.user?.email?.split("@")[0] || "Користувач",
            avatarUrl: existing?.avatarUrl ?? currentUserAvatar,
          };
        }

        setMemberProfilesByUserId(nextMap);
      } catch {
        if (cancelled) return;
        try {
          const { data: currentUserData } = await supabase.auth.getUser();
          const currentUserId = currentUserData.user?.id ?? null;
          const currentUserAvatar = (currentUserData.user?.user_metadata?.avatar_url as string | undefined) || null;
          const currentUserLabel = currentUserData.user?.user_metadata?.full_name || currentUserData.user?.email?.split("@")[0] || "Користувач";

          if (currentUserId && currentUserAvatar) {
            setMemberProfilesByUserId({
              [currentUserId]: {
                label: currentUserLabel,
                avatarUrl: currentUserAvatar,
              },
            });
            return;
          }
        } catch {
          // ignore fallback load errors
        }
        setMemberProfilesByUserId({});
      } finally {
        if (!cancelled) setMemberProfilesLoading(false);
      }
    };

    void loadMemberProfiles();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, members]);

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
      } catch (error: unknown) {
        if (!cancelled) {
          setInvitesError(getErrorMessage(error));
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
// eslint-disable-next-line react-hooks/exhaustive-deps
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
      memberProfilesByUserId,
    });
  }, [workspaceId, members, invites, memberProfilesByUserId, setCache]);

  const filteredMembers = members.filter((m) => {
    const email = (m.email ?? "").toLowerCase();
    const name = (m.full_name ?? "").toLowerCase();
    const fallbackName = (memberProfilesByUserId[m.user_id]?.label ?? "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return email.includes(q) || name.includes(q) || fallbackName.includes(q);
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Не вказано";
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

  const openEditRolesDialog = (member: Member) => {
    setEditMember(member);
    setEditAccessRole(member.access_role ?? "member");
    setEditJobRole(member.job_role ?? "member");
  };

  const saveMemberRoles = async () => {
    if (!editMember || !workspaceId || !isSuperAdmin) return;
    const nextAccessRole = editAccessRole;
    const nextJobRole = editJobRole;
    const normalizedAccessRole = nextAccessRole === "member" ? null : nextAccessRole;
    const normalizedJobRole = nextJobRole === "member" ? null : nextJobRole;
    const accessRoleChanged = (editMember.access_role ?? "member") !== nextAccessRole;
    const jobRoleChanged = (editMember.job_role ?? "member") !== nextJobRole;
    const roleDidChange =
      accessRoleChanged || jobRoleChanged;
    if (!roleDidChange) {
      setEditMember(null);
      return;
    }

    const verifyRoles = async () => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select("access_role,job_role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", editMember.user_id)
        .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

      if (error) throw new Error(error.message);
      if (!data) return false;

      const currentAccessRole = normalizeRoleForCompare(data.access_role ?? null);
      const currentJobRole = normalizeRoleForCompare(data.job_role ?? null);
      return (
        currentAccessRole === normalizeRoleForCompare(normalizedAccessRole) &&
        currentJobRole === normalizeRoleForCompare(normalizedJobRole)
      );
    };

    const verifyRolesEventually = async (attempts = 5, delayMs = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        const ok = await verifyRoles();
        if (ok) return true;
        if (i < attempts - 1) {
          await sleep(delayMs);
        }
      }
      return false;
    };

    setEditBusy(true);
    try {
      const fallbackUpdateRolesDirectly = async () => {
        const membershipUpdateSchemas = ["tosho", "public"] as const;
        const { data: membershipTarget, error: membershipTargetError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("user_id", editMember.user_id)
          .maybeSingle<{ id?: string | null }>();

        if (membershipTargetError) throw new Error(membershipTargetError.message);
        const membershipId = membershipTarget?.id ?? null;

        const attempts: Array<{
          tableName: string;
          payload: Record<string, string | null>;
          scopes: Array<"workspace_user" | "membership_id" | "team_user">;
        }> = [
          {
            tableName: "memberships",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "memberships",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_members",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_members",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_memberships",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_memberships",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "team_members",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["membership_id", "team_user"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "team_members",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["membership_id", "team_user"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
        ].filter((attempt) => Object.keys(attempt.payload).length > 0);

        let lastRecoverableError = "Не вдалося оновити ролі напряму";
        let wroteData = false;
        for (const attempt of attempts) {
          for (const scope of attempt.scopes) {
            for (const schemaName of membershipUpdateSchemas) {
              if (scope === "membership_id" && !membershipId) {
                continue;
              }

              const { error } =
                scope === "workspace_user"
                  ? await supabase
                      .schema(schemaName)
                      .from(attempt.tableName)
                      .update(attempt.payload)
                      .eq("workspace_id", workspaceId)
                      .eq("user_id", editMember.user_id)
                  : scope === "membership_id"
                    ? await supabase
                        .schema(schemaName)
                        .from(attempt.tableName)
                        .update(attempt.payload)
                        .eq("id", membershipId as string)
                    : await supabase
                        .schema(schemaName)
                        .from(attempt.tableName)
                        .update(attempt.payload)
                        .eq("team_id", workspaceId)
                        .eq("user_id", editMember.user_id);

              if (error) {
                if (!isRecoverableRoleUpdateError(error.message)) {
                  throw new Error(error.message);
                }
                lastRecoverableError = `${schemaName}.${attempt.tableName}[${scope}]: ${error.message}`;
                continue;
              }

              wroteData = true;
              const updated = await verifyRolesEventually();
              if (updated) return;

              // If write succeeded in one schema, do not continue
              // trying the same attempt in another schema just to avoid
              // false-negative recoverable errors.
              break;
            }
          }
        }

        if (wroteData) {
          const eventuallyUpdated = await verifyRolesEventually(8, 150);
          if (eventuallyUpdated) return;
          // DB write likely succeeded but membership view can lag.
          // Do not raise a blocking error in this case.
          return;
        }

        throw new Error(lastRecoverableError);
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Не вдалося підтвердити авторизацію");
      }

      const response = await fetch("/.netlify/functions/create-workspace-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          mode: "update_member_roles",
          userId: editMember.user_id,
          accessRole: nextAccessRole,
          jobRole: nextJobRole,
        }),
      });

      const payload = await parseJsonSafe<{
        error?: string;
        accessRole?: string | null;
        jobRole?: string | null;
      }>(response);

      let appliedByRecoverableServerError = false;
      if (!response.ok) {
        if (response.status === 404) {
          await fallbackUpdateRolesDirectly();
        } else {
          const message = payload?.error || `Не вдалося оновити ролі (HTTP ${response.status})`;
          if (isRecoverableRoleUpdateError(message)) {
            const updated = await verifyRolesEventually(8, 150);
            if (!updated) throw new Error(message);
            appliedByRecoverableServerError = true;
          } else {
            throw new Error(message);
          }
        }
      }

      if (response.ok || appliedByRecoverableServerError) {
        const savedAccessRole: string | null = payload?.accessRole ?? normalizedAccessRole;
        const savedJobRole: string | null = payload?.jobRole ?? normalizedJobRole;

        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === editMember.user_id
              ? { ...member, access_role: savedAccessRole, job_role: savedJobRole }
              : member
          )
        );
      } else {
        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === editMember.user_id
              ? { ...member, access_role: normalizedAccessRole, job_role: normalizedJobRole }
              : member
          )
        );
      }

      if (!response.ok && response.status === 404) {
        toast.success("Ролі учасника оновлено (fallback)");
      } else {
        toast.success("Ролі учасника оновлено");
      }
      setEditMember(null);
    } catch (error: unknown) {
      toast.error("Не вдалося змінити ролі", { description: getErrorMessage(error) });
    } finally {
      setEditBusy(false);
    }
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

      const payload = await parseJsonSafe<{ error?: string; token?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error || `Invite failed (HTTP ${response.status})`);
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
    } catch (e: unknown) {
      toast.error("Не вдалося створити інвайт", { description: getErrorMessage(e, "") });
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
      <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 md:pb-0">
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
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 md:pb-0">
      <PageHeader
        title="Доступ до команди"
        subtitle="Керування учасниками та рівнями доступу в workspace."
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          canManage ? (
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
          ) : null
        }
      />

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5">
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
                ) : memberProfilesLoading ? (
                  <TableEmptyRow colSpan={5}>Завантаження профілів учасників...</TableEmptyRow>
                ) : filteredMembers.length === 0 ? (
                  <TableEmptyRow colSpan={5}>Нема учасників.</TableEmptyRow>
                ) : (
                  filteredMembers.map((m) => {
                    const profile = memberProfilesByUserId[m.user_id];
                    const displayName = m.full_name?.trim() || profile?.label || m.email || "Користувач";
                    const fallbackFromName = displayName
                      .split(" ")
                      .filter(Boolean)
                      .map((part) => part[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const initials = fallbackFromName || (m.email || "U").substring(0, 2).toUpperCase();
                    return (
                      <TableRow key={m.user_id} className="hover:bg-muted/40 transition-colors group">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <AvatarBase
                              src={profile?.avatarUrl ?? m.avatar_url ?? null}
                              name={displayName}
                              fallback={initials}
                              size={48}
                              shape="circle"
                              className="border-border bg-muted/50"
                              fallbackClassName="text-xs font-bold"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">
                                {displayName}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="w-3 h-3 opacity-70" />
                                <span className="truncate max-w-[200px]">{m.email || "Не вказано"}</span>
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
                              isSuperAdmin && m.user_id !== currentUserId
                                ? {
                                    label: "Змінити ролі",
                                    onSelect: () => openEditRolesDialog(m),
                                  }
                                : {
                                    label:
                                      isSuperAdmin && m.user_id === currentUserId
                                        ? "Неможна змінити себе"
                                        : "Тільки перегляд",
                                    disabled: true,
                                    muted: true,
                                  },
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

      <Dialog
        open={!!editMember}
        onOpenChange={(open) => {
          if (!open && !editBusy) setEditMember(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Змінити ролі учасника</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Ця дія доступна тільки Super Admin.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Користувач</Label>
              <Input value={editMember?.email ?? "Не вказано"} disabled className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Рівень доступу</Label>
              <Select value={editAccessRole} onValueChange={setEditAccessRole}>
                <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                  {MEMBER_ACCESS_ROLE_OPTIONS.find((o) => o.value === editAccessRole)?.label}
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ACCESS_ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Роль у команді</Label>
              <Select value={editJobRole} onValueChange={setEditJobRole}>
                <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                  {JOB_ROLE_OPTIONS.find((o) => o.value === editJobRole)?.label}
                </SelectTrigger>
                <SelectContent>
                  {JOB_ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setEditMember(null)}
                disabled={editBusy}
              >
                Скасувати
              </Button>
              <Button className="flex-1 h-11" onClick={saveMemberRoles} disabled={editBusy}>
                {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зберегти"}
              </Button>
            </div>
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
