import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Lightbulb, Loader2, Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MODULE_KEYS } from "@/lib/moduleAccess";
import { isKnownModuleKey } from "@/lib/projectMap";
import { supabase } from "@/lib/supabaseClient";
import { useDictation } from "@/lib/useDictation";
import {
  KIND_LABELS,
  MODULE_LABELS,
  PRIORITY_LABELS,
  REQUEST_KINDS,
  REQUEST_PRIORITIES,
  REQUEST_ZONES,
  ZONE_LABELS,
  type RequestKind,
  type RequestPriority,
  type RequestZone,
} from "./types";

export type NewDevRequestInput = {
  title: string;
  body: string;
  kind: RequestKind;
  moduleKey: string | null;
  priority: RequestPriority;
  zone: RequestZone | null;
  /** Порожній рядок означає «теми немає» — нормалізується при збереженні. */
  theme: string | null;
  /**
   * Напрямок і пріоритет лишились такими, як їх поставив розбір.
   *
   * У режимі правки завжди false: людина відкрила картку й натиснула
   * «Зберегти» — класифікацію підтверджено, навіть якщо жодне поле не
   * змінилось.
   */
  autoClassified: boolean;
  isPrivate: boolean;
};

/** Картка, яку редагуємо. Рівно ті поля, які вікно вміє показати й змінити. */
export type EditableDevRequest = {
  id: string;
  /** «REQ-3» — у заголовку вікна, щоб було видно, що саме правимо. */
  label: string;
  title: string;
  body: string;
  kind: RequestKind;
  moduleKey: string | null;
  priority: RequestPriority | null;
  zone: RequestZone | null;
  theme: string | null;
  autoClassified: boolean;
  isPrivate: boolean;
};

export type NewDevRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  error: string | null;
  /** Відкриті картки — щоб модель підказала дубль. */
  openTitles: Array<{ id: string; label: string; title: string }>;
  /**
   * Картка для правки. null (чи відсутній) — вікно працює як «Новий запит».
   *
   * Друге майже таке саме вікно завелося б рівно до першої розбіжності: у
   * створенні й правці однакові поля, однакові списки й однакова звірка
   * напрямку з реєстром.
   */
  request?: EditableDevRequest | null;
  onSubmit: (input: NewDevRequestInput) => void;
};

type DraftResponse = {
  title?: string | null;
  body?: string | null;
  kind?: string | null;
  duplicateOf?: string | null;
  moduleKey?: string | null;
  priority?: string | null;
  existingFeature?: string | null;
};

/** Значення «немає напрямку»: Radix Select не приймає порожній рядок як value. */
const NO_MODULE = "__none__";
const NO_ZONE = "__none__";

function asKind(value: unknown): RequestKind | null {
  return typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value)
    ? (value as RequestKind)
    : null;
}

