/**
 * Генератор довідок для дизайн-системи: групи + «Usage notes for Claude».
 *
 * НАВІЩО. Конвертер /design-sync бере групу картки з frontmatter `category`
 * у per-component доці, а текст довідки — з тієї ж доки. Без них усі 134
 * компоненти лягли в одну групу `general`, а нотатки звелись до рядка
 * «Button from tosho-crm» — тобто агент дизайну не знає ні про варіанти,
 * ні про складові.
 *
 * ЩО ТУТ Є І ЧОГО НЕМАЄ. Тут КУРОВАНИЙ список: справжні компоненти, які людина
 * бере й ставить. Їхні частини (DialogContent, TableCell, SelectItem…) у список
 * карток не входять — у конфігу вони позначені `null`. Це НЕ прибирає їх із
 * бандла: `window.ToShoCRM.DialogContent` лишається, і агент ним користується.
 * Прибирається лише картка, бо картка «DialogFooter» без «Dialog» — це шум.
 * Тому кожна доця складеного компонента ПЕРЕЛІЧУЄ свої частини: інакше агент
 * про них не дізнається.
 *
 * ГОЧА: назви груп ТІЛЬКИ латиницею. Конвертер слагифікує `category` як
 * `toLowerCase().replace(/[^a-z0-9]+/g, '-')` — кирилиця дає порожній рядок,
 * і категорія мовчки не застосовується (усе лягає в одну групу `general`).
 * Перевірено 22.08.2026: «Дії» → "" → група не змінилась.
 *
 * Запуск: node .design-sync/make-docs.mjs
 * Далі:   перезібрати конвертером — доки читаються з cfg.docsDir.
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "docs");

/** [Ім'я, Група, Опис, Частини?] */
const DOCS = [
  // ── Дії → Actions ──────────────────────────────────────────────────────────────
  ["Button", "Actions",
    "Основна кнопка. `variant` задає вагу й колір, `size` — висоту, кегль і розмір іконки.\n\n" +
    "Варіанти: `primary` (одна головна дія на екран), `secondary`, `outline`, `ghost` (щільні ряди й тулбари), " +
    "`destructive` (м'яке видалення) і `destructiveSolid` (незворотне), `successTonal` (підтвердження), " +
    "`link`, `textMuted`, `textPrimary`, `segmented` (для SegmentedGroup, стан через `aria-pressed`), " +
    "`chip` (фільтр-пігулка, теж `aria-pressed`), `control`/`controlDestructive` (іконка в тулбарі), `menu`, `card`.\n\n" +
    "Розміри: `xxs` `xs` `sm` `md` (типовий) `lg`; лише іконка — `iconXs` `iconSm` `iconMd` `icon`.\n\n" +
    "Іконку передавай дитиною — розмір і відступ вона отримає від `size`, класи їй ставити не треба. " +
    "`loading` показує спінер на місці провідної іконки, ширина кнопки не змінюється. " +
    "`disabled` малює справжній заблокований вигляд на спільних `--control-*` токенах, а не прозорість."],
  ["Chip", "Actions",
    "Пасивна пігулка-мітка з іконкою. `icon` — вузол зліва, `active` — увімкнений стан " +
    "(темнішає нейтрально, не синіє), `size`: `sm` | `md`.\n\n" +
    "Для ФІЛЬТРА бери не Chip, а `Button variant=\"chip\"` з `aria-pressed` — він тримає стан."],
  ["SegmentedGroup", "Actions",
    "Сегментований перемикач із плашкою, що ковзає між кнопками. Всередину клади " +
    "`Button variant=\"segmented\"` з `aria-pressed` і `data-state=\"on\"` на активному.\n\n" +
    "Готові набори класів — `SEGMENTED_GROUP` / `SEGMENTED_TRIGGER` (великий) і " +
    "`SEGMENTED_GROUP_SM` / `SEGMENTED_TRIGGER_SM` (малий)."],
  ["ToggleGroup", "Actions", "Група перемикачів на Radix. Елемент — `ToggleGroupItem`.", ["ToggleGroupItem"]],

  // ── Поля → Fields ─────────────────────────────────────────────────────────────
  ["Input", "Fields",
    "Однорядкове поле. Розмір — пропом `controlSize`: `sm` (h-8) | `md` (h-9) | `lg` (h-10, типовий). " +
    "Саме `controlSize`, а не `size`: у `<input>` `size` — нативний числовий атрибут.\n\n" +
    "Помилку показуй через `aria-invalid`, а не клас: атрибут одночасно повідомляє читача з екрана. " +
    "Зазвичай не сам по собі, а всередині `FormField`."],
  ["Textarea", "Fields", "Багаторядкове поле на тій самій поверхні, що `Input`."],
  ["AutoTextarea", "Fields", "Багаторядкове поле, що росте під вміст."],
  ["FormField", "Fields",
    "Обгортка поля: підпис, зірочка обов'язковості, текст помилки або підказки — і зв'язування їх " +
    "з полем через `id` та `aria-describedby`.\n\n" +
    "`children` приймає або елемент (пропси домішуються самі), або функцію " +
    "`({ id, invalid, fieldProps }) => …` — другий варіант потрібен для Radix-контролів на кшталт `Select`."],
  ["Label", "Fields", "Підпис поля. Зазвичай його ставить `FormField` — окремо потрібен рідко."],
  ["NumberInput", "Fields", "Числове поле з форматуванням."],
  ["PhoneInput", "Fields", "Український телефон із маскою."],
  ["PhoneListInput", "Fields", "Список телефонів: додавання й видалення рядків."],
  ["EmailInput", "Fields", "Пошта з перевіркою формату."],
  ["PasswordInput", "Fields", "Пароль із перемикачем видимості."],
  ["TelegramInput", "Fields", "Нік у Telegram із нормалізацією `@`."],
  ["DigitsInput", "Fields", "Поле лише для цифр (коди, ЄДРПОУ)."],
  ["IconInput", "Fields", "Поле з іконкою всередині."],
  ["PrefixField", "Fields", "Поле зі сталим префіксом ліворуч."],
  ["TagsInput", "Fields", "Введення набору міток."],

  // ── Вибір → Choice ────────────────────────────────────────────────────────────
  ["Select", "Choice",
    "Випадний список на Radix у тому ж корпусі, що й поле.\n\n" +
    "Складові: `SelectTrigger` (розмір `sm`|`md`|`lg`), `SelectValue` (з `placeholder`), " +
    "`SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`.",
    ["SelectTrigger", "SelectValue", "SelectContent", "SelectItem", "SelectGroup", "SelectLabel", "SelectSeparator"]],
  ["Checkbox", "Choice", "Прапорець на Radix. Увімкнений — кольором бренду."],
  ["Switch", "Choice",
    "Перемикач. Керований: `checked` + `onCheckedChange`, обов'язковий `label` для читача з екрана. " +
    "`size`: `sm`|`md`, `tone`: `primary`|`success`."],
  ["Calendar", "Choice", "Календар вибору дати."],
  ["DateInput", "Choice",
    "Поле дати з нативним пікером. Бери саме його, а не голий `input[type=date]`: " +
    "системна іконка календаря глобально схована в `index.css`."],
  ["DateTimeInput", "Choice", "Дата й час однією панеллю вибору."],
  ["TimeInput", "Choice", "Час."],
  ["DateQuickActions", "Choice", "Швидкі кнопки біля календаря: сьогодні, завтра, тиждень."],

  // ── Спливні шари → Overlays ─────────────────────────────────────────────────────
  ["Dialog", "Overlays",
    "Модальне вікно. Тінь `shadow-elevated-lg` — тінь у системі має ЛИШЕ те, що спливає над сторінкою.\n\n" +
    "Складові: `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, " +
    "`DialogFooter`, `DialogClose`.\n\n" +
    "`DialogContent` приймає `isDirty` — тоді закриття кліком повз питає підтвердження; " +
    "`dismissible` навпаки прибирає це питання для переглядів, де втрачати нема чого.",
    ["DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter", "DialogClose", "DialogOverlay", "DialogPortal"]],
  ["AlertDialog", "Overlays",
    "Вікно підтвердження незворотної дії. Складові: `AlertDialogTrigger`, `AlertDialogContent`, " +
    "`AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, " +
    "`AlertDialogAction`, `AlertDialogCancel`.",
    ["AlertDialogTrigger", "AlertDialogContent", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogAction", "AlertDialogCancel", "AlertDialogOverlay", "AlertDialogPortal"]],
  ["Sheet", "Overlays",
    "Бічна панель. `SheetContent` має `side`: `right` (типово) | `left` | `top` | `bottom`; " +
    "прокручується лише `SheetBody`. Тінь `shadow-elevated-panel`.\n\n" +
    "Складові: `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetBody`, `SheetFooter`, `SheetClose`.",
    ["SheetTrigger", "SheetContent", "SheetHeader", "SheetTitle", "SheetDescription", "SheetBody", "SheetFooter", "SheetClose", "SheetOverlay", "SheetPortal"]],
  ["Popover", "Overlays",
    "Поповер для фільтрів і довільного вмісту. Складові: `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`.",
    ["PopoverTrigger", "PopoverContent", "PopoverAnchor"]],
  ["DropdownMenu", "Overlays",
    "Випадне меню. Небезпечну дію став окремо, після роздільника, через `DropdownMenuItemDestructive`.\n\n" +
    "Складові: `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuItemDestructive`, " +
    "`DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`/`DropdownMenuRadioItem`, `DropdownMenuLabel`, " +
    "`DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub`/`DropdownMenuSubTrigger`/`DropdownMenuSubContent`.\n\n" +
    "Роздільник тягни на всю ширину: контейнер має `p-1.5`, тож лінії потрібен `-mx-1.5`.",
    ["DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuItemDestructive", "DropdownMenuCheckboxItem", "DropdownMenuRadioGroup", "DropdownMenuRadioItem", "DropdownMenuLabel", "DropdownMenuSeparator", "DropdownMenuShortcut", "DropdownMenuSub", "DropdownMenuSubTrigger", "DropdownMenuSubContent", "DropdownMenuGroup", "DropdownMenuPortal"]],
  ["HoverTip", "Overlays",
    "Підказка при наведенні. `label` — вміст бульбашки, `children` — тригер, `side` — бік. " +
    "`ready={false}` затримує відкриття, поки вміст вантажиться, щоб бульбашка не «стрибала»."],
  ["Command", "Overlays",
    "Командна палета (cmdk). Складові: `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, " +
    "`CommandItem`, `CommandSeparator`, `CommandShortcut`. У вікні — `CommandDialog`.",
    ["CommandInput", "CommandList", "CommandEmpty", "CommandGroup", "CommandItem", "CommandSeparator", "CommandShortcut", "CommandDialog"]],
  ["Toaster", "Overlays",
    "Тости (sonner). Монтується один раз глобально; повідомлення шли через `toast.success(...)` / `toast.error(...)` з `sonner`."],

  // ── Показ даних → Data ──────────────────────────────────────────────────────
  ["Badge", "Data",
    "Статус-бейдж. Головний проп — `tone`: `neutral` `info` `accent` `success` `warning` `danger` `festive` `destructive`. " +
    "Тон бери з `statusTones.ts` (`QUOTE_STATUS_TONE`, `DESIGN_STATUS_TONE`), не вигадуй відповідність сам.\n\n" +
    "`size`: `sm` (робочий — списки, канбан) | `md` (акцентний — тулбари). `pill` додає капс і трекінг.\n\n" +
    "Статус завжди несе І колір, І слово: колір сам по собі не є інформацією."],
  ["Table", "Data",
    "Таблиця. Числа — праворуч і з `tabular-nums`, інакше суми стрибають при перерахунку.\n\n" +
    "ВКЛАДЕНІСТЬ ВАЖЛИВА: усі заголовки — це `TableHead` В ОДНОМУ `TableRow` всередині `TableHeader`. " +
    "Якщо покласти кожен заголовок в окремий `TableRow`, шапка розповзеться на кілька рядків і перестане " +
    "стояти над своїми колонками.\n\n" +
    "```jsx\n" +
    "<Table>\n" +
    "  <TableHeader>\n" +
    "    <TableRow>\n" +
    "      <TableHead>Номер</TableHead>\n" +
    "      <TableHead>Замовник</TableHead>\n" +
    "      <TableHead className=\"text-right\">Сума, ₴</TableHead>\n" +
    "    </TableRow>\n" +
    "  </TableHeader>\n" +
    "  <TableBody>\n" +
    "    <TableRow>\n" +
    "      <TableCell className=\"tabular-nums\">TS-0826-0009</TableCell>\n" +
    "      <TableCell>ТОВ «Приклад»</TableCell>\n" +
    "      <TableCell className=\"text-right tabular-nums\">48 200,00</TableCell>\n" +
    "    </TableRow>\n" +
    "  </TableBody>\n" +
    "</Table>\n" +
    "```",
    ["TableHeader", "TableBody", "TableRow", "TableHead", "TableCell", "TableFooter", "TableCaption"]],
  ["Card", "Data",
    "Картка-контейнер. Складові: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.\n\n" +
    "Тіні НЕ має: глибина в системі лише у спливних шарів, поверхні в потоці сторінки піднімаються межею й фоном.",
    ["CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"]],
  ["Avatar", "Data",
    "Примітив аватарки на Radix (`AvatarImage`, `AvatarFallback`).\n\n" +
    "Для ЛЮДЕЙ і ЗАМОВНИКІВ бери не його, а `AvatarBase` та `EntityAvatar` — вони в бандлі й уміють тони, " +
    "статус присутності та запасні ініціали.",
    ["AvatarImage", "AvatarFallback"]],
  ["Skeleton", "Data",
    "Каркас завантаження. Розміри мають повторювати справжній вміст, інакше сторінка стрибне, коли дані прийдуть."],
  ["EmptyStateCard", "Data",
    "Порожній стан: `badgeLabel`, `title`, `description` і дія — `actionLabel` + `onAction` або `actionTo`. " +
    "Пояснює причину й пропонує вихід, а не просто каже «немає даних»."],
  ["Separator", "Data", "Роздільник."],
  ["Alert", "Data", "Блок повідомлення. Складові: `AlertTitle`, `AlertDescription`.", ["AlertTitle", "AlertDescription"]],
  ["Tabs", "Data", "Вкладки на Radix. Складові: `TabsList`, `TabsTrigger`, `TabsContent`.", ["TabsList", "TabsTrigger", "TabsContent"]],
  ["HoverCopyText", "Data",
    "Текст, що копіюється при наведенні — номери прорахунків, замовлень, запитів. " +
    "`value` — що копіювати, `successMessage` — текст тоста, `copyLabel` — підпис кнопки."],

  // ── Особливе → Utilities ─────────────────────────────────────────────────────────
  ["DictationButton", "Utilities", "Кнопка диктування голосом у поле."],
  ["DictationCapsule", "Utilities", "Смуга стану диктування: запис, розпізнавання, помилка."],
  ["UnsavedChangesPrompt", "Utilities",
    "Питання «закрити без збереження?». Вікна й панелі вмикають його самі через `isDirty` — окремо потрібне рідко.",
    ["UnsavedGuardListener"]],
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const kept = new Set(DOCS.map(([n]) => n));
const parts = new Set(DOCS.flatMap(([, , , p]) => p ?? []));

for (const [name, group, body] of DOCS) {
  writeFileSync(
    path.join(OUT, `${name}.md`),
    `---\ncategory: ${group}\n---\n\n${body}\n`
  );
}

console.log(`доків: ${kept.size}, груп: ${new Set(DOCS.map((d) => d[1])).size}`);
console.log(`частин, які підуть у null: ${parts.size}`);

// Звірка з конфігом: у `componentSrcMap` мають бути `null` для всього, що НЕ
// в цьому списку. Сам список звідси НЕ переписуємо — після першої ж вдалої
// збірки в ds-bundle лишаються тільки 48 куратованих, і обчислити виключення
// з нього вже неможливо (вийде порожньо й конфіг обнулиться).
const cfgPath = path.join(HERE, "config.json");
if (existsSync(cfgPath)) {
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const nulled = new Set(Object.entries(cfg.componentSrcMap ?? {}).filter(([, v]) => v === null).map(([k]) => k));
  const clash = [...kept].filter((n) => nulled.has(n));
  const missing = [...parts].filter((n) => !nulled.has(n));
  if (clash.length) console.error(`! ці є в доках, але виключені в конфігу: ${clash.join(", ")}`);
  if (missing.length) console.error(`! ці згадані як частини, але НЕ виключені: ${missing.join(", ")}`);
  if (!clash.length && !missing.length) console.log("конфіг звірено: виключення збігаються з доками");
}
