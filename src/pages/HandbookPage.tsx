import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen } from "lucide-react";

import { WhatsNewTabs } from "@/components/app/WhatsNewTabs";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CRM_KNOWLEDGE } from "@/lib/crmKnowledge";

/**
 * «Як ми працюємо» — ті самі правила, які отримує ToSho AI, але для людей.
 *
 * Сенс не в дублюванні: поки набір правил бачила лише модель, помилку в ньому
 * не помічав ніхто. Я сам вписав сюди «денна норма — вісім візуалів», і це
 * протрималось до наступного дня, поки не зʼясувалось, що норма зберігається в
 * налаштуваннях. Правило, яке читають живі люди, виправляють швидко.
 *
 * Джерело одне — `crmKnowledge.ts`. Другого тексту, який доведеться синхронно
 * правити, тут навмисно немає.
 */
export default function HandbookPage() {
  return (
    <div className="pb-10">
      <UnifiedPageToolbar
        topLeft={
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Як ми працюємо</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Домовленості, яких не видно з інтерфейсу. Ці ж правила знає ToSho AI — якщо тут помилка, він
              повторить її у відповіді.
            </p>
          </div>
        }
        topRight={<WhatsNewTabs />}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {CRM_KNOWLEDGE.map((topic) => (
          <section
            key={topic.title}
            className="rounded-section border border-border/60 bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {topic.title}
              </h2>
              {/* Правило без адреси змушує шукати розділ навпомацки. */}
              {topic.route ? (
                <Link
                  to={topic.route}
                  className="flex shrink-0 items-center gap-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Перейти
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>

            <ul className="mt-3 space-y-2.5">
              {topic.rules.map((rule) => (
                <li key={rule} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-2xs text-muted-foreground">
        Правила живуть у коді поруч із можливостями, які вони описують, — тож не відстають від інтерфейсу.
        Побачили неточність — скажіть, і її виправлять разом із наступною викоткою.
      </p>
    </div>
  );
}
