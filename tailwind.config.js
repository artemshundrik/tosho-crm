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
          // "Inter Variable" — ім'я родини з @fontsource-variable/inter;
          // "Inter" лишається фолбеком для середовищ зі встановленим локально.
          sans: ["Inter Variable", "Inter", "sans-serif"],
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
            // Яскрава суцільна заливка без тексту (крапки/смужки/індикатори).
            // НЕ для тексту й не для кнопки з написом — там потрібен foreground.
            solid: "hsl(var(--success-solid))",
          },
          warning: {
            DEFAULT: "hsl(var(--warning-foreground))",
            soft: "hsl(var(--warning-soft))",
            "soft-border": "hsl(var(--warning-soft-border))",
            foreground: "hsl(var(--warning-foreground))",
            copy: "hsl(var(--warning-copy-foreground))",
            solid: "hsl(var(--warning-solid))",
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
          festive: {
            DEFAULT: "hsl(var(--festive-foreground))",
            soft: "hsl(var(--festive-soft))",
            "soft-border": "hsl(var(--festive-soft-border))",
            foreground: "hsl(var(--festive-foreground))",
          },
          teal: {
            DEFAULT: "hsl(var(--teal-foreground))",
            soft: "hsl(var(--teal-soft))",
            "soft-border": "hsl(var(--teal-soft-border))",
            foreground: "hsl(var(--teal-foreground))",
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
          // Заблокований стан контролів (REQ-48): одна трійка на кнопку І поля,
          // щоб disabled-поле і disabled-кнопка поруч виглядали однаково.
          "control-disabled": {
            DEFAULT: "hsl(var(--control-disabled-bg))",
            fg: "hsl(var(--control-disabled-fg))",
            border: "hsl(var(--control-disabled-border))",
          },
          // Увімкнений тулбарний контрол (фільтр/групування) — теж на токенах,
          // бо непрозорість не тримала стан помітним у темній темі.
          "control-active": {
            DEFAULT: "hsl(var(--control-active-bg))",
            border: "hsl(var(--control-active-border))",
          },
        },
        boxShadow: {
          // Уся шкала глибини — з токенів index.css (світла/темна теми).
          // Без цієї реєстрації код був змушений писати shadow-[var(--shadow-*)].
          overlay: "var(--shadow-overlay)",
          menu: "var(--shadow-menu)",
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
        // Моушен-токени (REQ-48): три тривалості й одна крива замість шести
        // сирих duration-* і inline cubic-bezier по базі. Хвиля 1 лише заводить
        // джерело й споживає його в кнопці; змітання решти — Хвиля 3.
        transitionDuration: {
          fast: "110ms", // натиск — коротший за відпускання
          base: "160ms", // стандартний перехід станів
          slow: "240ms", // розгортання, поява панелей
        },
        transitionTimingFunction: {
          // Пружне виринання; свідомо перекриває дефолтний ease-out Tailwind,
          // щоб уся база перейшла на одну криву без правок по місцях.
          out: "cubic-bezier(.32,.72,0,1)",
          // Старий м'який ease-out — для ДОВГИХ фейдів (400ms+): пружна крива
          // на них досягає ~90% за третину часу й читається як «ляск».
          smooth: "cubic-bezier(0, 0, 0.2, 1)",
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
          // Блиск по пігулці ToSho AI. Довга пауза всередині кадрів, а не
          // короткий цикл: смуга пробігає приблизно за 1.3 с, решту часу стоїть
          // за межами — інакше шапка блимала б безперервно й тягнула око.
          // Хід із запасом за обидва краї: смуга широка, і якщо починати з
          // -100%, її протилежний край видно в пігулці ще до початку руху.
          // Смуга завширшки з саму пігулку, тож відсотки тут = ширина пігулки:
          // -110% ставить її повністю за лівим краєм, 110% — повністю за правим.
          // Заміряно: з удвічі вужчою смугою рух обривався, коли вона ще стояла
          // всередині кнопки, і блиск зникав стрибком посередині.
          "ai-shimmer": {
            "0%, 88%": { transform: "translateX(-110%)" },
            "100%": { transform: "translateX(110%)" },
          },
          // Мала іскра підморгує в ту саму мить, коли проходить блиск.
          "ai-spark": {
            "0%, 84%, 100%": { opacity: "1" },
            "90%": { opacity: "0.35" },
            "95%": { opacity: "1" },
          },
        },
        animation: {
          "accordion-down": "accordion-down 0.2s ease-out",
          "accordion-up": "accordion-up 0.2s ease-out",
          // 👇 Додана анімація "shine"
          shine: "shine 0.7s",
          "fifa-shine": "fifa-shine 0.9s ease-out",
          // Рух займає останні 12% циклу — приблизно 0.7 с на прохід, решта пауза.
          "ai-shimmer": "ai-shimmer 6s cubic-bezier(.3,.5,.2,1) infinite",
          "ai-spark": "ai-spark 6s ease-in-out infinite",
        },
      },
    },
    plugins: [require("tailwindcss-animate")],
  }
