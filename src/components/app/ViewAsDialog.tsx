import { useEffect, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { writeViewAs, type ViewAsTarget } from "@/auth/viewAs";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Вибір співробітника для режиму «Дивитись як» (тільки owner).
 * Показує реальних людей із довідника — так у режимі одразу видно живі дані
 * (ставка, візуали, задачі), а не порожні екрани.
 */

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "•";

type Member = {
  userId: string;
  label: string;
  jobRole: string | null;
  accessRole: string | null;
  avatarUrl: string | null;
  initials: string;
  inactive: boolean;
};

export function ViewAsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { userId, canUseViewAs, viewAs } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!open || !userId || !canUseViewAs) return;
    (async () => {
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId || cancelled) return;
      const rows = await listWorkspaceMembersForDisplay(workspaceId);
      if (cancelled) return;
      setMembers(
        rows
          .filter((row) => row.userId && row.userId !== userId)
          .map((row) => ({
            userId: row.userId,
            label: row.fullName || row.email || row.userId.slice(0, 8),
            jobRole: row.jobRole ?? null,
            accessRole: row.accessRole ?? null,
            avatarUrl: row.avatarUrl ?? null,
            initials: row.initials || getInitials(row.fullName || row.email || ""),
            inactive: (row.employmentStatus ?? "").toLowerCase() !== "active",
          }))
          .sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.label.localeCompare(b.label, "uk"))
      );
    })().catch((error) => console.warn("Failed to load members for view-as", error));
    return () => {
      cancelled = true;
    };
  }, [open, userId, canUseViewAs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (member) =>
        member.label.toLowerCase().includes(needle) || (member.jobRole ?? "").toLowerCase().includes(needle)
    );
  }, [members, query]);

  const pick = (member: Member) => {
    const target: ViewAsTarget = {
      userId: member.userId,
      label: member.label,
      jobRole: member.jobRole,
      accessRole: member.accessRole,
    };
    writeViewAs(target);
    onOpenChange(false);
  };

  if (!canUseViewAs) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Дивитись як
          </DialogTitle>
          <DialogDescription>
            Інтерфейс і дані показуватимуться так, як їх бачить обрана людина. Ваші права в базі не змінюються —
            це режим перегляду, а не перевірка доступів.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук за іменем або посадою"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="-mx-1 max-h-[320px] overflow-y-auto px-1">
          {filtered.length === 0 ? (
            <div className="rounded-section border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Нікого не знайдено.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => pick(member)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40",
                    viewAs?.userId === member.userId && "bg-primary/5 ring-1 ring-primary/25"
                  )}
                >
                  <AvatarBase
                    src={member.avatarUrl}
                    name={member.label}
                    fallback={member.initials}
                    size={32}
                    className="shrink-0 border-border/70"
                    inactive={member.inactive}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{member.label}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {member.jobRole ?? member.accessRole ?? "—"}
                      {member.inactive ? " · неактивний" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
