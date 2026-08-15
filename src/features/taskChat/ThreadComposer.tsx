import React from "react";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useDictation } from "@/lib/useDictation";
import { AvatarBase } from "@/components/app/avatar-kit";
import { formatJobRole } from "@/lib/jobRoles";
import { cn } from "@/lib/utils";
import { DictationButton, DictationCapsule } from "@/components/ui/dictation-capsule";
import { formatFileSize, isImageFile, withReadableName } from "./threadFiles";
import { ThreadEmojiPicker } from "./ThreadEmojiPicker";

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
  /** Файли, які чекають надсилання — показані прев'ю над полем вводу. */
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  canAttach: boolean;
  attaching?: boolean;
  /** Кого цитуємо — смужка над полем вводу. */
  replyTo: { author: string; body: string } | null;
  onCancelReply: () => void;
};

/** Смужки еквалайзера під час запису: різна висота й зсув фази. */
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
export function ThreadComposer({
  sending,
  candidates,
  onSend,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  canAttach,
  attaching,
  replyTo,
  onCancelReply,
}: Props) {
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

  const acceptFiles = React.useCallback(
    (incoming: FileList | null) => {
      if (!canAttach || !incoming || incoming.length === 0) return;
      onAddFiles(Array.from(incoming).map(withReadableName));
    },
    [canAttach, onAddFiles]
  );

  // Таймер і еквалайзер переїхали в DictationCapsule — тут лишається тільки
  // рішення, показувати капсулу чи звичайний рядок вводу.
  const isRecording = dictation.state === "recording";
  const isTranscribing = dictation.state === "transcribing";

  const submit = () => {
    const text = body.trim();
    if ((!text && pendingFiles.length === 0) || sending) return;
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
      .slice(0, 24);
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
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 py-1.5 pl-2 pr-1.5">
          <span className="mt-0.5 h-full w-0.5 shrink-0 self-stretch rounded-full bg-primary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-2xs font-semibold text-primary">{replyTo.author}</span>
            <span className="line-clamp-2 text-2xs text-muted-foreground">{replyTo.body}</span>
          </span>
          <button
            type="button"
            aria-label="Скасувати відповідь"
            onClick={onCancelReply}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {pendingFiles.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingFiles.map((file, index) => (
            <PendingFileChip
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => onRemoveFile(index)}
              disabled={attaching}
            />
          ))}
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="mb-2 max-h-[184px] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card shadow-[var(--shadow-menu)]">
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
        <DictationCapsule dictation={dictation} />
      ) : (
      <div className="flex min-h-[38px] items-end gap-1 rounded-3xl border border-border/60 bg-card p-1 pl-1.5 focus-within:border-primary/50">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (event) => {
            const files = event.target.files;
            if (files && files.length > 0) acceptFiles(files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label="Прикріпити файл"
          title="Файл ляже у «Файли», а тут стане повідомленням"
          disabled={!canAttach || attaching}
          onClick={() => fileInputRef.current?.click()}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
        >
          {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        </button>
        <ThreadEmojiPicker
          onPick={(emoji) => {
            const node = inputRef.current;
            const caret = node?.selectionStart ?? body.length;
            handleChange(`${body.slice(0, caret)}${emoji}${body.slice(caret)}`);
            requestAnimationFrame(() => {
              node?.focus();
              node?.setSelectionRange(caret + emoji.length, caret + emoji.length);
            });
          }}
        />
        <DictationButton dictation={dictation} />

        <textarea
          ref={inputRef}
          value={body}
          rows={1}
          placeholder="Написати…"
          aria-label="Текст повідомлення"
          onChange={(event) => handleChange(event.target.value)}
          onPaste={(event) => {
            // Cmd+V зі скріншотом: найшвидший шлях для дизайнера — не треба
            // нічого зберігати на диск.
            const files = event.clipboardData?.files;
            if (!canAttach || !files || files.length === 0) return;
            event.preventDefault();
            acceptFiles(files);
          }}
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
          disabled={sending || (body.trim().length === 0 && pendingFiles.length === 0)}
          aria-label="Надіслати"
          className={cn(
            "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-colors",
            sending || (body.trim().length === 0 && pendingFiles.length === 0)
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

/** Прев'ю файла в черзі: картинка — мініатюрою, решта — назвою й розміром. */
function PendingFileChip({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isImageFile(file)) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <span className="group relative flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 py-1 pl-1 pr-2">
      {preview ? (
        <img src={preview} alt="" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-background text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
      )}
      <span className="flex min-w-0 max-w-[120px] flex-col">
        <span className="truncate text-2xs font-medium">{file.name}</span>
        <span className="text-3xs tabular-nums text-muted-foreground">{formatFileSize(file.size)}</span>
      </span>
      <button
        type="button"
        aria-label={`Прибрати ${file.name}`}
        onClick={onRemove}
        disabled={disabled}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-destructive disabled:opacity-40"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
