import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { KNOWN_THEMES } from "./themeRegistry";
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

/** Значення «немає напрямку»: Radix Select не приймає порожній рядок як value. */
const NO_MODULE = "__none__";
const NO_ZONE = "__none__";

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
    setAutoClassified(request?.autoClassified ?? false);
    kindTouchedRef.current = false;
    classificationTouchedRef.current = false;
  }, [open, request]);

  const isEdit = request !== null;

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
              : "Що заважає в роботі або чого бракує."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
              {/* Поле лишається вільним текстом — нова тема має заводитись тут
                  же, без міграції й без правки коду. Але порожнє поле не давало
                  побачити, що така тема вже є: 29.08.2026 на дошці стояли
                  «модалки», «мова інтерфейсу» й «мобільна адаптація» — три
                  мітки на одну роботу, які фільтр розводив по різних групах.
                  Datalist показує наявні теми одразу при фокусі: щоб узяти
                  наявну, треба нічого не знати про реєстр, а щоб завести
                  зайву — треба дописати її попри підказку. */}
              <Input
                id={`${fieldId}-theme`}
                list={`${fieldId}-theme-options`}
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                placeholder="інтерфейс"
                maxLength={40}
              />
              <datalist id={`${fieldId}-theme-options`}>
                {KNOWN_THEMES.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
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
                Видно лише власнику й CEO. Для задумів, про які команді знати зарано.
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
