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

## pre-push — робочі години

Перед кожним пушем оновлює `tosho.work_sessions` із транскриптів Claude Code
(`scripts/record-work-hours.mjs`). Займає менш ніж секунду.

Пуш не блокується ніколи: немає `.env.backup`, `psql` чи `node` — хук мовчки
виходить. Години — довідка для розділу «Релізи», а не умова деплою.

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
