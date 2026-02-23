import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type PresenceEntityContext = {
  entityType: "quote" | "design_task" | null;
  entityId: string | null;
};

type PresenceRealtimeMeta = {
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  current_path?: string | null;
  current_label?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  last_seen_at?: string | null;
};

type PresenceDbRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_path: string | null;
  current_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  last_seen_at: string;
};

export type WorkspacePresenceEntry = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  currentPath: string | null;
  currentLabel: string | null;
  entityType: string | null;
  entityId: string | null;
  lastSeenAt: string | null;
  online: boolean;
  idle: boolean;
  isSelf: boolean;
};

export type WorkspacePresenceState = {
  entries: WorkspacePresenceEntry[];
  onlineEntries: WorkspacePresenceEntry[];
  activeHereEntries: WorkspacePresenceEntry[];
  getEntityViewers: (entityType: string, entityId: string) => WorkspacePresenceEntry[];
  loading: boolean;
};

type UseWorkspacePresenceStateOptions = {
  teamId: string | null;
  userId: string | null;
  session: Session | null;
  pathname: string;
  currentLabel: string;
};

const ONLINE_WINDOW_MS = 45 * 1000;
const IDLE_WINDOW_MS = 5 * 60 * 1000;
const DB_HISTORY_WINDOW_MS = 30 * 60 * 1000;

function isSchemaObjectMissing(message?: string | null) {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
}

function emailLocalPart(email?: string | null) {
  if (!email) return "";
  return email.split("@")[0]?.trim() ?? "";
}

function parseEntityFromPath(pathname: string): PresenceEntityContext {
  const quoteMatch = pathname.match(/^\/orders\/estimates\/([^/]+)$/);
  if (quoteMatch?.[1]) {
    return { entityType: "quote", entityId: quoteMatch[1] };
  }
  const designTaskMatch = pathname.match(/^\/design\/([^/]+)$/);
  if (designTaskMatch?.[1]) {
    return { entityType: "design_task", entityId: designTaskMatch[1] };
  }
  return { entityType: null, entityId: null };
}

function normalizeRealtimeState(state: Record<string, PresenceRealtimeMeta[]>) {
  const next: Record<string, PresenceRealtimeMeta> = {};
  for (const [key, metas] of Object.entries(state)) {
    if (!Array.isArray(metas) || metas.length === 0) continue;
    const latest = metas
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.last_seen_at ?? 0).getTime();
        const bTime = new Date(b.last_seen_at ?? 0).getTime();
        return bTime - aTime;
      })[0];
    next[key] = latest;
  }
  return next;
}

