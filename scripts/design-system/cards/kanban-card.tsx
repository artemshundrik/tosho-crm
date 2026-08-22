import * as React from "react";
import { AlertTriangle, Layers, Lock, Package, ShieldCheck, Wallet } from "lucide-react";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { PriorityBars } from "@/features/devRequests/PriorityBars";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shell, Section, Caption } from "../shell";

/**
 * Начинка тут навмисно скорочена до кістяка: мета картки — показати ФОРМУ
 * (щільність, поверхню, стани), а не відтворити всі поля чотирьох дошок.
 * Оболонка справжня — це той самий KanbanCard, що на проді.
 */

function QuoteBody() {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Package className="size-4 shrink-0 text-muted-foreground/80" />
          <span className="truncate font-mono text-2xs font-semibold tracking-wide text-muted-foreground">TS-0826-0009</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone="info" className="h-6 gap-1 px-1.5 text-3xs"><Layers className="size-3" />12</Badge>
          <Lock className="size-3 text-muted-foreground/70" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <AvatarBase name="Тарас П." fallback="ТП" size={20} className="border-border/60 shrink-0" fallbackClassName="text-3xs font-semibold" />
        <span className="truncate text-[15px] font-semibold">ТОВ «Приклад»</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">48 200,00 ₴</span>
        <Badge tone="warning" size="sm">25 серп.</Badge>
      </div>
    </>
  );
}

function DesignBody() {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="truncate font-mono text-2xs font-semibold tracking-wide text-muted-foreground">DZ-0826-0041</span>
        <Badge tone="accent" size="sm">Дизайн готовий</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">Логотип на футболки, 2 кольори, груди + спина</p>
      <div className="mt-3 flex items-center gap-2">
        <AvatarBase name="Іван С." fallback="ІС" size={20} className="border-border/60 shrink-0" fallbackClassName="text-3xs font-semibold" />
        <span className="truncate text-xs text-muted-foreground">Іван С.</span>
        <Badge tone="neutral" size="sm" className="ml-auto">3 візуали</Badge>
      </div>
    </>
  );
}

function OrderBody() {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EntityAvatar name="FAYNA TEAM" fallback="FT" size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">FAYNA TEAM</div>
            <div className="truncate text-xs text-muted-foreground">TS-0826-0039 • 276 грн</div>
          </div>
        </div>
        <Badge tone="warning" size="sm" className="shrink-0">Увага</Badge>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><Wallet className="size-3.5" />Готівкові / на карту</div>
        <div className="flex items-center gap-2"><ShieldCheck className="size-3.5" />Дизайн потребує підтвердження</div>
      </div>
      <div className="tone-warning-subtle mt-4 rounded-xl border p-3">
        <div className="tone-text-warning mb-1 flex items-center gap-2 text-xs font-semibold">
          <AlertTriangle className="size-3.5" />Що блокує
        </div>
        <div className="tone-text-warning text-xs leading-5">Заповнені email та мобільний номер</div>
      </div>
    </>
  );
}

function RequestBody() {
  return (
    <>
      <div className="flex items-center gap-2">
        <PriorityBars priority="high" />
        <span className="tone-text-danger text-2xs font-semibold">Не працює</span>
        <span className="font-mono text-2xs font-semibold tracking-wide text-muted-foreground">REQ-105</span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[13px] font-medium leading-snug">Закрити несанкціонований доступ до 11 таблиць схеми tosho</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" size="sm">Dev</Badge>
        <Badge tone="danger" size="sm">Терміново</Badge>
        <span className="ml-auto text-3xs text-muted-foreground/70">22 серп.</span>
      </div>
    </>
  );
}

