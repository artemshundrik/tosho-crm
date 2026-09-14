import * as React from "react"

import { cn } from "@/lib/utils"
import { CONTROL_BASE } from "@/components/ui/controlStyles"

/**
 * Розмір задає ЛИШЕ висоту й відступи. Радіус — роль «контрол» (rounded-lg) у
 * CONTROL_BASE, однаковий для всіх розмірів (REQ-271#p8): раніше радіус ішов за
 * розміром, і сторінка, що стискала поле класом h-9, отримувала 36px із кутом 12
 * поруч із таким самим полем з кутом 8. sm/md — висота зі змінної (28/32 на
 * десктопі, 36/40 на телефоні).
 *
 * Прикладне ім'я `controlSize`, а не `size`: у <input> size — це нативний
 * числовий атрибут, і перевизначати його типом не можна.
 */
const INPUT_SIZE = {
  sm: "h-(--control-h-sm) px-2.5 py-1 text-xs",
  md: "h-(--control-h) px-3 py-1.5 text-sm",
  lg: "h-10 px-3 py-2 text-sm",
} as const

export type InputControlSize = keyof typeof INPUT_SIZE

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { controlSize?: InputControlSize }
>(({ className, type, controlSize = "md", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        CONTROL_BASE,
        // Без тіні: `` — дефолт Tailwind із shadcn-заготовки, повз наші
        // токени (--shadow-card / --shadow-menu / --shadow-elevated-*). Поле
        // відділяє від фону межа, а не підйом; усередині поповера це взагалі
        // читалось як бруд — тінь на тіні, бо панель уже має
        "w-full",
        INPUT_SIZE[controlSize],
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
