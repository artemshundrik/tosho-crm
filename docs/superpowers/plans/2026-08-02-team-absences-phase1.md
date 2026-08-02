# Команда 2.0 — Фаза 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Перебудувати `/team` на вкладки «Люди / Календар / Запити» з річними квотами відсутностей, планером люди×дні та рольовою видимістю залишків.

**Architecture:** Одна таблиця-джерело `tosho.team_absences` отримує колонку `status` (бекфіл `approved`) — календар, «хто відсутній» і норми дизайнерів читають її. Квоти живуть у новій `tosho.team_absence_quotas`; залишки віддає RPC із перевіркою ролі всередині (приватність), а не голий select. UI розкладається на компоненти в `src/components/team/`, сторінка стає тонким композитором вкладок.

**Tech Stack:** React 18 + TS + Vite, Tailwind v4, Supabase (schema `tosho`, RLS), vitest, psql для міграції.

**Спец:** [docs/TEAM_ABSENCES_DESIGN.md](../../TEAM_ABSENCES_DESIGN.md) (DRAFT v2, рішення CEO §0).

---

## File Structure

| Файл | Відповідальність |
|---|---|
| `scripts/team-absences-quotas.sql` | **Create.** Міграція: status-колонки на `team_absences`, `team_absence_quotas`, `team_absence_events`, RPC балансів, RLS/грант. Ідемпотентна. |
| `src/lib/designerPayroll.ts` | **Modify.** `loadAbsences` + `loadNormPlans` фільтрують `status=approved`. |
| `src/lib/designerPayroll.test.ts` | **Modify.** Кейс «pending не зменшує норму». |
| `src/lib/teamAbsences.ts` | **Modify.** `status` у типі/мапері/запитах, `TEAM_ABSENCE_KIND_TONE` як єдине джерело тону, фільтр по статусах. |
| `src/lib/teamAbsenceQuotas.ts` | **Create.** Квоти, баланси (RPC), підрахунок робочих днів діапазону за `ua_workday_exceptions`. |
| `src/lib/teamAbsenceQuotas.test.ts` | **Create.** Юніт-тести робочих днів і залишків. |
| `src/components/team/AbsencePlanner.tsx` | **Create.** Сітка люди×дні (бари, штриховка pending, вихідні/свята, сьогодні). |
| `src/components/team/MyBalanceCard.tsx` | **Create.** «Мій баланс» — три квоти + сегментована шкала відпустки. |
| `src/components/team/QuotaEditorDialog.tsx` | **Create.** Редактор річних лімітів (owner/SEO). |
| `src/components/team/AbsenceDialog.tsx` | **Create.** Створення/редагування відсутності з підрахунком робочих днів і залишку. |
| `src/components/team/TeamMemberCard.tsx` | **Create.** Картка людини; баланси рендеряться лише коли `showBalances`. |
| `src/pages/TeamPage.tsx` | **Modify.** Вкладки, рольова видимість, дані з журналу. |

---

## Task 1: Міграція БД

**Files:** Create `scripts/team-absences-quotas.sql`

- [ ] **Step 1:** Написати міграцію: `alter table tosho.team_absences add column if not exists status text not null default 'approved'` + check(`pending|approved|declined|cancelled`), `requested_by uuid`, `decided_by uuid`, `decided_at timestamptz`, `decision_comment text`; індекс `(workspace_id, status)`.
- [ ] **Step 2:** `create table if not exists tosho.team_absence_quotas (workspace_id, user_id, year, vacation_days int not null default 18, day_off_days int not null default 6, sick_days int not null default 10, updated_by, updated_at, primary key (workspace_id, user_id, year))`; RLS: select — сам або owner/SEO; write — owner/SEO; grant authenticated; revoke anon.
- [ ] **Step 3:** `create table if not exists tosho.team_absence_events` (аудит: absence_id, action, actor_user_id, payload jsonb, created_at); RLS select — owner/SEO; insert — service_role.
- [ ] **Step 4:** RPC `tosho.team_absence_balances(p_year int)` — `security definer`, повертає рядок на людину (user_id, quota+used по трьох типах); усередині: якщо викликач не owner/SEO — повертає лише свій рядок. Робочі дні рахуються з `ua_workday_exceptions` (пн–пт, виняток перебиває).
- [ ] **Step 5:** Застосувати до прод-БД: `psql "$BACKUP_DB_URL" -f scripts/team-absences-quotas.sql` (креденшели з `.env.backup`).
- [ ] **Step 6:** Перевірити: `select status, count(*) from tosho.team_absences group by 1` — усі legacy рядки `approved`; `select * from tosho.team_absence_balances(2026)` як owner і як звичайний користувач (симуляція ролі через `set_config('request.jwt.claims', ...)`).
- [ ] **Step 7:** Commit.

## Task 2: Payroll читає лише approved

