import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full appearance-none overflow-y-auto rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "transition-colors duration-150",
        "hover:border-foreground/30 hover:bg-muted/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/60",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