const BOARDS = [
  { name: "Прорахунок", density: "regular", surface: "flat", body: <QuoteBody />, drag: "ring-2 ring-primary/30 opacity-90" },
  { name: "Дизайн-задача", density: "regular", surface: "raised", body: <DesignBody />, drag: "ring-2 ring-primary/40" },
  { name: "Замовлення", density: "roomy", surface: "raised", body: <OrderBody />, drag: "" },
  { name: "Запит на доробку", density: "compact", surface: "flat", body: <RequestBody />, drag: "opacity-50" },
] as const;

export default function KanbanCardCard() {
  return (
    <Shell
      title="Картка канбану"
      lede={
        <>
          Справжній <code>KanbanCard</code> — одна оболонка на чотири дошки. Форма (радіус, межа, перехід, ховер) живе в компоненті; щільність і поверхня — двома пропсами; начинку приносить сторінка.
        </>
      }
    >
      <Section
        title="Чотири дошки поруч"
        hint="на підкладці колонки — так, як картка лежить у застосунку, а не на голому тлі"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BOARDS.map((b) => (
            <div key={b.name}>
              <p className="mb-1.5 text-3xs uppercase tracking-[0.1em] text-muted-foreground">
                {b.name} · density={b.density} · surface={b.surface}
              </p>
              {/* .kanban-column-surface — та сама підкладка, що на дошках:
                  без неї картка читається інакше, бо колонка тонована. */}
              <div className="kanban-column-surface p-2">
                <KanbanCard density={b.density} surface={b.surface}>{b.body}</KanbanCard>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Щільність" hint="три значення — рівно ті, що вже були на дошках">
        <div className="grid gap-3 sm:grid-cols-3">
          {(["compact", "regular", "roomy"] as const).map((d) => (
            <div key={d}>
              <p className="mb-1.5 text-3xs text-muted-foreground">{d} · {d === "compact" ? "10px" : d === "regular" ? "12px" : "16px"}</p>
              <KanbanCard density={d}><RequestBody /></KanbanCard>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Поверхня" hint="плаский фон проти градієнта — зараз обидва в роботі, і це не рішення, а розбіжність">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-3xs text-muted-foreground">flat — прорахунки, запити</p>
            <KanbanCard surface="flat"><QuoteBody /></KanbanCard>
          </div>
          <div>
            <p className="mb-1.5 text-3xs text-muted-foreground">raised — дизайн, замовлення</p>
            <KanbanCard surface="raised"><QuoteBody /></KanbanCard>
          </div>
        </div>
      </Section>

      <Section title="Стани" hint="недоступна картка: курсор-заборона, приглушення, без підсвітки межі">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-3xs text-muted-foreground">звичайна</p>
            <KanbanCard><QuoteBody /></KanbanCard>
          </div>
          <div>
            <p className="mb-1.5 text-3xs text-muted-foreground">disabled — немає прав відкрити</p>
            <KanbanCard interactive={false} disabled><QuoteBody /></KanbanCard>
          </div>
        </div>
      </Section>

      <Section
        title="Перетягування — чотири різні відповіді"
        hint="єдине, що ще не зведено: кожна дошка малює це по-своєму. Обери один рецепт — і він переїде в компонент"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {BOARDS.map((b) => (
            <div key={b.name}>
              <p className="mb-1.5 text-3xs text-muted-foreground">
                {b.name} — {b.drag || "нічого не показує"}
              </p>
              <KanbanCard density={b.density} surface={b.surface} className={b.drag}><RequestBody /></KanbanCard>
            </div>
          ))}
        </div>
        <Caption>Три різні кільця й два різні приглушення там, де питання одне: «цю картку зараз тягнуть».</Caption>
      </Section>

      <Section title="Каркас завантаження" hint="повторює щільність справжньої картки, тому дошка не стрибає">
        <div className="grid gap-3 sm:grid-cols-2">
          <KanbanCard interactive={false}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-28" />
          </KanbanCard>
          <KanbanCard density="compact" interactive={false}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-2 h-3 w-32" />
          </KanbanCard>
        </div>
      </Section>
    </Shell>
  );
}
