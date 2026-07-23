import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Files, Lock, Calendar, FileText, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  type DesignTaskType,
} from "@/lib/designTaskType";

const RASTER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

function isImageFile(name: string, mime: string | null) {
  if (mime && mime.toLowerCase().startsWith("image/")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return RASTER_IMAGE_EXTENSIONS.has(ext);
}

export type DuplicateSourceFile = {
  id: string;
  name: string;
  bucket: string;
  path: string;
  mime: string | null;
};

export type DuplicateSourceView = {
  id: string;
  taskNumber: string | null;
  title: string | null;
  customerName: string | null;
  customerType: "customer" | "lead" | null;
  customerLogoUrl: string | null;
  managerLabel: string | null;
  managerAvatarUrl: string | null;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  assigneeAvatarUrl: string | null;
  deadline: string | null;
  taskType: DesignTaskType | null;
  hasBrief: boolean;
  files: DuplicateSourceFile[];
};

export type DuplicateDesignTaskOptions = {
  briefFileIds: string[];
  briefMode: "edit" | "new";
  taskType: DesignTaskType | null;
  carryAssignee: boolean;
  carryDeadline: boolean;
};

type DuplicateDesignTaskDialogProps = {
  open: boolean;
  source: DuplicateSourceView | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (options: DuplicateDesignTaskOptions) => void;
};

export function DuplicateDesignTaskDialog({
  open,
  source,
  saving,
  error,
  onCancel,
  onConfirm,
}: DuplicateDesignTaskDialogProps) {
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [briefMode, setBriefMode] = useState<"edit" | "new">("edit");
  const [taskType, setTaskType] = useState<DesignTaskType | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [carryAssignee, setCarryAssignee] = useState(false);
  const [carryDeadline, setCarryDeadline] = useState(false);
  const [previewByFileId, setPreviewByFileId] = useState<Record<string, string | null>>({});

  const sourceId = source?.id ?? null;

  useEffect(() => {
    if (open && source) {
      setFileIds(source.files.map((file) => file.id));
      setBriefMode(source.hasBrief ? "edit" : "new");
      setTaskType(source.taskType);
      setCarryAssignee(false);
      setCarryDeadline(false);
    }
    // Reset only when a different task is opened, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  useEffect(() => {
    if (!open || !source) {
      setPreviewByFileId({});
      return;
    }
    const imageFiles = source.files.filter(
      (file) => file.bucket && file.path && isImageFile(file.name, file.mime)
    );
    if (imageFiles.length === 0) {
      setPreviewByFileId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        imageFiles.map(async (file) => {
          const url =
            (await getSignedAttachmentUrl(file.bucket, file.path, "preview")) ??
            (await getSignedAttachmentUrl(file.bucket, file.path, "original"));
          return [file.id, url] as const;
        })
      );
      if (!cancelled) setPreviewByFileId(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  const toggleFile = (id: string, checked: boolean) => {
    setFileIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((value) => value !== id)));
  };

  const TaskTypeIcon = taskType ? DESIGN_TASK_TYPE_ICONS[taskType] : null;
  const selectedCount = fileIds.length;
  const totalFiles = source?.files.length ?? 0;

  const sourceLabel = useMemo(() => {
    if (!source) return "";
    const number = source.taskNumber ? `#${source.taskNumber}` : "";
    return [number, source.title].filter(Boolean).join(" · ");
  }, [source]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Скопіювати дизайн-задачу</DialogTitle>
          <DialogDescription>{sourceLabel ? `З ${sourceLabel}` : "Створити нову задачу на основі цієї"}</DialogDescription>
        </DialogHeader>

        {source ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Що перенести в нову задачу</p>

            <div className="flex items-center gap-3 border-t py-3">
              <Checkbox checked disabled aria-label="Клієнт і менеджер переносяться завжди" />
              <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-2">
                  <EntityAvatar src={source.customerLogoUrl} name={source.customerName} size={32} />
                  <div className="leading-tight">
                    <div className="text-sm">
                      {source.customerName ?? (source.customerType === "lead" ? "Лід" : "Замовник")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {source.customerType === "lead" ? "лід" : "замовник"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AvatarBase
                    src={source.managerAvatarUrl}
                    name={source.managerLabel ?? undefined}
                    size={28}
                    showStatusIndicator={false}
                  />
                  <div className="leading-tight">
                    <div className="text-sm">{source.managerLabel ?? "Менеджер"}</div>
                    <div className="text-xs text-muted-foreground">менеджер</div>
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                завжди
              </span>
            </div>

            <div className="border-t py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Вхідні файли від менеджера</div>
                  <div className="text-xs text-muted-foreground">обери, що саме треба для нової задачі</div>
                </div>
                {totalFiles > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {selectedCount} з {totalFiles}
                  </span>
                ) : null}
              </div>
              {totalFiles > 0 ? (
                <div className="mt-2 flex flex-col gap-1.5 pl-7">
                  {source.files.map((file) => {
                    const previewUrl = previewByFileId[file.id] ?? null;
                    const showImage = isImageFile(file.name, file.mime) && Boolean(previewUrl);
                    return (
                      <label
                        key={file.id}
                        className="group relative flex cursor-pointer items-center gap-2.5 text-sm"
                      >
                        <Checkbox
                          checked={fileIds.includes(file.id)}
                          onCheckedChange={(value) => toggleFile(file.id, value === true)}
                        />
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                          {showImage ? (
                            <img src={previewUrl ?? ""} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="truncate">{file.name}</span>
                        {showImage ? (
                          <span className="pointer-events-none absolute bottom-9 left-9 z-20 hidden w-44 rounded-md border bg-background p-2 shadow-md group-hover:block">
                            <img
                              src={previewUrl ?? ""}
                              alt=""
                              className="h-28 w-full rounded bg-muted/40 object-contain"
                            />
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{file.name}</span>
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">У задачі немає вхідних файлів.</p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t py-3">
              <FileText className="h-[18px] w-[18px] text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm">ТЗ (бриф)</div>
                <div className="text-xs text-muted-foreground">для нового продукту розташування інше</div>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border">
                <button
                  type="button"
                  disabled={!source.hasBrief}
                  onClick={() => setBriefMode("edit")}
                  className={`px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                    briefMode === "edit" ? "bg-muted" : "bg-transparent hover:bg-muted/60"
                  }`}
                >
                  Редагувати старий
                </button>
                <button
                  type="button"
                  onClick={() => setBriefMode("new")}
                  className={`border-l px-3 py-1.5 text-xs transition-colors ${
                    briefMode === "new" ? "bg-muted" : "bg-transparent hover:bg-muted/60"
                  }`}
                >
                  Написати новий
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t py-3">
              <Checkbox checked disabled aria-label="Тип задачі переноситься" />
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {TaskTypeIcon ? <TaskTypeIcon className="h-[18px] w-[18px]" /> : null}
              </span>
              <div className="flex-1">
                <div className="text-sm">Тип задачі</div>
                <div className="text-xs text-muted-foreground">можна змінити для нової задачі</div>
              </div>
              <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                    <span>{taskType ? DESIGN_TASK_TYPE_LABELS[taskType] : "Обрати тип"}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="end">
                  <div className="space-y-1">
                    {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
                      const TypeIcon = DESIGN_TASK_TYPE_ICONS[option.value];
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-full justify-start gap-2 text-sm"
                          onClick={() => {
                            setTaskType(option.value);
                            setTypePopoverOpen(false);
                          }}
                        >
                          <TypeIcon className="h-3.5 w-3.5" />
                          <span>{option.label}</span>
                          {taskType === option.value ? <Check className="ml-auto h-4 w-4" /> : null}
                        </Button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {source.assigneeUserId ? (
              <label className="flex cursor-pointer items-center gap-3 border-t py-3">
                <Checkbox checked={carryAssignee} onCheckedChange={(value) => setCarryAssignee(value === true)} />
                <AvatarBase
                  src={source.assigneeAvatarUrl}
                  name={source.assigneeLabel ?? undefined}
                  size={28}
                  showStatusIndicator={false}
                />
                <div className="flex-1 text-sm">
                  Виконавець <span className="text-xs text-muted-foreground">· {source.assigneeLabel ?? "—"}</span>
                </div>
              </label>
            ) : null}

            {source.deadline ? (
              <label className="flex cursor-pointer items-center gap-3 border-t py-3">
                <Checkbox checked={carryDeadline} onCheckedChange={(value) => setCarryDeadline(value === true)} />
                <Calendar className="h-[18px] w-[18px] text-muted-foreground" />
                <div className="flex-1 text-sm">
                  Дедлайн <span className="text-xs text-muted-foreground">· зазвичай ставлять новий</span>
                </div>
              </label>
            ) : null}

            <div className="mt-3 rounded-md bg-muted/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                Скинеться автоматично
              </div>
              <div className="mt-1 text-xs text-muted-foreground/80">
                статус → новий · новий номер · правки · готові візуали · таймер
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter className="items-center sm:justify-between">
          <span className="hidden items-center gap-1.5 text-2xs text-muted-foreground sm:flex">
            <Files className="h-3.5 w-3.5" />
            файли копіюються, не посилання
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Скасувати
            </Button>
            <Button
              onClick={() => onConfirm({ briefFileIds: fileIds, briefMode, taskType, carryAssignee, carryDeadline })}
              disabled={saving || !source}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Створити копію
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
