import { useEffect, useState } from "react";

import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";

export type TeamMemberOption = { id: string; label: string; avatarUrl: string | null };

/**
 * Люди команди для вибору менеджера в шапці картки. Той самий довідник, що
 * брала повна форма замовника: доступи й склад — за workspace, не за team_id.
 */
export function useTeamMembers(userId: string | null) {
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId || cancelled) return;
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        if (!cancelled) {
          setMembers(rows.map((member) => ({ id: member.userId, label: member.label, avatarUrl: member.avatarDisplayUrl })));
        }
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return members;
}
