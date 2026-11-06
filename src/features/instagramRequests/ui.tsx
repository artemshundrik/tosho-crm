import { AvatarBase } from "@/components/app/avatar-kit";
import { toneBadgeClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

export const ToneTag = ({ text, tone, className }: { text: string; tone: Tone; className?: string }) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-px text-2xs", toneBadgeClass[tone], className)}>{text}</span>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-2xs uppercase tracking-[0.09em] text-muted-foreground">{children}</span>
);

export const TestTag = () => <ToneTag text="Тест" tone="neutral" />;

/** Той, хто займається: «Ви» для себе, бо читати власне прізвище в списку зайве. */
export function OwnerMark({ member, isMe, size = 18 }: { member: WorkspaceMemberDisplayRow | null; isMe: boolean; size?: number }) {
  if (!member) return <span className="text-xs text-muted-foreground">Без менеджера</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <AvatarBase
        src={member.avatarDisplayUrl ?? member.avatarUrl}
        name={member.label}
        fallback={member.initials}
        size={size}
        fallbackClassName="text-2xs font-semibold"
        showStatusIndicator={false}
      />
      <span className="truncate">{isMe ? "Ви" : member.label}</span>
    </span>
  );
}
