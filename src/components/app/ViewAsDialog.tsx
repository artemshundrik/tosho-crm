import { useEffect, useMemo, useState } from "react";
import { Briefcase, Eye, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { writeViewAs, type ViewAsTarget } from "@/auth/viewAs";
import { formatJobRole, JOB_ROLE_NAMES } from "@/lib/jobRoles";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Вибір цілі для режиму «Дивитись як» — два різні входи, а не два списки
 * одного й того самого.
 *
 * «Людина» (owner) показує реальних людей із довідника: сенс саме в живих
 * даних — ставка, візуали, задачі, — тому екрани не порожні. Через це вхід і
 * закритий для решти, і через це він лише для перегляду.
 *
 * «Посада» (owner і SEO) не показує нічиїх даних узагалі — тільки інтерфейс
 * ролі. Тому тут можна працювати: діє людина від свого імені й у межах своїх
 * прав, просто екранами тієї посади.
 */

type Tab = "person" | "role";

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

const ROLE_OPTIONS = Object.entries(JOB_ROLE_NAMES)
  .map(([key, label]) => ({ key, label }))
  .sort((a, b) => a.label.localeCompare(b.label, "uk"));

export function ViewAsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { userId, canViewAsPerson, canViewAsRole, viewAs } = useAuth();
  const [tab, setTab] = useState<Tab>(canViewAsPerson ? "person" : "role");
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");

  // Вхід «людина» є не в усіх: відкриваємо на тій вкладці, яка людині доступна.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTab(canViewAsPerson ? "person" : "role");
  }, [open, canViewAsPerson]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !userId || !canViewAsPerson || tab !== "person") return;
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
            // avatarDisplayUrl, а НЕ avatarUrl: друге — посилання на об'єкт у
            // сховищі, і <img> його не покаже. Через це аватарка була видна
            // лише в тих, хто зберіг її повним URL, — звідси «не всі мають».
            avatarUrl: row.avatarDisplayUrl ?? null,
            initials: row.initials || getInitials(row.fullName || row.email || ""),
            inactive: (row.employmentStatus ?? "").toLowerCase() !== "active",
          }))
          .sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.label.localeCompare(b.label, "uk"))
      );
    })().catch((error) => console.warn("Failed to load members for view-as", error));
    return () => {
      cancelled = true;
    };
  }, [open, userId, canViewAsPerson, tab]);

  const needle = query.trim().toLowerCase();

  const filteredMembers = useMemo(() => {
    if (!needle) return members;
    return members.filter(
      (member) =>
        member.label.toLowerCase().includes(needle) || (member.jobRole ?? "").toLowerCase().includes(needle)
    );
  }, [members, needle]);

  const filteredRoles = useMemo(() => {
    if (!needle) return ROLE_OPTIONS;
    return ROLE_OPTIONS.filter(
      (role) => role.label.toLowerCase().includes(needle) || role.key.includes(needle)
    );
  }, [needle]);

  const pick = (target: ViewAsTarget) => {
    writeViewAs(target);
    onOpenChange(false);
  };

  if (!canViewAsPerson && !canViewAsRole) return null;

  const showTabs = canViewAsPerson && canViewAsRole;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вибір, а не форма: клік по рядку вмикає режим і закриває вікно,
          зберігати нема чого. Без опт-ауту набране в пошуку рахувалось «змінами»
          і вихід питав «Закрити без збереження?». */}
      <DialogContent dismissible className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Дивитись як
          </DialogTitle>
          <DialogDescription>
            {tab === "person"
              ? "Інтерфейс і дані показуватимуться так, як їх бачить обрана людина. Це режим перегляду: дії вимкнені, щоб ви нічого не зробили від її імені."
              : "Інтерфейс посади без конкретної людини — чужих даних тут немає. Працювати можна: дії підуть від вашого імені й у межах ваших прав."}
          </DialogDescription>
        </DialogHeader>

        {showTabs ? (
          <SegmentedGroup className={cn(SEGMENTED_GROUP_SM, "w-full")}>
            {(
              [
                { value: "person" as const, label: "Людина", icon: Eye },
                { value: "role" as const, label: "Посада", icon: Briefcase },
              ]
            ).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={tab === value}
                data-state={tab === value ? "on" : "off"}
                onClick={() => setTab(value)}
                className={cn(SEGMENTED_TRIGGER_SM, "flex-1")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </SegmentedGroup>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "person" ? "Пошук за іменем або посадою" : "Пошук посади"}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="-mx-1 max-h-[320px] overflow-y-auto px-1">
          {tab === "person" ? (
            filteredMembers.length === 0 ? (
              <EmptyRow>Нікого не знайдено.</EmptyRow>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filteredMembers.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() =>
                      pick({
                        kind: "person",
                        userId: member.userId,
                        label: member.label,
                        jobRole: member.jobRole,
                        accessRole: member.accessRole,
                        avatarUrl: member.avatarUrl,
                      })
                    }
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40",
                      viewAs?.kind === "person" &&
                        viewAs.userId === member.userId &&
                        "bg-primary/5 ring-1 ring-primary/25"
                    )}
                  >
                    {/* loading="eager": аватарки зі сховища AvatarBase резолвить
                        ліниво, через IntersectionObserver, а в модалці той не
                        спрацьовує — і фото лишалось видно тільки в тих, у кого
                        воно збережене повним URL. Список тут короткий і
                        відкривається за дією, тож чекати нема на що. */}
                    <AvatarBase
                      src={member.avatarUrl}
                      name={member.label}
                      fallback={member.initials}
                      size={32}
                      loading="eager"
                      className="shrink-0 border-border/70"
                      inactive={member.inactive}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {member.label}
                      </span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {formatJobRole(member.jobRole) || member.accessRole || "—"}
                        {member.inactive ? " · неактивний" : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : filteredRoles.length === 0 ? (
            <EmptyRow>Такої посади немає.</EmptyRow>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredRoles.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => pick({ kind: "role", jobRole: role.key, label: role.label })}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40",
                    viewAs?.kind === "role" && viewAs.jobRole === role.key && "bg-primary/5 ring-1 ring-primary/25"
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/40">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  {/* Без підпису під назвою: він однаковий у всіх рядках, тож
                      нічого не розрізняє — це сказано один раз в описі вікна. */}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                    {role.label}
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

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-section border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
