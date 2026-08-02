#!/usr/bin/env bash
# Гейт на `git push`.
#
# Кожен пуш у origin/main тригерить production-деплой на Netlify.
# Один деплой = ~15 кредитів плоскою ставкою, незалежно від обсягу змін.
# Бюджет: ~40 деплоїв на місяць (див. docs/DEPLOY_POLICY.md).
#
# Хук НЕ блокує пуш назавжди — він примусово питає Артема і показує,
# скільки комітів зараз поїде та скільки це коштує.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')

if [ -n "$upstream" ]; then
  count=$(git rev-list --count "$upstream"..HEAD 2>/dev/null || echo '?')
  commits=$(git log --oneline --no-decorate "$upstream"..HEAD 2>/dev/null | head -25)
else
  count='?'
  commits=''
fi

[ -n "$commits" ] || commits='(немає нових комітів або upstream не налаштований)'

reason="ПУШ = production-деплой на Netlify ≈ 15 кредитів.
Бюджет ~40 деплоїв/міс — тобто ~1 на день. Дрібні зміни накопичуємо, не викочуємо поштучно.

Гілка:   $branch → ${upstream:-<немає upstream>}
Комітів: $count

$commits

Пушити можна ТІЛЬКИ якщо:
  • Артем прямо сказав «пушимо» / «викочуй» у цій розмові, АБО
  • це гарячий фікс: прод зламаний і люди не можуть працювати.

Накопичив пачку, але команди не було? Не пушити — доповісти список і чекати.
Політика: docs/DEPLOY_POLICY.md"

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'
