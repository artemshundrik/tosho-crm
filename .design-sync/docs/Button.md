---
category: Actions
---

Основна кнопка. `variant` задає вагу й колір, `size` — висоту, кегль і розмір іконки.

Варіанти: `primary` (одна головна дія на екран), `secondary`, `outline`, `ghost` (щільні ряди й тулбари), `destructive` (м'яке видалення) і `destructiveSolid` (незворотне), `successTonal` (підтвердження), `link`, `textMuted`, `textPrimary`, `segmented` (для SegmentedGroup, стан через `aria-pressed`), `chip` (фільтр-пігулка, теж `aria-pressed`), `control`/`controlDestructive` (іконка в тулбарі), `menu`, `card`.

Розміри: `xxs` `xs` `sm` `md` (типовий) `lg`; лише іконка — `iconXs` `iconSm` `iconMd` `icon`.

Іконку передавай дитиною — розмір і відступ вона отримає від `size`, класи їй ставити не треба. `loading` показує спінер на місці провідної іконки, ширина кнопки не змінюється. `disabled` малює справжній заблокований вигляд на спільних `--control-*` токенах, а не прозорість.
