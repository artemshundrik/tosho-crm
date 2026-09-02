// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot

import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = {
  "generatedAt": "2026-09-02T20:50:27.655Z",
  "packages": [
    {
      "name": "@babel/core",
      "version": "8.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Двигун обох розборів вище.",
      "homepage": "https://babel.dev/docs/en/next/babel-core",
      "usedIn": 0,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=babel.dev&sz=128"
    },
    {
      "name": "@babel/eslint-parser",
      "version": "8.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Дає тій одній перевірці читати TypeScript. Стоїть замість typescript-eslint, який тримав нас на шостій версії TypeScript.",
      "homepage": "https://babel.dev/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=babel.dev&sz=128"
    },
    {
      "name": "@babel/preset-react",
      "version": "8.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Розбір JSX для парсера вище. Без нього перевірка бачить одну знахідку з п'ятнадцяти.",
      "homepage": "https://babel.dev/docs/en/next/babel-preset-react",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=babel.dev&sz=128"
    },
    {
      "name": "@babel/preset-typescript",
      "version": "8.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Розбір TypeScript для парсера вище.",
      "homepage": "https://babel.dev/docs/en/next/babel-preset-typescript",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=babel.dev&sz=128"
    },
    {
      "name": "@fontsource-variable/inter",
      "version": "5.3.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-07-24T00:51:50+03:00",
      "bumpCommit": {
        "sha": "e4f87bcf",
        "subject": "perf(fonts): self-host Inter замість Google Fonts CDN"
      },
      "description": "Шрифт Inter, покладений у наш бандл, щоб не тягнути його з чужого сервера.",
      "homepage": "https://fontsource.org/fonts/inter",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=fontsource.org&sz=128"
    },
    {
      "name": "@number-flow/react",
      "version": "0.6.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-29T13:21:18+03:00",
      "bumpCommit": {
        "sha": "b6e69840",
        "subject": "Великі підсумки більше не стрибають: число перекручується розряд за розрядом, а смуга часток росте разом із ним"
      },
      "description": "Крутить великі підсумки розряд за розрядом, коли сума міняється: «Витрати», картки «Огляду», сума прорахунку, лічильники «Релізів».",
      "homepage": "https://number-flow.barvian.me",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=number-flow.barvian.me&sz=128"
    },
    {
      "name": "@playwright/test",
      "version": "1.62.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-24T21:22:52+03:00",
      "bumpCommit": {
        "sha": "0b908f4c",
        "subject": "Застосунок тепер проклацується в справжньому браузері, а не лише перевіряється по коду"
      },
      "description": "Ганяє зібраний застосунок у справжньому браузері й клацає по ньому, як людина: відкриває дошки, закриває вікна, шукає. Ловить те, чого не бачить жоден тест коду, — наприклад блимання сторінки при закритті вікна.",
      "homepage": "https://playwright.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=playwright.dev&sz=128"
    },
    {
      "name": "@radix-ui/react-alert-dialog",
      "version": "1.1.23",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Вікна підтвердження — «Точно видалити?».",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Аватарка з відкотом на монограму, коли фото не завантажилось.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Галочки у формах і списках.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Модальні вікна: діалог замовника, форма прорахунку, палітра команд.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Випадні меню: три крапки на картках і в рядках таблиць.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Підписи до полів, привʼязані до самого поля.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Спливні картки біля елемента — як пояснення пакета на цій сторінці.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Випадні списки вибору у формах.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Лінії-роздільники між блоками.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Дозволяє кнопці прикинутись посиланням, не дублюючи стилі.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Вкладки — як «За шарами» / «За терміновістю» вгорі.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Збирає PDF-документи — рахунки, специфікації, договори.",
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
        "sha": "6a560aea",
        "subject": "Статус прорахунку більше не можна зіпсувати невідомим значенням"
      },
      "description": "Через нього CRM говорить із базою: читає прорахунки, зберігає замовників, перевіряє права.",
      "homepage": null,
      "usedIn": 94,
      "iconUrl": "https://github.com/supabase.png?size=64"
    },
    {
      "name": "@tailwindcss/vite",
      "version": "4.3.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe4",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Підключає Tailwind до складальника: збирає CSS під час збірки.",
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
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Памʼятає, що вже завантажено, і не питає базу двічі. Через нього ходять майже всі запити.",
      "homepage": "https://tanstack.com/query",
      "usedIn": 19,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@tanstack/react-virtual",
      "version": "3.14.10",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-21T12:32:46+03:00",
      "bumpCommit": {
        "sha": "080ba8a4",
        "subject": "perf(дизайн): дошка тримає в браузері лише видимі картки — на третину менше роботи для сторінки"
      },
      "description": "Малює лише видимі рядки довгих списків. Без нього дошка з сотнями карток гальмувала б.",
      "homepage": "https://tanstack.com/virtual",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tanstack.com&sz=128"
    },
    {
      "name": "@testing-library/jest-dom",
      "version": "7.0.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-24T15:50:59+03:00",
      "bumpCommit": {
        "sha": "1b7f37a8",
        "subject": "Захист від втрати введеного тепер перевіряють тести, а не лише очі"
      },
      "description": "Додає до тестів зрозумілі перевірки про розмітку: «видно на екрані», «поле має таке значення».",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/testing-library.png?size=64"
    },
    {
      "name": "@testing-library/react",
      "version": "16.3.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-24T15:50:59+03:00",
      "bumpCommit": {
        "sha": "1b7f37a8",
        "subject": "Захист від втрати введеного тепер перевіряють тести, а не лише очі"
      },
      "description": "Дає тестам справді намалювати компонент, а не лише порахувати його логіку: без цього не перевіриш, чи закрилось вікно й чи не спитало зайвого.",
      "homepage": null,
      "usedIn": 25,
      "iconUrl": "https://github.com/testing-library.png?size=64"
    },
    {
      "name": "@testing-library/user-event",
      "version": "14.6.6",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-24T15:50:59+03:00",
      "bumpCommit": {
        "sha": "1b7f37a8",
        "subject": "Захист від втрати введеного тепер перевіряють тести, а не лише очі"
      },
      "description": "Клікає й друкує в тестах так, як це робить людина, — з наведенням, фокусом і клавіатурою, а не одним синтетичним кліком.",
      "homepage": null,
      "usedIn": 11,
      "iconUrl": "https://github.com/testing-library.png?size=64"
    },
    {
      "name": "@tiptap/extension-link",
      "version": "3.30.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:56:04+03:00",
      "bumpCommit": {
        "sha": "56ce4fcf",
        "subject": "Редактор технічного завдання оновлено, а сторінка «Стек» навчилась не звинувачувати невинних"
      },
      "description": "Посилання в редакторі ТЗ.",
      "homepage": "https://tiptap.dev",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/extension-underline",
      "version": "3.30.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:56:04+03:00",
      "bumpCommit": {
        "sha": "56ce4fcf",
        "subject": "Редактор технічного завдання оновлено, а сторінка «Стек» навчилась не звинувачувати невинних"
      },
      "description": "Підкреслення в редакторі ТЗ.",
      "homepage": "https://tiptap.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/pm",
      "version": "3.30.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:56:04+03:00",
      "bumpCommit": {
        "sha": "56ce4fcf",
        "subject": "Редактор технічного завдання оновлено, а сторінка «Стек» навчилась не звинувачувати невинних"
      },
      "description": "Рушій ProseMirror, на якому побудований редактор ТЗ. У коді не викликається — його вимагають самі розширення tiptap.",
      "homepage": "https://tiptap.dev",
      "usedIn": 2,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/react",
      "version": "3.30.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:56:04+03:00",
      "bumpCommit": {
        "sha": "56ce4fcf",
        "subject": "Редактор технічного завдання оновлено, а сторінка «Стек» навчилась не звинувачувати невинних"
      },
      "description": "Редактор технічного завдання: жирний, списки, посилання.",
      "homepage": "https://tiptap.dev",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tiptap.dev&sz=128"
    },
    {
      "name": "@tiptap/starter-kit",
      "version": "3.30.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:56:04+03:00",
      "bumpCommit": {
        "sha": "56ce4fcf",
        "subject": "Редактор технічного завдання оновлено, а сторінка «Стек» навчилась не звинувачувати невинних"
      },
      "description": "Базовий набір можливостей редактора ТЗ.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Опис типів Node для коду, що працює на сервері.",
      "homepage": null,
      "usedIn": 1,
      "peerRequired": true,
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
        "sha": "9aa6579f",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "Опис типів React для перевірки типів.",
      "homepage": null,
      "usedIn": 0,
      "peerRequired": true,
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/react-dom",
      "version": "19.2.4",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "bumpCommit": {
        "sha": "9aa6579f",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "Опис типів react-dom.",
      "homepage": null,
      "usedIn": 0,
      "peerRequired": true,
      "iconUrl": "https://github.com/DefinitelyTyped.png?size=64"
    },
    {
      "name": "@types/web-push",
      "version": "3.6.4",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-07-25T18:16:21+03:00",
      "bumpCommit": {
        "sha": "af672104",
        "subject": "fix(finance): полагодити нагадування про платежі + тести на резолвер"
      },
      "description": "Опис типів бібліотеки пуш-сповіщень.",
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
        "sha": "7a272fe4",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Навчає складальник розуміти React.",
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
        "sha": "ae13e6c3",
        "subject": "chore(надійність): борг перед React Compiler більше не може рости непомітно"
      },
      "description": "React Compiler: сам розставляє оптимізації, які раніше писали руками.",
      "homepage": null,
      "usedIn": 0,
      "peerRequired": true,
      "iconUrl": "https://github.com/facebook.png?size=64"
    },
    {
      "name": "class-variance-authority",
      "version": "0.7.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Описує варіанти вигляду компонента (розмір, тон) без каші з умов у класах.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Крихітний помічник: склеює класи, пропускаючи порожні й вимкнені.",
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
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Рушій палітри команд — того вікна, що відкривається на Cmd+K.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/pacocoursey.png?size=64"
    },
    {
      "name": "date-fns",
      "version": "4.4.0",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Робота з датами: дедлайни, періоди, «3 дні тому».",
      "homepage": null,
      "usedIn": 11,
      "iconUrl": "https://github.com/date-fns.png?size=64"
    },
    {
      "name": "dompurify",
      "version": "3.4.14",
      "layer": "data",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Чистить HTML від чужого коду перед показом — захист від підстановки скриптів.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/cure53.png?size=64"
    },
    {
      "name": "eslint",
      "version": "10.9.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-25T18:41:40+03:00",
      "bumpCommit": {
        "sha": "8ecf8f82",
        "subject": "Помилки в журналі тепер показують причину, а не лише наслідок"
      },
      "description": "Лишився заради однієї перевірки — боргу перед React Compiler. Ті п'ять правил oxlint поки не тягне, тож вони ганяються окремо в CI.",
      "homepage": "https://eslint.org",
      "usedIn": 2,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=eslint.org&sz=128"
    },
    {
      "name": "eslint-plugin-react-hooks",
      "version": "7.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T20:50:06+03:00",
      "bumpCommit": {
        "sha": "83e0b104",
        "subject": "Пульс команди більше не буває порожнім, коли події встигають раніше за список людей"
      },
      "description": "Правила про React-хуки — саме він знайшов порожній Пульс. Заради нього ESLint і лишили.",
      "homepage": "https://react.dev/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "jsdom",
      "version": "29.1.1",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-08T00:42:10+03:00",
      "bumpCommit": {
        "sha": "14dfafe1",
        "subject": "build(deps): jsdom — залежність тесту, який я закомітив без неї"
      },
      "description": "Підроблений браузер для тестів, які працюють із розміткою.",
      "homepage": null,
      "usedIn": 1,
      "peerRequired": true,
      "iconUrl": "https://github.com/jsdom.png?size=64"
    },
    {
      "name": "lucide-react",
      "version": "1.33.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T21:38:45+03:00",
      "bumpCommit": {
        "sha": "06cefd1c",
        "subject": "Іконки соцмереж у списку «звідки прийшов клієнт» тепер свої, а не чужі"
      },
      "description": "Набір іконок. Майже кожна іконка в CRM — звідси.",
      "homepage": "https://lucide.dev",
      "usedIn": 220,
      "iconUrl": "https://www.google.com/s2/favicons?domain=lucide.dev&sz=128"
    },
    {
      "name": "netlify-cli",
      "version": "24.10.0",
      "layer": "platform",
      "dev": true,
      "bumpedAt": "2026-04-08T22:34:06+03:00",
      "bumpCommit": {
        "sha": "4a3714fc",
        "subject": "dropbox"
      },
      "description": "Інструмент Netlify: піднімає функції локально, щоб перевіряти їх до викочування.",
      "homepage": null,
      "usedIn": 0,
      "iconUrl": "https://github.com/netlify.png?size=64"
    },
    {
      "name": "oxlint",
      "version": "1.80.0",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Лінт: шукає підозрілі місця в коді за правилами. Написаний на Rust — увесь проєкт за 2 с замість 98,6 в ESLint.",
      "homepage": "https://oxc.rs/docs/guide/usage/linter",
      "usedIn": 0,
      "iconUrl": "https://www.google.com/s2/favicons?domain=oxc.rs&sz=128"
    },
    {
      "name": "pdfjs-dist",
      "version": "6.2.108",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-23T18:14:42+03:00",
      "bumpCommit": {
        "sha": "3bc001d2",
        "subject": "Закрито дві дірки безпеки: присланий PDF більше не виконує чужий код у вкладці"
      },
      "description": "Малює прев'ю PDF-вкладень прямо в браузері.",
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
        "sha": "9aa6579f",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "Основа всього інтерфейсу: перетворює дані на те, що видно на екрані, і сам вирішує, що перемалювати.",
      "homepage": "https://react.dev/",
      "usedIn": 294,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-day-picker",
      "version": "10.0.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T22:41:44+03:00",
      "bumpCommit": {
        "sha": "9d3adbfd",
        "subject": "Календар переїхав на нову версію, і React 19 більше не тримається силою"
      },
      "description": "Календар вибору дати — той, що випадає в полях дедлайнів.",
      "homepage": "https://daypicker.dev",
      "usedIn": 2,
      "iconUrl": "https://www.google.com/s2/favicons?domain=daypicker.dev&sz=128"
    },
    {
      "name": "react-dom",
      "version": "19.2.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-20T23:28:32+03:00",
      "bumpCommit": {
        "sha": "9aa6579f",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "Частина React, яка власне малює в браузері.",
      "homepage": "https://react.dev/",
      "usedIn": 10,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-easy-crop",
      "version": "5.5.6",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-31T18:09:40+02:00",
      "bumpCommit": {
        "sha": "65745f4d",
        "subject": "user menu"
      },
      "description": "Обрізання картинки при завантаженні аватарки чи лого.",
      "homepage": "https://ValentinH.github.io/react-easy-crop/",
      "usedIn": 3,
      "iconUrl": "https://www.google.com/s2/favicons?domain=valentinh.github.io&sz=128"
    },
    {
      "name": "react-router-dom",
      "version": "7.18.2",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Адреси сторінок: що показати на /orders/estimates і як переходити між розділами без перезавантаження.",
      "homepage": null,
      "usedIn": 55,
      "iconUrl": "https://github.com/remix-run.png?size=64"
    },
    {
      "name": "recharts",
      "version": "3.10.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Графіки: стовпчики й площі на сторінках аналітики.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": "https://github.com/recharts.png?size=64"
    },
    {
      "name": "rollup-plugin-visualizer",
      "version": "6.0.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-21T00:41:35+03:00",
      "bumpCommit": {
        "sha": "00324361",
        "subject": "perf(швидкість): перший вхід у CRM став легшим на 43 кБ — палітра пошуку більше не вантажиться всім"
      },
      "description": "Малює карту бандла: що саме займає місце. Вмикається тільки вручну.",
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
        "sha": "3bc001d2",
        "subject": "Закрито дві дірки безпеки: присланий PDF більше не виконує чужий код у вкладці"
      },
      "description": "Обробка зображень на сервері: стискає й переганяє у webp картинки каталогу.",
      "homepage": "https://sharp.pixelplumbing.com",
      "usedIn": 9,
      "iconUrl": "https://www.google.com/s2/favicons?domain=sharp.pixelplumbing.com&sz=128"
    },
    {
      "name": "sonner",
      "version": "2.0.8",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Спливні повідомлення в кутку: «Збережено», «Не вийшло».",
      "homepage": "https://sonner.emilkowal.ski/",
      "usedIn": 66,
      "iconUrl": "https://www.google.com/s2/favicons?domain=sonner.emilkowal.ski&sz=128"
    },
    {
      "name": "tailwind-merge",
      "version": "3.6.0",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Розв'язує суперечки між класами Tailwind, коли їх складають із кількох джерел.",
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
        "sha": "7a272fe4",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Спосіб писати стилі короткими класами прямо в розмітці. Уся зовнішність CRM тримається на ньому.",
      "homepage": "https://tailwindcss.com",
      "usedIn": 2,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=tailwindcss.com&sz=128"
    },
    {
      "name": "tailwindcss-animate",
      "version": "1.0.7",
      "layer": "screen",
      "dev": true,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedfe",
        "subject": "Initial commit"
      },
      "description": "Готові анімації для Tailwind: появи, зникнення, плавні переходи панелей.",
      "homepage": null,
      "usedIn": 1,
      "iconUrl": null
    },
    {
      "name": "typescript",
      "version": "7.0.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-29T14:12:19+03:00",
      "bumpCommit": {
        "sha": "1a7cd2c1",
        "subject": "Перевірки перед пушем стали за 11 секунд замість двох хвилин"
      },
      "description": "Перевіряє типи: ловить помилки до запуску, а не в проді. Версія 7 — перевірка за 2,6 с замість 16.",
      "homepage": "https://www.typescriptlang.org/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=www.typescriptlang.org&sz=128"
    },
    {
      "name": "vite",
      "version": "8.2.2",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T21:10:41+03:00",
      "bumpCommit": {
        "sha": "7a272fe4",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Складальник: перетворює сотні файлів коду на кілька, які розуміє браузер. Він же тримає локальний сервер для перевірок.",
      "homepage": "https://vite.dev",
      "usedIn": 5,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=vite.dev&sz=128"
    },
    {
      "name": "vitest",
      "version": "4.1.11",
      "layer": "build",
      "dev": true,
      "bumpedAt": "2026-08-23T17:47:00+03:00",
      "bumpCommit": {
        "sha": "e9a6e239",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Тести. Ті самі, що ганяються перед кожним пушем.",
      "homepage": "https://vitest.dev",
      "usedIn": 147,
      "peerRequired": true,
      "iconUrl": "https://www.google.com/s2/favicons?domain=vitest.dev&sz=128"
    },
    {
      "name": "web-push",
      "version": "3.6.7",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-24T13:52:17+03:00",
      "bumpCommit": {
        "sha": "2cc0887e",
        "subject": "Функції доступів і кадрових рішень тепер перевіряють, що їм прислали"
      },
      "description": "Надсилає пуш-сповіщення в браузер.",
      "homepage": null,
      "usedIn": 2,
      "iconUrl": "https://github.com/web-push-libs.png?size=64"
    },
    {
      "name": "xlsx",
      "version": "0.20.3",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2026-09-01T16:59:30+03:00",
      "bumpCommit": {
        "sha": "af69a962",
        "subject": "Ексельку від клієнта тепер читає модель, а не менеджер очима"
      },
      "description": "Читає ексельки клієнтів прямо в браузері: з них імпортуються позиції прорахунку. Береться з офіційного CDN SheetJS, а не з npm, — у npm лишилась версія 2022 року з дірками розбору, а розбираємо ми саме чужі файли.",
      "homepage": "https://sheetjs.com/",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=sheetjs.com&sz=128"
    },
    {
      "name": "zod",
      "version": "4.4.3",
      "layer": "platform",
      "dev": false,
      "bumpedAt": "2026-08-24T13:52:17+03:00",
      "bumpCommit": {
        "sha": "2cc0887e",
        "subject": "Функції доступів і кадрових рішень тепер перевіряють, що їм прислали"
      },
      "description": "Перевіряє, що дані, які прийшли ззовні, справді такі, як ми чекаємо: серверні функції звіряють із нею тіло запиту.",
      "homepage": "https://zod.dev",
      "usedIn": 27,
      "iconUrl": "https://www.google.com/s2/favicons?domain=zod.dev&sz=128"
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
  "guards": [],
  "tests": 1978,
  "testFiles": 145,
  "lintStubs": 29,
  "node": "24",
  "netlifyFunctions": 44,
  "sourceLines": 271243,
  "automation": {
    "workflows": [
      {
        "file": "ci.yml",
        "name": "Перевірки",
        "cron": null,
        "trigger": "на пуш, на PR"
      },
      {
        "file": "e2e.yml",
        "name": "Наскрізні перевірки",
        "cron": "20 4 * * *",
        "trigger": "за розкладом 20 4 * * *"
      },
      {
        "file": "watchdog.yml",
        "name": "watchdog",
        "cron": "*/5 * * * *",
        "trigger": "за розкладом */5 * * * *"
      }
    ],
    "hooks": [
      "commit-msg",
      "post-commit",
      "pre-push"
    ],
    "plugins": [
      "/plugins/record-release"
    ]
  }
};
