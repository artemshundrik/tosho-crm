#!/bin/sh
#
# Перевірки перед пушем — ОДИН список на два входи.
#
# НАВІЩО ОКРЕМИЙ ФАЙЛ. Доти список жив лише всередині pre-push, і прогнати те
# саме локально не було чим: кожна перевірка має свій npm-скрипт, а зібраної
# команди не існувало. Через це єдиним способом дізнатись, чи пройде пуш, був
# сам пуш — найдорожчий із можливих (замір 28.08.2026: три раунди
# «пуш → падає → лагоджу» наприкінці довгої сесії, коли контекст кожної правки
# вже вивітрився).
#
# ДВА РЕЖИМИ:
#   full (типово) — те саме, що ганяє хук перед пушем;
#   fast          — ратчети, типи й лінт. Це те, що варто ганяти ПІД ЧАС
#                   роботи: розмір файлів росте непомітно з кожним комітом, і
#                   зустріти все разом наприкінці означає виносити модулі з
#                   чотирьох гігантів одночасно.
#
# ЩО ЗМІНИВ REQ-208. Лінт коштував 98,6 с із 106 і жив лише в повному списку —
# під час роботи його ніхто не ганяв. Тепер це oxlint за 2 с, і він стоїть в
# ОБОХ списках: помилка лінту знаходиться відразу, а не за півтори хвилини
# перед пушем.
#
# А борг компілятора звідси ПІШОВ — обидва списки його більше не кличуть. Ті
# 90 с — прохід React Compiler усередині eslint-plugin-react-hooks, і швидшим
# він не буває (звірка з oxlint у шапці eslint.compiler.config.mjs: правила
# там є, але сліпнуть на всіх чотирьох гігантах). Тепер за ним стежить
# GitHub Actions на кожен пуш і кожен PR. Руками: `npm run check:compiler-debt`.
#
# Перевірки, що дивляться в живу базу, без .env.backup мовчки пропускаються —
# так само, як у хуку.

set -u

MODE="${1:-full}"

if [ ! -d node_modules ]; then
  echo "[перевірки] node_modules немає. Постав залежності: npm ci"
  exit 1
fi

FAST_CHECKS='
типи застосунку|npm run typecheck --silent
лінт|npm run lint --silent
типи функцій|npm run typecheck:functions --silent
заглушки правил хуків|node scripts/check-hook-disables.mjs
розростання файлів|node scripts/check-file-growth.mjs
розмір інструкцій|node scripts/check-instruction-size.mjs
реєстр функцій|npm run check:functions --silent
'

FULL_CHECKS='
типи застосунку|npm run typecheck --silent
лінт|npm run lint --silent
тести|npm run test --silent
типи функцій|npm run typecheck:functions --silent
реєстр функцій|npm run check:functions --silent
ключі фіч|npm run check:feature-keys --silent
реєстр поверхонь|npm run check:page-surfaces --silent
копії спільних модулів|npm run check:duplicate-singletons --silent
читачі правил|npm run check:rule-readers --silent
заглушки правил хуків|node scripts/check-hook-disables.mjs
розростання файлів|node scripts/check-file-growth.mjs
розмір інструкцій|node scripts/check-instruction-size.mjs
знімок стеку|node scripts/check-stack-snapshot.mjs
версія Node|node scripts/check-node-version.mjs
адреси кронів|set -a; . ./.env.backup 2>/dev/null; set +a; node scripts/check-cron-endpoints.mjs
захист БД|set -a; . ./.env.backup 2>/dev/null; set +a; node scripts/check-db-guards.mjs
SQL-журнал|set -a; . ./.env.backup 2>/dev/null; set +a; node scripts/check-sql-journal.mjs
'

if [ "$MODE" = "fast" ]; then
  CHECKS="$FAST_CHECKS"
  echo "[перевірки] швидкі — типи, лінт і ратчети"
else
  CHECKS="$FULL_CHECKS"
  echo "[перевірки] повні — те саме, що перед пушем"
fi

# Цикл читає з heredoc, а НЕ з пайпа: у пайпі тіло циклу йде в підпроцес, і
# накопичений `failed` губиться разом із ним — перевірки падали б, а вихід
# лишався нульовим.
failed=""
while IFS= read -r check; do
  [ -z "$check" ] && continue
  name=${check%%|*}
  cmd=${check#*|}
  # Без вирівнювання по колонках: printf рахує БАЙТИ, а не символи, тож
  # кирилиця в %-18s їде.
  printf "[перевірки]   %s" "$name"
  if out=$(eval "$cmd" 2>&1); then
    echo " → ок"
  else
    echo " → ПАДАЄ"
    failed="$failed $name"
    echo "$out" | tail -15 | sed 's/^/[перевірки]     /'
  fi
done <<EOF
$CHECKS
EOF

if [ -n "$failed" ]; then
  echo ""
  echo "[перевірки] ✖ не пройшли:$failed"
  exit 1
fi

echo "[перевірки] ✓ усе чисто"
