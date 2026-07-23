/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      container: {
        center: true,
        padding: "2rem",
        screens: {
          "2xl": "1400px",
        },
      },
      extend: {
        fontFamily: {
          sans: ["Inter", "sans-serif"],
        },
        colors: {
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: {
            DEFAULT: "hsl(var(--primary))",
            foreground: "hsl(var(--primary-foreground))",
          },
          secondary: {
            DEFAULT: "hsl(var(--secondary))",
            foreground: "hsl(var(--secondary-foreground))",
          },
          destructive: {
            DEFAULT: "hsl(var(--destructive))",
            foreground: "hsl(var(--destructive-foreground))",
          },
          muted: {
            DEFAULT: "hsl(var(--muted))",
            foreground: "hsl(var(--muted-foreground))",
          },
          accent: {
            DEFAULT: "hsl(var(--accent))",
            foreground: "hsl(var(--accent-foreground))",
          },
          popover: {
            DEFAULT: "hsl(var(--popover))",
            foreground: "hsl(var(--popover-foreground))",
          },
          card: {
            DEFAULT: "hsl(var(--card))",
            foreground: "hsl(var(--card-foreground))",
          },
          // Семантичні тони як повноцінні кольори. DEFAULT = насичений
          // «foreground»-відтінок (bg-success/5, border-warning/40), а soft /
          // soft-border / foreground закривають повний набір бейджів і банерів.
          // Раніше ці три рівні були рукописними утилітами в index.css — разом з
          // ручною генерацією кожного /10 /15 /40… кроку непрозорості. Тепер їх
          // видає сам Tailwind, тож будь-яка непрозорість доступна безкоштовно.
          neutral: {
            soft: "hsl(var(--neutral-soft))",
            "soft-border": "hsl(var(--neutral-soft-border))",
            foreground: "hsl(var(--neutral-foreground))",
          },
          success: {
            DEFAULT: "hsl(var(--success-foreground))",
            soft: "hsl(var(--success-soft))",
            "soft-border": "hsl(var(--success-soft-border))",
            foreground: "hsl(var(--success-foreground))",
          },
          warning: {
            DEFAULT: "hsl(var(--warning-foreground))",
            soft: "hsl(var(--warning-soft))",
            "soft-border": "hsl(var(--warning-soft-border))",
            foreground: "hsl(var(--warning-foreground))",
            copy: "hsl(var(--warning-copy-foreground))",
          },
          info: {
            DEFAULT: "hsl(var(--info-foreground))",
            soft: "hsl(var(--info-soft))",
            "soft-border": "hsl(var(--info-soft-border))",
            foreground: "hsl(var(--info-foreground))",
          },
          danger: {
            DEFAULT: "hsl(var(--danger-foreground))",
            soft: "hsl(var(--danger-soft))",
            "soft-border": "hsl(var(--danger-soft-border))",
            foreground: "hsl(var(--danger-foreground))",
          },
          "accent-tone": {
            DEFAULT: "hsl(var(--accent-tone-foreground))",
            soft: "hsl(var(--accent-tone-soft))",
            "soft-border": "hsl(var(--accent-tone-soft-border))",
            foreground: "hsl(var(--accent-tone-foreground))",
          },
          // Акцент ToSho AI — власний бренд-колір модуля, окремий від --brand-h.
          "ai-accent": "hsl(var(--ai-accent))",
          // Категоріальна палітра графіків. Тільки для даних, де колір означає
          // ІДЕНТИЧНІСТЬ. Стан (прострочено/оплачено) — це семантичні тони.
          chart: {
            1: "hsl(var(--chart-1))",
            2: "hsl(var(--chart-2))",
            3: "hsl(var(--chart-3))",
            4: "hsl(var(--chart-4))",
            5: "hsl(var(--chart-5))",
            6: "hsl(var(--chart-6))",
            7: "hsl(var(--chart-7))",
            8: "hsl(var(--chart-8))",
          },
          // Рейтингова зірка — окрема семантика, не warning: жовтогарячий
          // warning-foreground у світлій темі надто темний для зірки.
          star: "hsl(var(--star))",
        },
        boxShadow: {
          // Уся шкала глибини — з токенів index.css (світла/темна теми).
          // Без цієї реєстрації код був змушений писати shadow-[var(--shadow-*)].
          card: "var(--shadow-card)",
          surface: "var(--shadow-surface)",
          floating: "var(--shadow-floating)",
          overlay: "var(--shadow-overlay)",
          menu: "var(--shadow-menu)",
          "elevated-sm": "var(--shadow-elevated-sm)",
          "elevated-md": "var(--shadow-elevated-md)",
          "elevated-lg": "var(--shadow-elevated-lg)",
          "elevated-preview": "var(--shadow-elevated-preview)",
          "elevated-panel": "var(--shadow-elevated-panel)",
          "success-glow": "var(--shadow-success-glow)",
          "warning-glow": "var(--shadow-warning-glow)",
        },
        borderRadius: {
          lg: "var(--radius)",
          md: "calc(var(--radius) - 2px)",
          sm: "calc(var(--radius) - 4px)",
          xl: "calc(var(--radius) + 4px)",
          "2xl": "calc(var(--radius) + 8px)",
          "3xl": "calc(var(--radius) + 12px)",
          "4xl": "calc(var(--radius) + 14px)",
          // Композитні радіуси секцій/вкладених блоків — теж на ручці --radius.
          section: "var(--radius-section)",
          inner: "var(--radius-inner)",
        },
        fontSize: {
          // Мікро-типографіка. НАВМИСНО без line-height: ці розміри проставлялись
          // як text-[11px]/text-[10px] (arbitrary — не задає leading), і сотні
          // місць покладаються на успадкований інтерліньяж. Токен = чиста заміна.
          "2xs": "0.6875rem", // 11px — допоміжний текст, мета, бейджі
          "3xs": "0.625rem", // 10px — щільні підписи, лічильники
        },
        letterSpacing: {
          // Дві канонічні щільності caps-ярликів замість п'яти arbitrary-значень.
          caps: "0.14em",
          "caps-tight": "0.08em",
        },
        zIndex: {
          // Шкала шарів. Значення = ті ж числа, що вже стояли в z-[NN],
          // тільки з іменами — щоб новий шар не додавали «на око».
          base: "1", // локальний підйом усередині компонента
          dropdown: "50", // радікс-меню, селекти, поповери
          docked: "55", // плаваючі дії, що мусять лишатись ПІД таб-баром
          floating: "60", // таб-бар, віджет таймера
          overlay: "80", // повноекранні sheet/шторки
          preview: "90", // hover-прев'ю зображень
          tooltip: "100", // підказки сайдбару — завжди зверху
        },
        keyframes: {
          "accordion-down": {
            from: { height: "0" },
            to: { height: "var(--radix-accordion-content-height)" },
          },
          "accordion-up": {
            from: { height: "var(--radix-accordion-content-height)" },
            to: { height: "0" },
          },
          // 👇 Додана анімація "shine"
          shine: {
            "0%": { left: "-100%" },
            "100%": { left: "125%" },
          },
          "fifa-shine": {
            "0%": { transform: "translateX(-140%) skewX(-25deg)" },
            "100%": { transform: "translateX(140%) skewX(-25deg)" },
          },
        },
        animation: {
          "accordion-down": "accordion-down 0.2s ease-out",
          "accordion-up": "accordion-up 0.2s ease-out",
          // 👇 Додана анімація "shine"
          shine: "shine 0.7s",
          "fifa-shine": "fifa-shine 0.9s ease-out",
        },
      },
    },
    plugins: [require("tailwindcss-animate")],
  }
