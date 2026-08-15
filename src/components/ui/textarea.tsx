import * as React from "react"

import { cn } from "@/lib/utils"
import { TEXTAREA_BASE } from "@/components/ui/controlStyles"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        TEXTAREA_BASE,
        // Смуга прокрутки прихована: поле й так росте, а системна смуга різала
        // праве поле тексту.
        "min-h-[60px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