**Files:** Modify `src/lib/designerPayroll.ts` (≈243-265, ≈386-395), `src/lib/designerPayroll.test.ts`

- [ ] **Step 1:** Додати `.eq("status", "approved")` в обидва запити `team_absences` + коментар «pending не ріже норму».
- [ ] **Step 2:** Додати тест: відсутність зі `status: "pending"` не змінює `normDaysTotal`.
- [ ] **Step 3:** `npx vitest run src/lib/designerPayroll.test.ts` — PASS.
- [ ] **Step 4:** Commit.

## Task 3: Дата-шар

**Files:** Modify `src/lib/teamAbsences.ts`; Create `src/lib/teamAbsenceQuotas.ts`, `src/lib/teamAbsenceQuotas.test.ts`

- [ ] **Step 1:** `teamAbsences.ts`: тип `TeamAbsenceStatus`, поле `status` у `TeamAbsence`, у `ABSENCE_COLUMNS`, у мапері; `TEAM_ABSENCE_KIND_TONE: Record<TeamAbsenceKind, Tone>` (vacation→info, sick_leave→warning, day_off→accent, other→neutral) як ЄДИНЕ джерело тону; badge-класи виводяться з нього через `toneBadgeClass`; `listTeamAbsencesForMonth` приймає `statuses` (дефолт approved+pending).
- [ ] **Step 2:** `teamAbsenceQuotas.ts`: `countBusinessDays(start, end, exceptions)`, `loadWorkdayExceptions(workspaceId, from, to)`, `loadAbsenceBalances(year)` (RPC), `loadQuotas/saveQuota` (owner/SEO), типи `AbsenceBalance`.
- [ ] **Step 3:** Тести: вихідні не рахуються; виняток-календар перебиває; діапазон в один день = 1; залишок = квота − використано.
- [ ] **Step 4:** `npx vitest run src/lib/teamAbsenceQuotas.test.ts` — PASS. Commit.

## Task 4: Компоненти

**Files:** Create `src/components/team/{AbsencePlanner,MyBalanceCard,QuotaEditorDialog,AbsenceDialog,TeamMemberCard}.tsx`

- [ ] **Step 1:** `AbsencePlanner` — grid `212px repeat(N, minmax(27px,1fr))`, бари з `gridColumn`, `pending` штрихований, вихідні/свята фон, сьогодні підсвічене; клік по клітинці → `onPickDay(userId, dateKey)`.
- [ ] **Step 2:** `MyBalanceCard` — сегментована шкала (використано / на погодженні / вільно) + дві прості.
- [ ] **Step 3:** `TeamMemberCard` — переніс наявної картки + опційний блок балансів (`showBalances`).
- [ ] **Step 4:** `AbsenceDialog` — тип/дати/коментар + рядок «N робочих днів, залишиться M».
- [ ] **Step 5:** `QuotaEditorDialog` — таблиця людей × три числові поля.
- [ ] **Step 6:** `npx tsc --noEmit` — чисто. Commit.

## Task 5: TeamPage на вкладки

**Files:** Modify `src/pages/TeamPage.tsx`

- [ ] **Step 1:** Стан `tab: "people" | "calendar" | "requests"`; сегменти в `topLeft` тулбара з `CountBadge`; фільтри/пошук показуються лише на вкладці «Люди».
- [ ] **Step 2:** «Хто відсутній сьогодні» рахується з `absences` (approved, що покривають сьогодні), а не з `availabilityStatus`.
- [ ] **Step 3:** Вкладка «Люди»: `MyBalanceCard` + «Зараз відсутні» + «Події» + стрічка 14 днів (`AbsencePlanner` з `days=14`, тільки відсутні) + сітка карток (`showBalances = isSuperAdmin || isSeo`).
- [ ] **Step 4:** Вкладка «Календар»: місячний `AbsencePlanner` + легенда + смуга pending (owner/SEO).
- [ ] **Step 5:** Вкладка «Запити»: свої записи + інбокс pending для owner/SEO (кнопки рішення — заглушені до Фази 2, показують стан).
- [ ] **Step 6:** `npx tsc --noEmit` + `npm run lint` — без нових помилок. Commit.

## Task 6: Верифікація

- [ ] **Step 1:** `npx tsc --noEmit` → 0 помилок.
- [ ] **Step 2:** `npm run lint` → не більше помилок, ніж у базовій лінії.
- [ ] **Step 3:** `npx vitest run src/lib/` → PASS.
- [ ] **Step 4:** psql: симулювати звичайного користувача — `team_absence_balances` повертає 1 рядок; owner — усі.
- [ ] **Step 5:** Оновити `docs/DB_MAP.md` (додати team_absences/quotas) і `docs/CODEX_PROJECT_GUIDE.md` (контракт сторінки).
- [ ] **Step 6:** Commit + push у `main` (лише свої файли).
