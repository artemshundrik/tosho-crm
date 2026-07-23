import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Префікс `_` — загальноприйнятий маркер «свідомо не використовую»
      // (позиційний параметр, який не можна викинути, не зламавши сигнатуру).
      // Код цю конвенцію вже писав, а конфіг про неї не знав — звідси були
      // 16 помилок на параметрах, які автор навмисно позначив.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'error',

      // --- ГЕЙТ ДИЗАЙН-СИСТЕМИ ---
      // Обидва патерни були вичищені до нуля; правила існують, щоб вони не
      // повернулись. Селектор ловить і прямий рядок у className, і рядки
      // всередині cn(...)/умовних виразів, бо працює по нащадках атрибута.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Хардкод кольору в className. Візьми семантичний токен (bg-warning-soft, text-info-foreground, bg-ai-accent…) або заведи новий у index.css + tailwind.config.js — інакше колір не адаптується до темної теми.',
        },
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/text-\\[(9|10|11)px\\]/]',
          message:
            'Для мікро-типографіки є токени: text-3xs (10px) і text-2xs (11px). Розмір у пікселях повертає нас до п’яти різних «майже однакових» кеглів.',
        },
      ],
    },
  },
])
