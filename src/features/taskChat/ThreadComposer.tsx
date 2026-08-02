import React from "react";
import { Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MentionCandidate = { userId: string; name: string; role: string | null };

type Props = {
  canWriteInternal: boolean;
  sending: boolean;
  candidates: MentionCandidate[];
  onSend: (body: string, visibility: "team" | "finance") => void;
};

/**
 * Композер — вбудований редактор у рамці, а не поле чату на всю ширину:
 * підказує, що це запис у нитку справи. Прапорець «Внутрішня» показуємо лише
 * тим, хто має доступ до Фінансів — інакше людина писала б нотатку, якої сама
 * потім не побачить (RLS її відсіче).
 */
export function ThreadComposer({ canWriteInternal, sending, candidates, onSend }: Props) {
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = body.trim();
    if (!text || sending) return;
    onSend(text, internal ? "finance" : "team");
    setBody("");
    setMentionQuery(null);
  };

  const handleChange = (value: string) => {
    setBody(value);
    const match = /(?:^|\s)@([^\s@]*)$/u.exec(value);
    setMentionQuery(match ? match[1] : null);
  };

  const matches = React.useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return candidates
      .filter((candidate) => !query || candidate.name.toLowerCase().includes(query))
      .slice(0, 4);
  }, [candidates, mentionQuery]);

  const applyMention = (name: string) => {
    setBody((previous) => previous.replace(/(?:^|\s)@([^\s@]*)$/u, (whole) => {
      const prefix = whole.startsWith("@") ? "" : " ";
      return `${prefix}@${name} `;
    }));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "m-2.5 flex flex-col gap-2 rounded-xl border p-2 transition-colors",
        internal ? "border-warning-soft-border bg-warning-soft" : "border-border/60 bg-card"
      )}
    >
      {matches.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-[var(--shadow-menu)]">
          {matches.map((candidate, index) => (
            <button
              key={candidate.userId}
              type="button"
              onClick={() => applyMention(candidate.name)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
                index === 0 && "bg-primary/5"
              )}
            >
              <span className="truncate font-medium">{candidate.name}</span>
              {candidate.role ? (
                <span className="ml-auto shrink-0 text-3xs text-muted-foreground">{candidate.role}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <textarea
        ref={inputRef}
        value={body}
        rows={2}
        placeholder="Написати…"
        aria-label="Текст повідомлення"
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        className="resize-none bg-transparent text-xs leading-snug outline-none placeholder:text-muted-foreground"
      />

      <div className="flex items-center gap-1.5">
        {canWriteInternal ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-pressed={internal}
            onClick={() => setInternal((value) => !value)}
            className={cn(
              "gap-1.5",
              internal && "border-warning-soft-border bg-warning-soft text-warning-foreground"
            )}
          >
            <Lock className="h-3 w-3" /> Внутрішня
          </Button>
        ) : null}

        <span className="flex-1" />

        <Button
          type="button"
          size="xs"
          className="gap-1.5"
          disabled={sending || body.trim().length === 0}
          onClick={submit}
        >
          <Send className="h-3 w-3" /> Надіслати
        </Button>
      </div>
    </div>
  );
}
