// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot

import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = {
  "generatedAt": "2026-08-23T17:48:05.415Z",
  "packages": [
    {
      "name": "@eslint/js",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=eslint.org&sz=128"
    },
    {
      "name": "@fontsource-variable/inter",
      "version": "5.3.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-07-24T00:51:50+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=fontsource.org&sz=128"
    },
    {
      "name": "@radix-ui/react-alert-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-avatar",
      "version": "1.2.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-checkbox",
      "version": "1.3.11",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-dropdown-menu",
      "version": "2.1.24",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-label",
      "version": "2.1.15",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-popover",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-select",
      "version": "2.3.7",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-separator",
      "version": "1.1.15",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-slot",
      "version": "1.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-switch",
      "version": "1.3.7",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-tabs",
      "version": "1.1.21",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@react-pdf/renderer",
      "version": "4.7.0",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://github.com/diegomura.png?size=64"
    },
    {
      "name": "@supabase/supabase-js",
      "version": "2.112.3",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T19:46:50+03:00",
      "iconUrl": "https://github.com/supabase.png?size=64"
    },
    {
      "name": "@tailwindcss/vite",
      "version": "4.1.18",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tailwindcss.com&sz=128"
    },
    {
      "name": "@tanstack/react-query",
      "version": "5.102.1",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@tanstack/react-virtual",
      "version": "3.14.10",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-21T12:32:46+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@tiptap/extension-link",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/extension-underline",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/react",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/starter-kit",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@types/node",
      "version": "24.10.3",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64",
      "pinned": {
        "to": "node",
        "why": "мажор має збігатися з Node, інакше типи описують API, якого в рантаймі немає"
      }
    },
    {
      "name": "@types/react",
      "version": "19.2.18",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/react-dom",
      "version": "19.2.4",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/web-push",
      "version": "3.6.4",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-07-25T18:16:21+03:00",
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@vitejs/plugin-react",
      "version": "5.1.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/vitejs.png?size=64"
    },
    {
      "name": "babel-plugin-react-compiler",
      "version": "1.0.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T12:03:25+03:00",
      "iconUrl": "https://github.com/facebook.png?size=64"
    },
    {
      "name": "class-variance-authority",
      "version": "0.7.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/joe-bell.png?size=64"
    },
    {
      "name": "clsx",
      "version": "2.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/lukeed.png?size=64"
    },
    {
      "name": "cmdk",
      "version": "1.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/pacocoursey.png?size=64"
    },
    {
      "name": "date-fns",
      "version": "3.6.0",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/date-fns.png?size=64"
    },
    {
      "name": "dompurify",
      "version": "3.4.14",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://github.com/cure53.png?size=64"
    },
    {
      "name": "eslint",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=eslint.org&sz=128"
    },
    {
      "name": "eslint-plugin-react-hooks",
      "version": "7.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "eslint-plugin-react-refresh",
      "version": "0.4.24",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": null
    },
    {
      "name": "globals",
      "version": "16.5.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://github.com/sindresorhus.png?size=64"
    },
    {
      "name": "jsdom",
      "version": "29.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-08T00:42:10+03:00",
      "iconUrl": "https://github.com/jsdom.png?size=64"
    },
    {
      "name": "lucide-react",
      "version": "0.560.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=lucide.dev&sz=128"
    },
    {
      "name": "netlify-cli",
      "version": "24.10.0",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-04-08T22:34:06+03:00",
      "iconUrl": "https://github.com/netlify.png?size=64"
    },
    {
      "name": "pdfjs-dist",
      "version": "6.2.108",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T18:14:42+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=mozilla.github.io&sz=128"
    },
    {
      "name": "react",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-day-picker",
      "version": "8.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=react-day-picker.js.org&sz=128"
    },
    {
      "name": "react-dom",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-easy-crop",
      "version": "5.5.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-31T18:09:40+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=valentinh.github.io&sz=128"
    },
    {
      "name": "react-router-dom",
      "version": "7.18.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://github.com/remix-run.png?size=64"
    },
    {
      "name": "recharts",
      "version": "3.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://github.com/recharts.png?size=64"
    },
    {
      "name": "rollup-plugin-visualizer",
      "version": "6.0.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T00:41:35+03:00",
      "iconUrl": "https://github.com/btd.png?size=64"
    },
    {
      "name": "sharp",
      "version": "0.35.3",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T18:14:42+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=sharp.pixelplumbing.com&sz=128"
    },
    {
      "name": "sonner",
      "version": "2.0.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=sonner.emilkowal.ski&sz=128"
    },
    {
      "name": "tailwind-merge",
      "version": "3.6.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://github.com/dcastil.png?size=64"
    },
    {
      "name": "tailwindcss",
      "version": "4.1.18",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-03-12T16:43:11+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=tailwindcss.com&sz=128"
    },
    {
      "name": "tailwindcss-animate",
      "version": "1.0.7",
      "layer": "screen",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": null
    },
    {
      "name": "typescript",
      "version": "5.9.3",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=www.typescriptlang.org&sz=128"
    },
    {
      "name": "typescript-eslint",
      "version": "8.67.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=typescript-eslint.io&sz=128"
    },
    {
      "name": "vite",
      "version": "7.2.7",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-07-20T23:24:45+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=vite.dev&sz=128"
    },
    {
      "name": "vitest",
      "version": "4.1.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "iconUrl": "https://www.google.com/s2/favicons?domain=vitest.dev&sz=128"
    },
    {
      "name": "web-push",
      "version": "3.6.7",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-03-12T16:43:11+02:00",
      "iconUrl": "https://github.com/web-push-libs.png?size=64"
    }
  ],
  "runtimes": [
    {
      "name": "node",
      "label": "Node.js",
      "version": "24",
      "layer": "platform",
      "iconUrl": "https://www.google.com/s2/favicons?domain=nodejs.org&sz=128",
      "note": "рантайм збірки й усіх функцій · з netlify.toml"
    }
  ],
  "guards": [
    "типи застосунку",
    "лінт + борг компілятора",
    "тести",
    "типи функцій",
    "реєстр функцій",
    "ключі фіч",
    "реєстр поверхонь",
    "копії спільних модулів",
    "заглушки правил хуків",
    "розростання файлів",
    "знімок стеку",
    "версія Node",
    "адреси кронів"
  ],
  "tests": 1119,
  "testFiles": 74,
  "lintStubs": 29,
  "node": "24",
  "netlifyFunctions": 42,
  "sourceLines": 232366
};
