import React from "react";
import { AtSign, Check, Loader2, Mic, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useDictation } from "@/lib/useDictation";
import { AvatarBase } from "@/components/app/avatar-kit";
import { formatJobRole } from "@/lib/jobRoles";
import { cn } from "@/lib/utils";

export type MentionCandidate = {
  userId: string;
  name: string;
  /** Сире значення job_role — підпис форматуємо через formatJobRole. */
  role: string | null;
  avatarUrl: string | null;
};

type Props = {
  sending: boolean;
  candidates: MentionCandidate[];
  onSend: (body: string) => void;
  /**
   * Завантаження файлу. Свого сховища чат не заводить: файл іде тим самим
   * шляхом, що й вкладення задачі, а в розмові лишається повідомлення про нього.
   */
  onAttachFiles?: (files: FileList) => Promise<void> | void;
  attaching?: boolean;
};

/** Смужки еквалайзера під час запису: різна висота й зсув фази. */
const WAVE_BARS = [
  { height: 8, delay: "0ms" },
  { height: 14, delay: "120ms" },
  { height: 10, delay: "240ms" },
  { height: 16, delay: "80ms" },
  { height: 9, delay: "300ms" },
  { height: 13, delay: "180ms" },
  { height: 7, delay: "60ms" },
];

/** Стеля росту поля вводу — приблизно чотири рядки. */
const MAX_INPUT_HEIGHT = 92;

/**
 * Композер у стилі месенджера: одна капсула, іконки-привиди всередині,
 * кругла кнопка надсилання.
 *
 * Попередній варіант ставив у ряд прямокутник, пігулку з текстом і синій
 * прямокутник — три різні форми, через що рядок читався як панель
 * інструментів, а не як поле чату.
 */
export function ThreadComposer({ sending, candidates, onSend, onAttachFiles, attaching }: Props) {
  const [body, setBody] = React.useState("");
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const dictation = useDictation({
    context: "comment",
    onResult: (text) => {
      const clean = text.trim();
      if (!clean) return;
      setBody((previous) => (previous ? `${previous.trimEnd()} ${clean}` : clean));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  React.useEffect(() => {
    if (dictation.state === "error" && dictation.error) toast.error(dictation.error);
  }, [dictation.state, dictation.error]);

  const isRecording = dictation.state === "recording";
  const isTranscribing = dictation.state === "transcribing";
  const elapsed = Math.floor(dictation.elapsedMs / 1000);
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

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

  // Поле росте разом із текстом до чотирьох рядків, далі — власний скрол.
  // Саме так поводяться месенджери: один рядок не змушує гадати, скільки
  // написано, а простирадло не з'їдає всю панель.
  React.useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [body]);

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
              <AvatarBase size={20} src={candidate.avatarUrl} name={candidate.name} className="shrink-0" />
              <span className="truncate font-medium">{candidate.name}</span>
              {candidate.role ? (
                <span className="ml-auto shrink-0 text-3xs text-muted-foreground">
                  {formatJobRole(candidate.role)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {isRecording || isTranscribing ? (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[20px] border px-2.5 py-1.5 transition-colors",
            isRecording ? "border-destructive/30 bg-danger-soft/60" : "border-border/60 bg-muted/50"
          )}
        >
          {isRecording ? (
            <>
              <button
                type="button"
                aria-label="Скасувати запис"
                onClick={() => dictation.cancel()}
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>

              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
                {elapsedLabel}
              </span>

              {/* Еквалайзер: показує, що запис справді йде. */}
              <span className="flex flex-1 items-center gap-[3px]" aria-hidden="true">
                {WAVE_BARS.map((bar, index) => (
                  <span
                    key={index}
                    className="w-[3px] rounded-full bg-destructive/45 motion-safe:animate-[thread-wave_1.1s_ease-in-out_infinite]"
                    style={{ height: bar.height, animationDelay: bar.delay }}
                  />
                ))}
              </span>

              <button
                type="button"
                aria-label="Завершити запис"
                onClick={() => dictation.stop()}
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              <span className="flex-1 text-xs text-muted-foreground">Розпізнаю голос…</span>
            </>
          )}
        </div>
      ) : (
      <div className="flex items-end gap-1 rounded-[20px] border border-border/60 bg-card p-1 pl-1.5 focus-within:border-primary/50">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (event) => {
            const files = event.target.files;
            if (files && files.length > 0) await onAttachFiles?.(files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label="Прикріпити файл"
          title="Файл ляже у «Файли», а тут стане повідомленням"
          disabled={!onAttachFiles || attaching}
          onClick={() => fileInputRef.current?.click()}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
        >
          {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Згадати учасника"
          onClick={() => {
            handleChange(`${body}${body && !body.endsWith(" ") ? " " : ""}@`);
            inputRef.current?.focus();
          }}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <AtSign className="h-3.5 w-3.5" />
        </button>
        {dictation.isSupported ? (
          <button
            type="button"
            aria-label="Продиктувати голосом"
            onClick={() => void dictation.start()}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
        ) : null}

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
          style={{ maxHeight: MAX_INPUT_HEIGHT }}
          className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-[7px] text-xs leading-snug outline-none placeholder:text-muted-foreground"
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
      )}
    </div>
  );
}
