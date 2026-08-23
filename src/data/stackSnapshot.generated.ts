// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot

import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = {
  "generatedAt": "2026-08-23T18:42:40.429Z",
  "packages": [
    {
      "name": "@eslint/js",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "ESLint JavaScript language implementation",
      "homepage": "https://eslint.org",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=eslint.org&sz=128"
    },
    {
      "name": "@fontsource-variable/inter",
      "version": "5.3.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-07-24T00:51:50+03:00",
      "bumpCommit": {
        "sha": "e4f87bc",
        "subject": "perf(fonts): self-host Inter замість Google Fonts CDN"
      },
      "description": "Self-host the Inter font in a neatly bundled NPM package.",
      "homepage": "https://fontsource.org/fonts/inter",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=fontsource.org&sz=128"
    },
    {
      "name": "@radix-ui/react-alert-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-avatar",
      "version": "1.2.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-checkbox",
      "version": "1.3.11",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 3,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-dropdown-menu",
      "version": "2.1.24",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-label",
      "version": "2.1.15",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-popover",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-select",
      "version": "2.3.7",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-separator",
      "version": "1.1.15",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-slot",
      "version": "1.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@radix-ui/react-tabs",
      "version": "1.1.21",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": null,
      "homepage": "https://radix-ui.com/primitives",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=radix-ui.com&sz=128"
    },
    {
      "name": "@react-pdf/renderer",
      "version": "4.7.0",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Create PDF files on the browser and server",
      "homepage": null,
      "usedIn": 3,
      "iconUrl": "https://github.com/diegomura.png?size=64"
    },
    {
      "name": "@supabase/supabase-js",
      "version": "2.112.3",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T19:46:50+03:00",
      "bumpCommit": {
        "sha": "6a560ae",
        "subject": "Статус прорахунку більше не можна зіпсувати невідомим значенням"
      },
      "description": "Isomorphic Javascript SDK for Supabase",
      "homepage": null,
      "usedIn": 85,
      "iconUrl": "https://github.com/supabase.png?size=64"
    },
    {
      "name": "@tailwindcss/vite",
      "version": "4.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "A utility-first CSS framework for rapidly building custom user interfaces.",
      "homepage": "https://tailwindcss.com",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tailwindcss.com&sz=128"
    },
    {
      "name": "@tanstack/react-query",
      "version": "5.102.1",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Hooks for managing, caching and syncing asynchronous and remote data in React",
      "homepage": "https://tanstack.com/query",
      "usedIn": 14,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@tanstack/react-virtual",
      "version": "3.14.10",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-21T12:32:46+03:00",
      "bumpCommit": {
        "sha": "080ba8a",
        "subject": "perf(дизайн): дошка тримає в браузері лише видимі картки — на третину менше роботи для сторінки"
      },
      "description": "Headless UI for virtualizing scrollable elements in React",
      "homepage": "https://tanstack.com/virtual",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@tiptap/extension-link",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "bumpCommit": {
        "sha": "afa07af",
        "subject": "feat: add contract sections editor and rich text editor components"
      },
      "description": "link extension for tiptap",
      "homepage": "https://tiptap.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/extension-underline",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "bumpCommit": {
        "sha": "afa07af",
        "subject": "feat: add contract sections editor and rich text editor components"
      },
      "description": "underline extension for tiptap",
      "homepage": "https://tiptap.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/react",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "bumpCommit": {
        "sha": "afa07af",
        "subject": "feat: add contract sections editor and rich text editor components"
      },
      "description": "React components for tiptap",
      "homepage": "https://tiptap.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/starter-kit",
      "version": "3.23.5",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-05-20T10:11:28+03:00",
      "bumpCommit": {
        "sha": "afa07af",
        "subject": "feat: add contract sections editor and rich text editor components"
      },
      "description": "starter kit for tiptap",
      "homepage": "https://tiptap.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@types/node",
      "version": "24.10.3",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "TypeScript definitions for node",
      "homepage": null,
      "usedIn": 1,
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
      "bumpCommit": {
        "sha": "9aa6579",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "TypeScript definitions for react",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/react-dom",
      "version": "19.2.4",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "bumpCommit": {
        "sha": "9aa6579",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "TypeScript definitions for react-dom",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/web-push",
      "version": "3.6.4",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-07-25T18:16:21+03:00",
      "bumpCommit": {
        "sha": "af67210",
        "subject": "fix(finance): полагодити нагадування про платежі + тести на резолвер"
      },
      "description": "TypeScript definitions for web-push",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@vitejs/plugin-react",
      "version": "6.1.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "The default Vite plugin for React projects",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/vitejs.png?size=64"
    },
    {
      "name": "babel-plugin-react-compiler",
      "version": "1.0.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T12:03:25+03:00",
      "bumpCommit": {
        "sha": "ae13e6c",
        "subject": "chore(надійність): борг перед React Compiler більше не може рости непомітно"
      },
      "description": "Babel plugin for React Compiler.",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/facebook.png?size=64"
    },
    {
      "name": "class-variance-authority",
      "version": "0.7.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Class Variance Authority 🧬",
      "homepage": null,
      "usedIn": 6,
      "iconUrl": "https://github.com/joe-bell.png?size=64"
    },
    {
      "name": "clsx",
      "version": "2.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "A tiny (239B) utility for constructing className strings conditionally.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/lukeed.png?size=64"
    },
    {
      "name": "cmdk",
      "version": "1.1.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": null,
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/pacocoursey.png?size=64"
    },
    {
      "name": "date-fns",
      "version": "3.6.0",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Modern JavaScript date utility library",
      "homepage": null,
      "usedIn": 10,
      "iconUrl": "https://github.com/date-fns.png?size=64"
    },
    {
      "name": "dompurify",
      "version": "3.4.14",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "DOMPurify is a DOM-only, super-fast, uber-tolerant XSS sanitizer for HTML, MathML and SVG. It runs as JavaScript and works in all modern browsers, as well as in Node.js (via jsdom). DOMPurify is writt",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/cure53.png?size=64"
    },
    {
      "name": "eslint",
      "version": "9.39.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "An AST-based pattern checker for JavaScript.",
      "homepage": "https://eslint.org",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=eslint.org&sz=128"
    },
    {
      "name": "eslint-plugin-react-hooks",
      "version": "7.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T20:50:06+03:00",
      "bumpCommit": {
        "sha": "83e0b10",
        "subject": "Пульс команди більше не буває порожнім, коли події встигають раніше за список людей"
      },
      "description": "ESLint rules for React Hooks",
      "homepage": "https://react.dev/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "eslint-plugin-react-refresh",
      "version": "0.4.24",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Validate that your components can safely be updated with Fast Refresh",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": null
    },
    {
      "name": "globals",
      "version": "16.5.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Global identifiers from different JavaScript environments",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/sindresorhus.png?size=64"
    },
    {
      "name": "jsdom",
      "version": "29.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-08T00:42:10+03:00",
      "bumpCommit": {
        "sha": "14dfafe",
        "subject": "build(deps): jsdom — залежність тесту, який я закомітив без неї"
      },
      "description": "A JavaScript implementation of many web standards",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/jsdom.png?size=64"
    },
    {
      "name": "lucide-react",
      "version": "1.33.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T21:38:45+03:00",
      "bumpCommit": {
        "sha": "06cefd1",
        "subject": "Іконки соцмереж у списку «звідки прийшов клієнт» тепер свої, а не чужі"
      },
      "description": "A Lucide icon library package for React applications.",
      "homepage": "https://lucide.dev",
      "usedIn": 182,
      "iconUrl": "https://www.google.com/s2/favicons?domain=lucide.dev&sz=128"
    },
    {
      "name": "netlify-cli",
      "version": "24.10.0",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-04-08T22:34:06+03:00",
      "bumpCommit": {
        "sha": "4a3714f",
        "subject": "dropbox"
      },
      "description": "Netlify command line tool",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/netlify.png?size=64"
    },
    {
      "name": "pdfjs-dist",
      "version": "6.2.108",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T18:14:42+03:00",
      "bumpCommit": {
        "sha": "3bc001d",
        "subject": "Закрито дві дірки безпеки: присланий PDF більше не виконує чужий код у вкладці"
      },
      "description": "Generic build of Mozilla's PDF.js library.",
      "homepage": "https://mozilla.github.io/pdf.js/",
      "usedIn": 3,
      "iconUrl": "https://www.google.com/s2/favicons?domain=mozilla.github.io&sz=128"
    },
    {
      "name": "react",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "bumpCommit": {
        "sha": "9aa6579",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "React is a JavaScript library for building user interfaces.",
      "homepage": "https://react.dev/",
      "usedIn": 239,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-day-picker",
      "version": "8.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Customizable Date Picker for React",
      "homepage": "http://react-day-picker.js.org",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react-day-picker.js.org&sz=128"
    },
    {
      "name": "react-dom",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "bumpCommit": {
        "sha": "9aa6579",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "React package for working with the DOM.",
      "homepage": "https://react.dev/",
      "usedIn": 9,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-easy-crop",
      "version": "5.5.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-31T18:09:40+02:00",
      "bumpCommit": {
        "sha": "65745f4",
        "subject": "user menu"
      },
      "description": "A React component to crop images/videos with easy interactions",
      "homepage": "https://ValentinH.github.io/react-easy-crop/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=valentinh.github.io&sz=128"
    },
    {
      "name": "react-router-dom",
      "version": "7.18.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Declarative routing for React web applications",
      "homepage": null,
      "usedIn": 47,
      "iconUrl": "https://github.com/remix-run.png?size=64"
    },
    {
      "name": "recharts",
      "version": "3.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "React charts",
      "homepage": null,
      "usedIn": 2,
      "iconUrl": "https://github.com/recharts.png?size=64"
    },
    {
      "name": "rollup-plugin-visualizer",
      "version": "6.0.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T00:41:35+03:00",
      "bumpCommit": {
        "sha": "0032436",
        "subject": "perf(швидкість): перший вхід у CRM став легшим на 43 кБ — палітра пошуку більше не вантажиться всім"
      },
      "description": null,
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/btd.png?size=64"
    },
    {
      "name": "sharp",
      "version": "0.35.3",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T18:14:42+03:00",
      "bumpCommit": {
        "sha": "3bc001d",
        "subject": "Закрито дві дірки безпеки: присланий PDF більше не виконує чужий код у вкладці"
      },
      "description": "High performance Node.js image processing, the fastest module to resize JPEG, PNG, WebP, GIF, AVIF and TIFF images",
      "homepage": "https://sharp.pixelplumbing.com",
      "usedIn": 7,
      "iconUrl": "https://www.google.com/s2/favicons?domain=sharp.pixelplumbing.com&sz=128"
    },
    {
      "name": "sonner",
      "version": "2.0.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "An opinionated toast component for React.",
      "homepage": "https://sonner.emilkowal.ski/",
      "usedIn": 54,
      "iconUrl": "https://www.google.com/s2/favicons?domain=sonner.emilkowal.ski&sz=128"
    },
    {
      "name": "tailwind-merge",
      "version": "3.6.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Merge Tailwind CSS classes without style conflicts",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/dcastil.png?size=64"
    },
    {
      "name": "tailwindcss",
      "version": "4.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "A utility-first CSS framework for rapidly building custom user interfaces.",
      "homepage": "https://tailwindcss.com",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tailwindcss.com&sz=128"
    },
    {
      "name": "tailwindcss-animate",
      "version": "1.0.7",
      "layer": "screen",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "A Tailwind CSS plugin for creating beautiful animations.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": null
    },
    {
      "name": "typescript",
      "version": "5.9.3",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "TypeScript is a language for application scale JavaScript development",
      "homepage": "https://www.typescriptlang.org/",
      "usedIn": 0,
      "iconUrl": "https://www.google.com/s2/favicons?domain=www.typescriptlang.org&sz=128"
    },
    {
      "name": "typescript-eslint",
      "version": "8.67.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Tooling which enables you to use TypeScript with ESLint",
      "homepage": "https://typescript-eslint.io/packages/typescript-eslint",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=typescript-eslint.io&sz=128"
    },
    {
      "name": "vite",
      "version": "8.2.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Native-ESM powered web dev build tool",
      "homepage": "https://vite.dev",
      "usedIn": 3,
      "iconUrl": "https://www.google.com/s2/favicons?domain=vite.dev&sz=128"
    },
    {
      "name": "vitest",
      "version": "4.1.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Next generation testing framework powered by Vite",
      "homepage": "https://vitest.dev",
      "usedIn": 75,
      "iconUrl": "https://www.google.com/s2/favicons?domain=vitest.dev&sz=128"
    },
    {
      "name": "web-push",
      "version": "3.6.7",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-03-12T16:43:11+02:00",
      "bumpCommit": {
        "sha": "2f16f21",
        "subject": "notifications"
      },
      "description": "Web Push library for Node.js",
      "homepage": null,
      "usedIn": 2,
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
  "sourceLines": 232806
};
