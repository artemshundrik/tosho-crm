import * as React from "react"
import { Toaster as Sonner } from "sonner"

import { currentResolvedTheme, subscribeToResolvedTheme, type ResolvedTheme } from "@/lib/theme"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // Раніше тут стояло theme="system": тости йшли за налаштуванням ОС, а не за
  // вибором у застосунку. Хто вмикав світлу тему на темній системі, отримував
  // темні тости поверх світлого інтерфейсу. Тепер вони йдуть за тим, що
  // реально намальовано (клас на <html>).
  const [theme, setTheme] = React.useState<ResolvedTheme>(() => currentResolvedTheme())

  React.useEffect(() => subscribeToResolvedTheme(setTheme), [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-foreground group-[.toast]:text-background",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
