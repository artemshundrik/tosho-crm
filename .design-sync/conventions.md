## Як будувати з цієї системи

ToSho CRM — внутрішня CRM українською для друкарні: прорахунки, замовлення,
дизайн-задачі, фінанси. Тексти пиши українською, числа — з нерозривним пробілом
між розрядами й комою в дробовій частині (`48 200,00 ₴`).

### Нічого обгортати не треба

Провайдера немає. Підключив `styles.css` і `_ds_bundle.js` — компоненти працюють.
Тема перемикається класом `dark` на будь-якому предку (зазвичай `<html>`); усі
кольори тягнуться з CSS-змінних, тож обидві теми працюють самі, окремої гілки
писати не треба.

Виняток один: `Toaster` монтується **один раз** на всю сторінку, а повідомлення
шлють через `toast` із `sonner`.

### Ідіома стилів: Tailwind із семантичними токенами

Класи Tailwind, але **ніколи не сирі палітри** (`bg-blue-500`, `text-gray-700`).
Лише семантичні імена — вони самі адаптуються до теми:

| Родина | Класи |
|---|---|
| Поверхні | `bg-background` `bg-card` `bg-muted` `bg-popover` `bg-secondary` |
| Текст | `text-foreground` `text-muted-foreground` `text-card-foreground` |
| Межі | `border-border` (часто `border-border/50` — тонша) |
| Бренд | `bg-primary` `text-primary` `ring-primary` |
| Кегль | `text-3xs` (10px) `text-2xs` (11px) `text-xs` `text-sm` `text-base` `text-lg` |
| Радіус | `rounded-md` `rounded-lg` `rounded-xl` `rounded-2xl` — усі від однієї ручки `--radius` |

**Статуси й тони.** Вісім тонів: `neutral` `info` `accent` `success` `warning`
`danger` `festive` `teal`. У кожного шість форм — бери ту, що відповідає площі:

- `tone-<t>` — насичений бейдж (`tone-info`, `tone-success`)
- `tone-<t>-subtle` — приглушена заливка для широких смуг (`tone-warning-subtle`)
- `tone-text-<t>` — лише колір тексту (`tone-text-danger`)
- `tone-dot-<t>` — крапка-індикатор (`tone-dot-warning`)
- `tone-icon-box-<t>` — квадратик під іконку
- `flag-<t>` — лівий кант 3px, лише для широких рядів (`flag-danger`)

Насиченість мусить падати з площею: бейдж — насичений, банер на всю ширину —
`subtle`. Інакше колір читається як бруд.

Статус завжди несе **і колір, і слово**. Колір сам по собі не є інформацією.

### Глибина: тінь має лише те, що спливає

Система свідомо **пласка**. Картки, поля, кнопки, таблиці, панелі в потоці
сторінки піднімаються межею й фоном, **не тінню**.

Тінь мають рівно п'ять поверхонь, і всі вони спливають над сторінкою:
`shadow-menu` (меню, поповери, підказки), `shadow-elevated-lg` (модальні вікна),
`shadow-elevated-panel` (бічні панелі), `shadow-elevated-preview` (збільшене
зображення), `shadow-overlay` (тости). Компоненти ставлять їх самі — додавати
руками не треба. **Нової тіні не додавай нічому**, що лежить у потоці сторінки.

### Числа

Скрізь, де цифри шикуються в стовпчик — суми, кількості, номери — став
`tabular-nums`, інакше вони стрибають при перерахунку. Суми вирівнюй праворуч.

### Складені компоненти

Багато компонентів — це родина: `Dialog` + `DialogContent` + `DialogHeader` + …
Усі частини є в `window.ToShoCRM`, навіть якщо в списку компонентів окремої
картки не мають. Перелік частин і порядок вкладення — у `.prompt.md` головного
компонента; прочитай його перед тим, як складати.

### Що читати перед версткою

- `styles.css` та її `@import` — усі токени й теми;
- `components/<group>/<Name>/<Name>.prompt.md` — призначення, варіанти, частини,
  правила конкретного компонента;
- `components/<group>/<Name>/<Name>.d.ts` — контракт пропсів.

### Приклад

```jsx
const { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Button } = window.ToShoCRM;

<div className="rounded-2xl border border-border/50 bg-card">
  <div className="flex items-center justify-between gap-3 p-4">
    <h2 className="text-lg font-semibold text-foreground">Прорахунки</h2>
    <Button variant="primary" size="md">Новий прорахунок</Button>
  </div>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Номер</TableHead>
        <TableHead>Замовник</TableHead>
        <TableHead>Статус</TableHead>
        <TableHead className="text-right">Сума, ₴</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium tabular-nums">TS-0826-0009</TableCell>
        <TableCell>ТОВ «Приклад»</TableCell>
        <TableCell><Badge tone="success">Погоджено</Badge></TableCell>
        <TableCell className="text-right tabular-nums">48 200,00</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```
