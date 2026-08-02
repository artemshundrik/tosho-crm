import React from "react";
import { Mic, Paperclip, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type MentionCandidate = { userId: string; name: string; role: string | null };

type Props = {
  sending: boolean;
  candidates: MentionCandidate[];
  onSend: (body: string) => void;
};

/**
 * Композер у стилі месенджера: одна капсула, іконки-привиди всередині,
 * кругла кнопка надсилання.
 *
 * Попередній варіант ставив у ряд прямокутник, пігулку з текстом і синій
 * прямокутник — три різні форми, через що рядок читався як панель
 * інструментів, а не як поле чату.
 */
export function ThreadComposer({ sending, candidates, onSend }: Props) {
  const [body, setBody] = React.useState("");
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = body.trim();
    if (!text || sending) return;
    onSend(text);
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
    setBody((previous) =>
      previous.replace(/(?:^|\s)@([^\s@]*)$/u, (whole) => `${whole.startsWith("@") ? "" : " "}@${name} `)
    );
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  return (
    <div className="border-t border-border/40 bg-card p-2.5">
      {matches.length > 0 ? (
        <div className="mb-2 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-menu)]">
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

      <div className="flex items-end gap-1 rounded-[20px] border border-border/60 bg-card p-1 pl-1.5 focus-within:border-primary/50">
        <button
          type="button"
          aria-label="Прикріпити файл"
          title="Файл ляже у «Файли», а тут стане повідомленням"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Продиктувати голосом"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Mic className="h-3.5 w-3.5" />
        </button>

        <textarea
          ref={inputRef}
          value={body}
          rows={1}
          placeholder="Написати…"
          aria-label="Текст повідомлення"
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="min-w-0 flex-1 resize-none bg-transparent px-1 py-[7px] text-xs leading-snug outline-none placeholder:text-muted-foreground"
        />

        <button
          type="button"
          onClick={submit}
          disabled={sending || body.trim().length === 0}
          aria-label="Надіслати"
          className={cn(
            "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-colors",
            sending || body.trim().length === 0
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