export function useWorkspacePresenceState({
  teamId,
  userId,
  session,
  pathname,
  currentLabel,
}: UseWorkspacePresenceStateOptions): WorkspacePresenceState {
  const [dbRowsByUserId, setDbRowsByUserId] = useState<Record<string, PresenceDbRow>>({});
  const [realtimeByUserId, setRealtimeByUserId] = useState<Record<string, PresenceRealtimeMeta>>({});
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selfAvatarOverride, setSelfAvatarOverride] = useState<string | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const entityContext = useMemo(() => parseEntityFromPath(pathname), [pathname]);

  const selfDisplayName = useMemo(() => {
    const metaName = (session?.user?.user_metadata?.full_name as string | undefined)?.trim();
    if (metaName) return metaName;
    const emailAlias = emailLocalPart(session?.user?.email);
    if (emailAlias) return emailAlias;
    return "Користувач";
  }, [session?.user?.email, session?.user?.user_metadata]);

  const selfAvatarUrl = useMemo(() => {
    if (selfAvatarOverride) return selfAvatarOverride;
    return (session?.user?.user_metadata?.avatar_url as string | undefined) ?? null;
  }, [selfAvatarOverride, session?.user?.user_metadata]);

  const buildTrackPayload = useCallback(
    (): PresenceRealtimeMeta => ({
      user_id: userId ?? undefined,
      display_name: selfDisplayName,
      avatar_url: selfAvatarUrl,
      current_path: pathname,
      current_label: currentLabel,
      entity_type: entityContext.entityType,
      entity_id: entityContext.entityId,
      last_seen_at: new Date().toISOString(),
    }),
    [currentLabel, entityContext.entityId, entityContext.entityType, pathname, selfAvatarUrl, selfDisplayName, userId]
  );

  const upsertPresenceRow = useCallback(async () => {
    if (!teamId || !userId || dbUnavailable) return;

    const payload = {
      team_id: teamId,
      user_id: userId,
      display_name: selfDisplayName,
      avatar_url: selfAvatarUrl,
      current_path: pathname,
      current_label: currentLabel,
      entity_type: entityContext.entityType,
      entity_id: entityContext.entityId,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_presence").upsert(payload, { onConflict: "team_id,user_id" });
    if (error && isSchemaObjectMissing(error.message)) {
      setDbUnavailable(true);
    }
  }, [
    currentLabel,
    dbUnavailable,
    entityContext.entityId,
    entityContext.entityType,
    pathname,
    selfAvatarUrl,
    selfDisplayName,
    teamId,
    userId,
  ]);

  useEffect(() => {
    if (!userId) return;
    const handleAvatarUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ avatarUrl?: string | null }>;
      const nextAvatar = customEvent.detail?.avatarUrl ?? null;
      setSelfAvatarOverride(nextAvatar);

      const nowIso = new Date().toISOString();
      setRealtimeByUserId((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] ?? {}),
          user_id: userId,
          avatar_url: nextAvatar,
          display_name: prev[userId]?.display_name ?? selfDisplayName,
          current_path: prev[userId]?.current_path ?? pathname,
          current_label: prev[userId]?.current_label ?? currentLabel,
          entity_type: prev[userId]?.entity_type ?? entityContext.entityType,
          entity_id: prev[userId]?.entity_id ?? entityContext.entityId,
          last_seen_at: nowIso,
        },
      }));

      setDbRowsByUserId((prev) => {
        const current = prev[userId];
        if (!current) return prev;
        return {
          ...prev,
          [userId]: {
            ...current,
            avatar_url: nextAvatar,
            last_seen_at: nowIso,
          },
        };
      });
    };

    window.addEventListener("profile:avatar-updated", handleAvatarUpdated as EventListener);
    return () => {
      window.removeEventListener("profile:avatar-updated", handleAvatarUpdated as EventListener);
    };
  }, [currentLabel, entityContext.entityId, entityContext.entityType, pathname, selfDisplayName, userId]);

  useEffect(() => {
    if (!teamId || !userId) {
      setDbRowsByUserId({});
      setDbUnavailable(false);
      return;
    }
    if (dbUnavailable) return;

    let cancelled = false;
    setLoading(true);

    const loadDbRows = async () => {
      const cutoffIso = new Date(Date.now() - DB_HISTORY_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("user_presence")
        .select("user_id,display_name,avatar_url,current_path,current_label,entity_type,entity_id,last_seen_at")
        .eq("team_id", teamId)
        .gte("last_seen_at", cutoffIso)
        .limit(500);

      if (cancelled) return;

      if (error) {
        if (isSchemaObjectMissing(error.message)) {
          setDbUnavailable(true);
          setDbRowsByUserId({});
        }
        setLoading(false);
        return;
      }

      const next = ((data as PresenceDbRow[] | null) ?? []).reduce<Record<string, PresenceDbRow>>((acc, row) => {
        acc[row.user_id] = row;
        return acc;
      }, {});
      setDbRowsByUserId(next);
      setLoading(false);
    };

    void loadDbRows();

    const channel = supabase
      .channel(`user-presence-db:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          setDbRowsByUserId((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") {
              const row = payload.old as PresenceDbRow;
              if (row?.user_id) delete next[row.user_id];
              return next;
            }
            const row = payload.new as PresenceDbRow;
            if (!row?.user_id) return prev;
            next[row.user_id] = row;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [dbUnavailable, teamId, userId]);

  useEffect(() => {
    if (!teamId || !userId) {
      setRealtimeByUserId({});
      return;
    }

    const channel = supabase.channel(`workspace-presence:${teamId}`, {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, PresenceRealtimeMeta[]>;
      setRealtimeByUserId(normalizeRealtimeState(state));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track(buildTrackPayload());
      }
    });

    presenceChannelRef.current = channel;

    return () => {
      presenceChannelRef.current = null;
      setRealtimeByUserId({});
      supabase.removeChannel(channel);
    };
  }, [buildTrackPayload, teamId, userId]);

  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.track(buildTrackPayload());
  }, [buildTrackPayload]);

  useEffect(() => {
    void upsertPresenceRow();
    if (!teamId || !userId || dbUnavailable) return;
    const id = window.setInterval(() => {
      void upsertPresenceRow();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [dbUnavailable, teamId, upsertPresenceRow, userId]);

  const entries = useMemo<WorkspacePresenceEntry[]>(() => {
    const allUserIds = new Set<string>([
      ...Object.keys(dbRowsByUserId),
      ...Object.keys(realtimeByUserId),
      ...(userId ? [userId] : []),
    ]);

    const now = Date.now();
    const list = Array.from(allUserIds).map((uid) => {
      const dbRow = dbRowsByUserId[uid];
      const realtime = realtimeByUserId[uid];
      const lastSeenAt = realtime?.last_seen_at ?? dbRow?.last_seen_at ?? null;
      const ageMs = lastSeenAt ? now - new Date(lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
      const online = Boolean(realtime) || ageMs <= ONLINE_WINDOW_MS;
      const idle = !online && ageMs <= IDLE_WINDOW_MS;
      const fallbackName = uid === userId ? selfDisplayName : `Користувач ${uid.slice(0, 8)}`;
      return {
        userId: uid,
        displayName: (realtime?.display_name ?? dbRow?.display_name ?? fallbackName)?.trim() || fallbackName,
        avatarUrl: realtime?.avatar_url ?? dbRow?.avatar_url ?? (uid === userId ? selfAvatarUrl : null),
        currentPath: realtime?.current_path ?? dbRow?.current_path ?? null,
        currentLabel: realtime?.current_label ?? dbRow?.current_label ?? null,
        entityType: realtime?.entity_type ?? dbRow?.entity_type ?? null,
        entityId: realtime?.entity_id ?? dbRow?.entity_id ?? null,
        lastSeenAt,
        online,
        idle,
        isSelf: uid === userId,
      };
    });

    return list
      .filter((entry) => entry.online || entry.idle)
      .sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        const aTime = new Date(a.lastSeenAt ?? 0).getTime();
        const bTime = new Date(b.lastSeenAt ?? 0).getTime();
        return bTime - aTime;
      });
  }, [dbRowsByUserId, realtimeByUserId, selfAvatarUrl, selfDisplayName, userId]);

  const onlineEntries = useMemo(() => entries.filter((entry) => entry.online), [entries]);

  const activeHereEntries = useMemo(() => {
    return onlineEntries.filter((entry) => {
      if (
        entityContext.entityType &&
        entityContext.entityId &&
        entry.entityType === entityContext.entityType &&
        entry.entityId === entityContext.entityId
      ) {
        return true;
      }
      return entry.currentPath === pathname;
    });
  }, [entityContext.entityId, entityContext.entityType, onlineEntries, pathname]);

  const getEntityViewers = useCallback(
    (entityType: string, entityId: string) =>
      onlineEntries.filter((entry) => entry.entityType === entityType && entry.entityId === entityId),
    [onlineEntries]
  );

  return {
    entries,
    onlineEntries,
    activeHereEntries,
    getEntityViewers,
    loading,
  };
}
