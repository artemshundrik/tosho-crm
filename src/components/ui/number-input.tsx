import * as React from "react"

import { Input, type InputControlSize } from "@/components/ui/input"

/**
 * Числове поле для грошей і кількостей.
 *
 * ЧОМУ НЕ `<input type="number">`. Нативне числове поле віддає ПОРОЖНІЙ рядок
 * у `e.target.value`, щойно вміст перестає бути валідним числом — а «1.» на
 * шляху до «1.5» саме такий. У парі з контрольованим `value={state ?? ""}` це
 * означало, що застосунок власноруч затирав уже набране: після крапки поле
 * ставало порожнім, і «1.5» перетворювалось на «5». Кома там же мовчки
 * ігнорується, тож «12,5» ставало «125» — ціна в десять разів більша. І третє:
 * колесо миші над сфокусованим числовим полем крутить значення, тож прокрутка
 * сторінки тихо міняла вартість.
 *
 * `type="text"` + `inputMode="decimal"` знімає всі три разом: браузер нічого не
 * санітизує за нас, нічого не крутить, а роздільник ми розбираємо самі.
 *
 * ЯК ТРИМАЄТЬСЯ ТЕКСТ. Поки поле у фокусі, показуємо чернетку (`draft`) — те,
 * що людина реально набрала. Значення з пропса вертається в поле лише після
 * blur. Саме тому проміжні стани («12.», «0.») переживають перемальовку:
 * батьківський стан оновлюється паралельно, але не переписує рядок під руками.
 *
 * НУЛЬ. Поле з нулем на фокусі стає порожнім — писати можна одразу, стирати
 * нічого не треба. Пішов фокус і нічого не набрали — нуль повертається
 * (`emptyValue`). Тобто порожнє поле більше не перетворюється на нуль мовчки
 * десь на збереженні: людина бачить, що саме збережеться, ще до кнопки.
 */

/** Лишає цифри й один роздільник; кому одразу нормалізує в крапку. */
function sanitizeDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/,/g, ".")
  const [head, ...rest] = cleaned.split(".")
  return rest.length > 0 ? `${head}.${rest.join("")}` : head
}

/** `"12."` → 12, `""` / `"."` → null. Чернетку не міняє. */
function parseDraft(draft: string): number | null {
  const normalized = sanitizeDraft(draft)
  if (normalized === "" || normalized === ".") return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export type NumberInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
> & {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  controlSize?: InputControlSize
  /**
   * Що записати, коли поле лишили порожнім. За замовчуванням 0 — і саме його
   * видно в полі після blur. Для кількості тиражу тут 1, бо нуль там не має
   * сенсу і все одно був би підтягнутий на збереженні.
   */
  emptyValue?: number | null
  min?: number
  max?: number
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { value, onValueChange, emptyValue = 0, min, max, onFocus, onBlur, ...props },
    ref
  ) => {
    // null = поле не редагують, показуємо значення з пропса.
    const [draft, setDraft] = React.useState<string | null>(null)

    const clamp = React.useCallback(
      (next: number) => {
        let result = next
        if (typeof min === "number") result = Math.max(min, result)
        if (typeof max === "number") result = Math.min(max, result)
        return result
      },
      [min, max]
    )

    const handleFocus = React.useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        // Нуль (і порожнеча) не мають пережити постановку курсора: людина
        // прийшла сюди писати, а не стирати службовий нуль.
        setDraft(value === null || value === undefined || value === 0 ? "" : String(value))
        onFocus?.(event)
      },
      [onFocus, value]
    )

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = sanitizeDraft(event.target.value)
        setDraft(next)
        // Підсумки (собівартість, ціна продажу) рахуються з батьківського стану
        // й мають лишатись живими під час набору — тому значення віддаємо
        // одразу. Безпечно саме тому, що в полі показуємо чернетку, а не пропс.
        //
        // Ані `emptyValue`, ані меж тут свідомо не застосовуємо: на півдорозі до
        // «10» стоїть «1», а до «0.5» — «0», і підправляти людину під час набору
        // означало б знову міняти цифри під руками. Обидва правила спрацюють на
        // blur, коли набір завершено.
        onValueChange(parseDraft(next))
      },
      [onValueChange]
    )

    const handleBlur = React.useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        const parsed = parseDraft(draft ?? "")
        onValueChange(parsed === null ? emptyValue : clamp(parsed))
        setDraft(null)
        onBlur?.(event)
      },
      [clamp, draft, emptyValue, onBlur, onValueChange]
    )

    const displayed = draft !== null ? draft : value === null || value === undefined ? "" : String(value)

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={displayed}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }
