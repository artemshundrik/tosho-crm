import * as React from "react"

import { cn } from "@/lib/utils"
import { CONTROL_BASE } from "@/components/ui/controlStyles"

/**
 * Радіус іде за висотою контролу — так само, як у Button (sm: h-8 rounded-md,
 * md: h-9 rounded-lg). CONTROL_BASE несе єдиний rounded-xl, розрахований на
 * висоту 40px; на полі 32px той самий радіус виглядає «таблеткою».
 *
 * Прикладне ім'я `controlSize`, а не `size`: у <input> size — це нативний
 * числовий атрибут, і перевизначати його типом не можна.
 */
const INPUT_SIZE = {
  sm: "h-8 rounded-md px-2.5 py-1 text-xs",
  md: "h-9 rounded-lg px-3 py-1.5 text-sm",
  lg: "h-10 rounded-xl px-3 py-2 text-sm",
} as const

export type InputControlSize = keyof typeof INPUT_SIZE

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { controlSize?: InputControlSize }
>(({ className, type, controlSize = "lg", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        CONTROL_BASE,
        "w-full shadow-sm",
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