function asPriority(value: unknown): RequestPriority | null {
  return typeof value === "string" && (REQUEST_PRIORITIES as readonly string[]).includes(value)
    ? (value as RequestPriority)
    : null;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * Вікно запиту: створення і правка одним компонентом.
 *
 * Головний сценарій СТВОРЕННЯ — не друк, а розповідь: натиснути кнопку,
 * сказати своїми словами що заважає — і отримати заповнені «Суть» і
 * «Подробиці». Диктування кличеться з `clean: false` навмисно: прибирати «еее»
 * окремим викликом не треба, це зробить розбір разом зі структуруванням,
 * інакше платимо двічі за той самий текст.
 *
 * У ПРАВЦІ розповіді голосом немає, і це не економія: розбір повертає ще й
 * «схоже на дубль» та «це вже працює» — підказки, які мають сенс рівно один
 * раз, поки картки ще не існує. Правлять же те, що вже на дошці, руками й
 * прицільно.
 */
export function NewDevRequestDialog({
  open,
  onOpenChange,
  saving,
  error,
  openTitles,
  request = null,
  onSubmit,
}: NewDevRequestDialogProps) {
  const fieldId = useId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<RequestKind>("friction");
  const [moduleKey, setModuleKey] = useState<string | null>(null);
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [zone, setZone] = useState<RequestZone | null>(null);
  const [theme, setTheme] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [existingFeature, setExistingFeature] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  /**
   * Чи напрямок із пріоритетом так і лишились такими, як їх поставив розбір.
   * Правка руками гасить прапорець — інакше за цим полем не можна було б
   * порахувати, наскільки розбору взагалі можна довіряти.
   */
  const [autoClassified, setAutoClassified] = useState(false);
  // Тип, обраний руками, надиктоване не перебиває — так само, як спосіб оплати
  // в замовленні без прорахунку.
  const kindTouchedRef = useRef(false);
  /** Те саме для напрямку й пріоритету: обране людиною розбір не затирає. */
  const classificationTouchedRef = useRef(false);

  // Надиктоване ДОПИСУЄМО, а не затираємо: людина могла почати друкувати сама, і
  // втратити це через голос було б гірше, ніж дописати зайвий абзац.
  const appendBody = useCallback((text: string) => {
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
  }, []);

  const draftFromSpeech = useCallback(
    async (spokenText: string) => {
      const spoken = spokenText.trim();
      if (!spoken) return;
      setDrafting(true);
      setDraftError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Сесія протермінована");

        const response = await fetch("/.netlify/functions/dev-request-draft", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: spoken, openTitles }),
        });
        if (!response.ok) throw new Error("Розбір не вдався");
        const draft = (await response.json()) as DraftResponse;

        const draftTitle = (draft.title ?? "").trim();
        const draftBody = (draft.body ?? "").trim();
        // Порожня відповідь = розбір нічого не дав. Кладемо сире надиктоване,
        // щоб сказане не пропало.
        if (!draftTitle && !draftBody) throw new Error("Порожній розбір");

        if (draftTitle) setTitle((prev) => (prev.trim() ? prev : draftTitle));
        if (draftBody) appendBody(draftBody);
        const draftKind = asKind(draft.kind);
        if (draftKind && !kindTouchedRef.current) setKind(draftKind);
        setDuplicateOf((draft.duplicateOf ?? "").trim() || null);
        setExistingFeature((draft.existingFeature ?? "").trim() || null);

        // Напрямок функція вже звірила з реєстром, але відповідь приходить із
        // мережі — перевіряємо ще раз тут, щоб у Select не потрапило значення,
        // якого немає в списку.
        if (!classificationTouchedRef.current) {
          const draftModule = isKnownModuleKey(draft.moduleKey) ? draft.moduleKey : null;
          const draftPriority = asPriority(draft.priority);
          setModuleKey(draftModule);
          setPriority(draftPriority ?? "normal");
          // «Проставлено автоматично» — лише коли розбір справді щось вирішив.
          // Аварійна відповідь (розбір упав) теж містить пріоритет "normal", і
          // без цієї умови вона зараховувалась би в успішні класифікації —
          // тобто саме та статистика, заради якої прапорець і заведено, брехала б.
          setAutoClassified(
            Boolean(draftModule) || (draftPriority !== null && draftPriority !== "normal")
          );
        }
      } catch {
        // Що б не сталося — мережа, сесія, поламана відповідь — надиктоване
        // лишається в описі. Це єдине, що не можна втрачати.
        appendBody(spoken);
        setDraftError("Не вдалося розібрати сказане — текст поклав як є, назву допишіть самі.");
      } finally {
        setDrafting(false);
      }
    },
    [appendBody, openTitles]
  );

  // useDictation тримає найсвіжіший onResult у ref, тож ця стрілка (нова на
  // кожен рендер) завжди бачить актуальні пропси.
  const dictation = useDictation({
    context: "brief",
    clean: false,
    onResult: (text) => void draftFromSpeech(text),
  });
  const { cancel: cancelDictation } = dictation;

  /**
   * Що вже налито у форму: id картки або "new".
   *
   * Пропс `request` — це картка з дошки, і варто комусь почати передавати її
   * прямо з кешу (а не знімком, як зараз), кожен рефетч мінятиме посилання.
   * Без цієї позначки такий рефетч перезаливав би форму посеред набору тексту
   * й затирав написане — помилка, яку потім шукають годинами.
   */
  const filledForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      filledForRef.current = null;
      // Закрили посеред розповіді — мікрофон має згаснути разом із вікном.
      cancelDictation();
      return;
    }
    const formKey = request?.id ?? "new";
    if (filledForRef.current === formKey) return;
    filledForRef.current = formKey;

    // Наливаємо на відкритті, а не чистимо на закритті: очищення полів під час
    // згасання вікна людина встигає побачити.
    setTitle(request?.title ?? "");
    setBody(request?.body ?? "");
    setKind(request?.kind ?? "friction");
    setModuleKey(request?.moduleKey ?? null);
    setPriority(request?.priority ?? "normal");
    setZone(request?.zone ?? null);
    setTheme(request?.theme ?? "");
    setIsPrivate(request?.isPrivate ?? false);
    setDuplicateOf(null);
    setExistingFeature(null);
    setAutoClassified(request?.autoClassified ?? false);
    setDraftError(null);
    setDrafting(false);
    kindTouchedRef.current = false;
    classificationTouchedRef.current = false;
  }, [open, request, cancelDictation]);

  const isEdit = request !== null;

  const isRecording = dictation.state === "recording";
  // «Розбираю» для людини одне: і розпізнавання голосу, і розбір тексту.
  const isBusy = dictation.state === "transcribing" || drafting;

  const hint = isRecording
    ? "Записую… розкажіть, що не так і як має бути"
    : isBusy
      ? "Розбираю сказане…"
      : "Скажіть своїми словами — назву й опис зберу сам";

  const canSubmit = title.trim().length > 0 && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      body: body.trim(),
      kind,
      moduleKey,
      priority,
      zone,
      // Тема з пробілами й тема порожня — те саме «теми немає».
      theme: theme.trim() || null,
      autoClassified,
      isPrivate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Редагувати ${request.label}` : "Новий запит"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Виправте, що не так: текст, тип, напрямок або пріоритет."
              : "Що заважає в роботі або чого бракує. Формулювати не обов'язково — можна просто розказати."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {/* ── Розповідь голосом (лише на створенні) ── */}
          {isEdit ? null : (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant={isRecording ? "controlDestructive" : "control"}
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    if (isRecording) dictation.stop();
                    else if (!isBusy) void dictation.start();
                  }}
                  disabled={!dictation.isSupported || isBusy}
                  aria-pressed={isRecording}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Розбираю…
                    </>
                  ) : isRecording ? (
                    <>
                      <Square className="fill-current" />
                      <span className="tabular-nums">Зупинити · {formatElapsed(dictation.elapsedMs)}</span>
                    </>
                  ) : (
                    <>
                      <Mic />
                      Розказати голосом
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              {!dictation.isSupported ? (
                <p className="text-xs text-muted-foreground">
                  Цей браузер не вміє записувати звук — залишається набрати текст руками.
                </p>
              ) : null}
              {dictation.state === "error" && dictation.error ? (
                <p className="text-xs tone-text-danger">{dictation.error}</p>
              ) : null}
              {draftError ? <p className="text-xs tone-text-warning">{draftError}</p> : null}
            </div>
          )}

          {duplicateOf ? (
            <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Схоже на вже наявну картку {duplicateOf}. Якщо це вона — краще додати коментар туди.
            </p>
          ) : null}

          {/* Підказка помітна, але нічого не блокує: впевнена неправильна
              відповідь гірша за зайву картку, тож рішення лишається за людиною,
              а мовчки не зникає нічого. */}
          {existingFeature ? (
            <div className="flex items-start gap-2 rounded-lg border tone-warning-subtle px-3 py-2 text-xs leading-5">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">Схоже, це вже працює:</span> {existingFeature}
                <br />
                Якщо це не воно — створюйте картку, нічого страшного.
              </span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-title`}>
              Суть <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${fieldId}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Одним реченням: що не так"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-body`}>Подробиці</Label>
            <Textarea
              id={`${fieldId}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Де це видно, що саме відбувається, як має бути…"
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-kind`}>Тип</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                kindTouchedRef.current = true;
                setKind(value as RequestKind);
              }}
            >
              <SelectTrigger id={`${fieldId}-kind`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_KINDS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {KIND_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Напрямок і пріоритет проставляє розбір, але останнє слово за
              людиною: неправильний напрямок псує статистику тихіше й довше,
              ніж порожній. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-module`}>Напрямок</Label>
              <Select
                value={moduleKey ?? NO_MODULE}
                onValueChange={(value) => {
                  classificationTouchedRef.current = true;
                  setAutoClassified(false);
                  setModuleKey(value === NO_MODULE ? null : value);
                }}
              >
                <SelectTrigger id={`${fieldId}-module`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODULE}>Не визначено</SelectItem>
                  {MODULE_KEYS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {MODULE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-priority`}>Пріоритет</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  classificationTouchedRef.current = true;
                  setAutoClassified(false);
                  setPriority(value as RequestPriority);
                }}
              >
                <SelectTrigger id={`${fieldId}-priority`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PRIORITY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Друга вісь картки. Тип угорі каже, ЩО СТАЛОСЬ, і його знає той,
              хто просить; зона каже, ЩО ЧІПАЄМО, і видно її лише після
              розбору. Тема групує картки однієї роботи — замість дерева
              підзадач, у якому статуси батька й дітей починають конфліктувати. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-zone`}>Зона роботи</Label>
              <Select
                value={zone ?? NO_ZONE}
                onValueChange={(value) => {
                  classificationTouchedRef.current = true;
                  setAutoClassified(false);
                  setZone(value === NO_ZONE ? null : (value as RequestZone));
                }}
              >
                <SelectTrigger id={`${fieldId}-zone`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ZONE}>Не визначено</SelectItem>
                  {REQUEST_ZONES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ZONE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-theme`}>Тема</Label>
              <Input
                id={`${fieldId}-theme`}
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                placeholder="навігація"
                maxLength={40}
              />
            </div>
          </div>

          {/* У правці формулювання інше навмисно: збереження гасить прапорець
              незалежно від того, чи щось змінили, — і людина має знати про це
              ДО натискання, а не дізнатись із зниклої позначки на картці. */}
          {autoClassified ? (
            <p className="-mt-2 text-xs text-muted-foreground">
              {isEdit
                ? "Напрямок і пріоритет проставив розбір. Збережете — вважатимемо, що ви їх підтвердили."
                : "Напрямок і пріоритет проставив розбір — виправте, якщо не туди."}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Закрита картка</div>
              <div className="text-xs text-muted-foreground">
                Видно лише власнику й СЕО. Для задумів, про які команді знати зарано.
              </div>
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
              label="Закрита картка"
              size="sm"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                {isEdit ? "Зберігаємо…" : "Створюємо…"}
              </>
            ) : isEdit ? (
              "Зберегти"
            ) : (
              "Створити"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
