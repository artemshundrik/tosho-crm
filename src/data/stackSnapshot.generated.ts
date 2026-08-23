// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot

import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = {
  "generatedAt": "2026-08-23T13:11:33.363Z",
  "packages": [
    {
      "name": "@eslint/js",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@fontsource-variable/inter",
      "version": "5.3.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-07-24T00:51:50+03:00"
    },
    {
      "name": "@radix-ui/react-alert-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-avatar",
      "version": "1.1.11",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-checkbox",
      "version": "1.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-dropdown-menu",
      "version": "2.1.24",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-label",
      "version": "2.1.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-popover",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-select",
      "version": "2.3.7",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-separator",
      "version": "1.1.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-slot",
      "version": "1.2.4",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-switch",
      "version": "1.2.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@radix-ui/react-tabs",
      "version": "1.1.13",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@react-pdf/renderer",
      "version": "4.5.1",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-06-24T12:19:38+03:00"
    },
    {
      "name": "@supabase/supabase-js",
      "version": "2.87.1",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@tailwindcss/vite",
      "version": "4.1.18",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@tanstack/react-query",
      "version": "5.90.18",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-01-17T11:04:55+02:00"
    },
    {
      "name": "@tanstack/react-virtual",
      "version": "3.14.10",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-21T12:32:46+03:00"
    },
    {
      "name": "@tiptap/extension-link",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "@tiptap/extension-underline",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "@tiptap/react",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "@tiptap/starter-kit",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "@types/dompurify",
      "version": "3.0.5",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "@types/node",
      "version": "24.10.3",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "@types/react",
      "version": "19.2.18",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00"
    },
    {
      "name": "@types/react-dom",
      "version": "19.2.4",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00"
    },
    {
      "name": "@types/web-push",
      "version": "3.6.4",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-07-25T18:16:21+03:00"
    },
    {
      "name": "@vitejs/plugin-react",
      "version": "5.1.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "babel-plugin-react-compiler",
      "version": "1.0.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T12:03:25+03:00"
    },
    {
      "name": "class-variance-authority",
      "version": "0.7.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "clsx",
      "version": "2.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "cmdk",
      "version": "1.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "date-fns",
      "version": "3.6.0",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "dompurify",
      "version": "3.4.5",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00"
    },
    {
      "name": "eslint",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "eslint-plugin-react-hooks",
      "version": "7.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "eslint-plugin-react-refresh",
      "version": "0.4.24",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "framer-motion",
      "version": "13.1.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-15T01:07:20+03:00"
    },
    {
      "name": "globals",
      "version": "16.5.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "jsdom",
      "version": "29.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-08T00:42:10+03:00"
    },
    {
      "name": "lucide-react",
      "version": "0.560.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "netlify-cli",
      "version": "24.10.0",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-04-08T22:34:06+03:00"
    },
    {
      "name": "pdfjs-dist",
      "version": "5.6.205",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-04-06T00:17:23+03:00"
    },
    {
      "name": "react",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00"
    },
    {
      "name": "react-day-picker",
      "version": "8.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "react-dom",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00"
    },
    {
      "name": "react-easy-crop",
      "version": "5.5.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-31T18:09:40+02:00"
    },
    {
      "name": "react-router-dom",
      "version": "7.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "recharts",
      "version": "3.6.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "rollup-plugin-visualizer",
      "version": "6.0.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T00:41:35+03:00"
    },
    {
      "name": "sharp",
      "version": "0.34.5",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-04-06T02:16:50+03:00"
    },
    {
      "name": "sonner",
      "version": "2.0.7",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-29T18:05:12+02:00"
    },
    {
      "name": "tailwind-merge",
      "version": "3.4.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "tailwindcss",
      "version": "4.1.18",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-03-12T16:43:11+02:00"
    },
    {
      "name": "tailwindcss-animate",
      "version": "1.0.7",
      "layer": "screen",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "typescript",
      "version": "5.9.3",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "typescript-eslint",
      "version": "8.49.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00"
    },
    {
      "name": "vite",
      "version": "7.2.7",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-07-20T23:24:45+03:00"
    },
    {
      "name": "vitest",
      "version": "4.1.10",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-07-20T23:24:45+03:00"
    },
    {
      "name": "web-push",
      "version": "3.6.7",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-03-12T16:43:11+02:00"
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
    "адреси кронів"
  ],
  "tests": 1110,
  "testFiles": 74,
  "lintStubs": 29,
  "node": "20",
  "netlifyFunctions": 42,
  "sourceLines": 231825
};
