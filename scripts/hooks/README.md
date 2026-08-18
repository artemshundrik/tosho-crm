# Git-хуки проєкту

Живуть у репозиторії, а не в `.git/hooks`, щоб їх було видно в історії й щоб
вони приїжджали разом із клоном.

## Увімкнути (раз на машину)

```bash
git config core.hooksPath scripts/hooks
```

Перевірити, що взялося:

```bash
git config core.hooksPath
```

Вимкнути: `git config --unset core.hooksPath`.

## pre-push — перевірки коду (блокують)

Перед пушем ганяє шість перевірок і **зупиняє пуш**, якщо хоч одна впала:

| Перевірка | Команда | ~час |
|---|---|---|
| типи застосунку | `npx tsc --noEmit` | 15 с |
| лінт | `npm run lint` | 47 с |
| тести | `npm run test` | 2 с |
| типи Netlify-функцій | `npm run typecheck:functions` | 1 с |
| реєстр Netlify-функцій | `npm run check:functions` | <1 с |
| ключі фіч | `npm run check:feature-keys` | <1 с |

Разом близько хвилини. Падіння однієї перевірки не зупиняє решту — усі проблеми
видно за один прогін, а не по черзі.

### Чому тут, а не лише в CI

Пуш у `main` = деплой Netlify = ~15 кредитів плоскою ставкою при бюджеті ≈40
деплоїв на місяць. GitHub Actions (`.github/workflows/ci.yml`) запускається
**паралельно** з деплоєм і зупинити його не може: коли Actions почервоніє,
кредити вже витрачені, а хотфікс з'їсть іще стільки ж. Тут — останнє місце, де
помилка ловиться безкоштовно.

Actions при цьому потрібні: вони ловлять випадки, коли гак обійшли або пуш
стався з іншої машини, і без них не запрацюють автооновлення залежностей
(робот відкриває PR — перевірки кажуть, чи він безпечний).

### Як обійти

```bash
SKIP_CHECKS=1 git push
```

Лише коли прод лежить і хотфікс потрібен негайно. Штатне `git push --no-verify`
теж працює, але вимикає заразом і оновлення годин.

Якщо немає `node_modules` (свіжий клон) — перевірки мовчки пропускаються з
підказкою поставити залежності.

## pre-push — робочі години

Перед кожним пушем оновлює `tosho.work_sessions` із транскриптів Claude Code
(`scripts/record-work-hours.mjs`). Займає менш ніж секунду.

Ця частина хука не блокує пуш ніколи: немає `.env.backup`, `psql` чи `node` —
вона мовчки виходить (на відміну від перевірок вище). Години — довідка для розділу «Релізи», а не умова деплою.

### Чому саме на пуші

У «Релізах» два прилади поруч:

| Прилад | Джерело | Хто оновлює |
|---|---|---|
| «≈N год» — робота | транскрипти Claude Code → `work_sessions` | цей хук |
| «за ритмом комітів» | коміти релізу | плагін Netlify після деплою |

Другий оновлюється сам на кожному деплої. Перший доти запускали руками — і він
відставав: 9 серпня о другій дня сторінка показувала «≈1.7 год», бо востаннє
скрипт ганяли о 08:48. Пуш зводить обидва прилади до одного моменту.

## Якщо працювати довго без пушу

Хук доганяє години лише в момент деплою. Щоб сторінка була свіжою й без пушів,
є фонове завдання macOS. Файл
`~/Library/LaunchAgents/pro.tosho.work-hours.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>pro.tosho.work-hours</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-lc</string>
    <string>cd /Users/artem/Projects/tosho-crm &amp;&amp; set -a &amp;&amp; . ./.env.backup &amp;&amp; set +a &amp;&amp; node scripts/record-work-hours.mjs --since=$(date -v-2d +%F)</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>/tmp/tosho-work-hours.log</string>
</dict>
</plist>
```

Увімкнути: `launchctl load ~/Library/LaunchAgents/pro.tosho.work-hours.plist`
Вимкнути: `launchctl unload ~/Library/LaunchAgents/pro.tosho.work-hours.plist`

Раз на годину, тихо, з логом помилок у `/tmp/tosho-work-hours.log`. Ідемпотентно:
скрипт перезаписує день цілком, тож зайвий запуск нічого не псує.
