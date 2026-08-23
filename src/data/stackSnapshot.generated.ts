// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot

import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = {
  "generatedAt": "2026-08-23T19:38:05.462Z",
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
      "description": "Базовий набір правил лінту.",
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
      "description": "Шрифт Inter, покладений у наш бандл, щоб не тягнути його з чужого сервера.",
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
        "sha": "e9a6e23",
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
        "sha": "e9a6e23",
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
        "sha": "414eedf",
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
        "sha": "414eedf",
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
        "sha": "e9a6e23",
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
        "sha": "414eedf",
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
        "sha": "414eedf",
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
        "sha": "e9a6e23",
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
        "sha": "e9a6e23",
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
        "sha": "e9a6e23",
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
        "sha": "e9a6e23",
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
        "sha": "6a560ae",
        "subject": "Статус прорахунку більше не можна зіпсувати невідомим значенням"
      },
      "description": "Через нього CRM говорить із базою: читає прорахунки, зберігає замовників, перевіряє права.",
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
        "sha": "e9a6e23",
        "subject": "Оновлено півтора десятка бібліотек і викинуто ту, якою ніхто не користувався"
      },
      "description": "Памʼятає, що вже завантажено, і не питає базу двічі. Через нього ходять майже всі запити.",
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
      "description": "Малює лише видимі рядки довгих списків. Без нього дошка з сотнями карток гальмувала б.",
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
      "description": "Посилання в редакторі ТЗ.",
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
      "description": "Підкреслення в редакторі ТЗ.",
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
      "description": "Редактор технічного завдання: жирний, списки, посилання.",
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
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Опис типів Node для коду, що працює на сервері.",
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
      "description": "Опис типів React для перевірки типів.",
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
      "description": "Опис типів react-dom.",
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
        "sha": "7a272fe",
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
        "sha": "ae13e6c",
        "subject": "chore(надійність): борг перед React Compiler більше не може рости непомітно"
      },
      "description": "React Compiler: сам розставляє оптимізації, які раніше писали руками.",
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
        "sha": "414eedf",
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
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Рушій палітри команд — того вікна, що відкривається на Cmd+K.",
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
      "description": "Робота з датами: дедлайни, періоди, «3 дні тому».",
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
      "description": "Чистить HTML від чужого коду перед показом — захист від підстановки скриптів.",
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
      "description": "Лінт: шукає підозрілі місця в коді за правилами.",
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
      "description": "Правила про React-хуки — саме він знайшов порожній Пульс.",
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
      "description": "Стежить, щоб компоненти можна було оновлювати без перезавантаження сторінки.",
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
      "description": "Список глобальних імен різних середовищ, щоб лінт не лаявся на window чи process.",
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
      "description": "Підроблений браузер для тестів, які працюють із розміткою.",
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
      "description": "Набір іконок. Майже кожна іконка в CRM — звідси.",
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
      "description": "Інструмент Netlify: піднімає функції локально, щоб перевіряти їх до викочування.",
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
        "sha": "9aa6579",
        "subject": "feat(швидкість): CRM працює на React 19 — фундамент для автоматичного прискорення"
      },
      "description": "Основа всього інтерфейсу: перетворює дані на те, що видно на екрані, і сам вирішує, що перемалювати.",
      "homepage": "https://react.dev/",
      "usedIn": 239,
      "iconUrl": "https://www.google.com/s2/favicons?domain=react.dev&sz=128"
    },
    {
      "name": "react-day-picker",
      "version": "10.0.1",
      "layer": "screen",
      "dev": false,
      "bumpedAt": "2025-12-28T15:40:31+02:00",
      "bumpCommit": {
        "sha": "414eedf",
        "subject": "Initial commit"
      },
      "description": "Календар вибору дати — той, що випадає в полях дедлайнів.",
      "homepage": "https://daypicker.dev",
      "usedIn": 1,
      "iconUrl": "https://www.google.com/s2/favicons?domain=daypicker.dev&sz=128"
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
      "description": "Частина React, яка власне малює в браузері.",
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
      "description": "Обрізання картинки при завантаженні аватарки чи лого.",
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
      "description": "Адреси сторінок: що показати на /orders/estimates і як переходити між розділами без перезавантаження.",
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
      "description": "Графіки: стовпчики й площі на сторінках аналітики.",
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
        "sha": "3bc001d",
        "subject": "Закрито дві дірки безпеки: присланий PDF більше не виконує чужий код у вкладці"
      },
      "description": "Обробка зображень на сервері: стискає й переганяє у webp картинки каталогу.",
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
      "description": "Спливні повідомлення в кутку: «Збережено», «Не вийшло».",
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
        "sha": "7a272fe",
        "subject": "Збірка застосунку стала швидшою в шість разів"
      },
      "description": "Спосіб писати стилі короткими класами прямо в розмітці. Уся зовнішність CRM тримається на ньому.",
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
      "description": "Готові анімації для Tailwind: появи, зникнення, плавні переходи панелей.",
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
      "description": "Перевіряє типи: ловить помилки до запуску, а не в проді.",
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
      "description": "Дає лінту розуміти TypeScript.",
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
      "description": "Складальник: перетворює сотні файлів коду на кілька, які розуміє браузер. Він же тримає локальний сервер для перевірок.",
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
      "description": "Тести. Ті самі 1119, що ганяються перед кожним пушем.",
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
      "description": "Надсилає пуш-сповіщення в браузер.",
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
    {
      "name": "типи застосунку",
      "note": "Звіряє типи по всьому коду. Ловить помилку на кшталт «тут очікується число, а приїхав рядок» до того, як вона стане поломкою в проді."
    },
    {
      "name": "лінт + борг компілятора",
      "note": "Шукає підозрілі місця в коді й рахує борг перед React Compiler. Борг може лише зменшуватись: виріс — пуш не проходить."
    },
    {
      "name": "тести",
      "note": "Проганяє всі автотести. Кожен з них — зафіксована поведінка, яку колись уже ламали."
    },
    {
      "name": "типи функцій",
      "note": "Те саме, що типи застосунку, але для 42 серверних функцій. Вони мають окремий список перевірених файлів, який росте в міру приведення їх до ладу."
    },
    {
      "name": "реєстр функцій",
      "note": "Імена файлів функцій мають бути прийнятні для Netlify. Одна крапка в імені — і деплой падає вже після оплати збірки."
    },
    {
      "name": "ключі фіч",
      "note": "Ключі можливостей у коді й у базі мають збігатися, інакше замір використання рахує не те."
    },
    {
      "name": "реєстр поверхонь",
      "note": "Нова сторінка зі смугою дій має бути записана в реєстр, інакше каркас завантаження малює не ту форму й блимає порожньою смугою."
    },
    {
      "name": "копії спільних модулів",
      "note": "Дві копії Radix у залежностях глушать випадні панелі всередині модалок — мовчки, без жодної помилки. Ця перевірка ловить саме такий дубль."
    },
    {
      "name": "заглушки правил хуків",
      "note": "Рахує місця, де правила React-хуків вимкнені коментарем. Кожна така заглушка вимикає React Compiler для ЦІЛОГО файлу — тобто одна прихована помилка коштує всієї сторінки. Число може лише зменшуватись."
    },
    {
      "name": "розростання файлів",
      "note": "Стежить, щоб найбільші сторінки не росли. У файлі на десять тисяч рядків компілятор здається й перестає бачити помилки взагалі."
    },
    {
      "name": "знімок стеку",
      "note": "Звіряє цю сторінку з реально встановленими пакетами. Без неї після кожного npm i вона показувала б стару версію й радила оновити те, що вже оновлене."
    },
    {
      "name": "версія Node",
      "note": "Версія Node записана у трьох місцях: прод, ця машина й GitHub Actions. Розійдуться — локально збереться одне, а в проді запуститься інше."
    },
    {
      "name": "адреси кронів",
      "note": "Розклад кронів живе в базі й містить адресу функції рядком. Перейменував файл — крон щодня стукає в нікуди, і журнал при цьому показує «успішно»."
    }
  ],
  "tests": 1119,
  "testFiles": 74,
  "lintStubs": 29,
  "node": "24",
  "netlifyFunctions": 42,
  "sourceLines": 233097
};
