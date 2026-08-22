import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge не знає про кастомні ключі з tailwind.config.js, тож без
// реєстрації "duration-base" і споживацький "duration-300" він вважає різними
// класами й лишає обидва — переможця вирішує порядок у зібраному CSS (лотерея).
// Те саме з тінями: і вся кастомна шкала (elevated/card/menu/glow)
// поза дефолтною групою shadow, тож конфлікт двох однаково-модифікованих
// shadow-класів не зливався. CSS все одно застосує лиш один box-shadow —
// реєстрація робить переможця детермінованим (останній, як і скрізь у cn).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      duration: [{ duration: ["fast", "base", "slow"] }],
      ease: [{ ease: ["smooth"] }],
      shadow: [
        {
          shadow: [
            "inner",
            "card",
            "surface",
            "floating",
            "overlay",
            "menu",
            "elevated-sm",
            "elevated-md",
            "elevated-lg",
            "elevated-preview",
            "elevated-panel",
            "success-glow",
            "warning-glow",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
