#!/usr/bin/env bash
# Гейт на `git push`.
#
# Кожен пуш у origin/main тригерить production-деплой на Netlify.
# Один деплой = 15 кредитів ≈ $0.15 плоскою ставкою, незалежно від обсягу змін.
# Тариф Personal ($9) дає 1000 кредитів/міс; це ціна за пуш, а не квота
# (див. docs/DEPLOY_POLICY.md §4).
#
# Хук НЕ блокує пуш назавжди — він примусово питає Артема і показує, що саме поїде.
#
# ВАЖЛИВО: агент часто склеює `git add … && git commit … && git push`.
# Хук спрацьовує ДО виконання команди, тож на цей момент комітів ще нема —
# тому нижче показуємо ще й стейдж і робоче дерево, інакше підказка порожня.
set -uo pipefail

payload=$(cat 2>/dev/null || echo '{}')
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || echo '')

# ЗАПОБІЖНИК. Поле `if` у налаштуваннях виявилось ненадійним — хук викликається
# на КОЖНІЙ Bash-команді, а він завжди повертає "ask". Без цієї перевірки
# підтвердження вішається на все підряд (psql, ls, npm — будь-що).
# Не пуш — мовчки виходимо, нічого не друкуючи: тоді хук ні на що не впливає.
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

# Список файлів, обрізаний до N рядків, з хвостиком «+K ще»
listing() {
  local limit=$1 total shown
  local input; input=$(cat)
  [ -n "$input" ] || return 0
  total=$(printf '%s\n' "$input" | wc -l | tr -d ' ')
  shown=$(printf '%s\n' "$input" | head -"$limit" | sed 's/^/    /')
  printf '%s\n' "$shown"
  [ "$total" -gt "$limit" ] && printf '    … і ще %s\n' "$((total - limit))"
  return 0
}

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')

if [ -n "$upstream" ]; then
  ahead=$(git rev-list --count "$upstream"..HEAD 2>/dev/null || echo '0')
  commits=$(git log --oneline --no-decorate "$upstream"..HEAD 2>/dev/null | head -25 | sed 's/^/    /')
else
  ahead='?'
  commits=''
fi

staged=$(git diff --cached --name-only 2>/dev/null | listing 15)
unstaged=$(git diff --name-only 2>/dev/null | listing 15)
untracked=$(git ls-files --others --exclude-standard 2>/dev/null | listing 10)

# Чи створює команда коміт просто зараз (склеєний ланцюжок)?
will_commit=0
case "$cmd" in *"git commit"*) will_commit=1 ;; esac
will_add=0
case "$cmd" in *"git add"*) will_add=1 ;; esac

block=""
add() { block="${block}${1}
"; }

add "ПУШ = production-деплой на Netlify: 15 кредитів ≈ \$0.15."
add "Ціна не залежить від розміру пачки — тому дрібні зміни накопичуємо, а не викочуємо поштучно."
add ""
add "Гілка: $branch → ${upstream:-<немає upstream>}"
add ""

if [ "$ahead" != "0" ] && [ -n "$commits" ]; then
  add "Готові коміти ($ahead):"
  add "$commits"
  add ""
fi

if [ "$will_commit" = "1" ]; then
  add "⚠ Команда спершу СТВОРЮЄ коміт — на момент перевірки його ще нема."
  if [ "$will_add" = "1" ]; then
    add "  У ньому також опиниться те, що команда додасть через git add."
  fi
  add ""
fi

if [ -n "$staged" ]; then
  add "У стейджі (поїде в новий коміт):"
  add "$staged"
  add ""
fi

if [ -n "$unstaged" ]; then
  add "Змінене, ще не в стейджі:"
  add "$unstaged"
  add ""
fi

if [ -n "$untracked" ]; then
  add "Нові файли (не відстежуються):"
  add "$untracked"
  add ""
fi

if [ "$ahead" = "0" ] && [ "$will_commit" = "0" ] && [ -z "$staged" ]; then
  add "Пушити нічого — комітів попереду нема."
  add ""
fi

add "Пушити можна ТІЛЬКИ якщо:"
add "  • Артем прямо сказав «пушимо» / «викочуй» у цій розмові, АБО"
add "  • це гарячий фікс: прод зламаний і люди не можуть працювати."
add ""
add "Накопичив пачку, але команди не було? Не пушити — доповісти список і чекати."
add "Чіпали RLS / Netlify-функції / auth / secrets? Спершу /security-review."
add "Політика: docs/DEPLOY_POLICY.md"

jq -n --arg r "$block" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'
