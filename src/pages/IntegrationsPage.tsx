import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { hasDefaultFinanceAccess, hasModuleAccess } from "@/lib/moduleAccess";
import { toneDotClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import { formatAgo, IntegrationCard } from "@/features/integrations/IntegrationCard";
import { IntegrationSheet } from "@/features/integrations/IntegrationSheet";
import { readSnapshot, writeSnapshot } from "@/features/integrations/integrationsCache";
import {
  INTEGRATION_BLOCK_HINT,
  INTEGRATION_BLOCK_LABEL,
  INTEGRATION_BLOCK_ORDER,
  integrationBlockOf,
  type IntegrationDefinition,
  type IntegrationId,
} from "@/features/integrations/integrationsCatalog";
import {
  INTEGRATION_FILTER_LABEL,
  INTEGRATION_STATE_TONE,
  matchesIntegrationFilter,
  type IntegrationFilter,
} from "@/features/integrations/integrationsPresentation";
import {
  loadIntegrationStatuses,
  visibleIntegrations,
  type IntegrationStatus,
} from "@/features/integrations/integrationsStatus";

const FILTERS: IntegrationFilter[] = ["all", "working", "attention", "inactive"];

type Statuses = Record<IntegrationId, IntegrationStatus>;

export default function IntegrationsPage() {
  // accessRole/jobRole вже враховують режим «Дивитись як» (див. AuthState).
  const { teamId, userId, accessRole, jobRole, moduleAccess } = useAuth();
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<IntegrationFilter>("all");
  const [openId, setOpenId] = useState<IntegrationId | null>(null);

  // Доступ до фінансів вирішує, чи прочитається стан «Вчасно». Рахуємо тим
  // самим правилом, що й гейт маршруту, — інакше картка казала б «немає
  // доступу» людині, яка спокійно відкриває розділ Фінансів.
  const canFinance = hasDefaultFinanceAccess(accessRole, jobRole) || hasModuleAccess(moduleAccess, "finance");
  const canSeeInfra = hasModuleAccess(moduleAccess, "dev");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadIntegrationStatuses({ teamId, userId, canFinance, canSeeInfra });
      const at = new Date().toISOString();
      setStatuses(next);
      setLoadedAt(at);
      writeSnapshot(next, at);
    } finally {
      setLoading(false);
    }
  }, [teamId, userId, canFinance, canSeeInfra]);

  // Знімок показуємо одразу, а тягнемо лише коли він застарів. Стан інтеграцій
  // міняється днями — щохвилинне опитування бази нікому нічого не додає, а вік
  // даних видно у штампі біля кнопки.
  useEffect(() => {
    const cached = readSnapshot<Statuses>();
    if (cached) {
      setStatuses(cached.data);
      setLoadedAt(cached.at);
      if (!cached.isStale) return;
    }
    void load();
  }, [load]);

  const definitions = useMemo(() => visibleIntegrations(canSeeInfra), [canSeeInfra]);

  const visible = useMemo(() => {
    if (!statuses) return [] as IntegrationDefinition[];
    return definitions.filter((definition) => {
      const status = statuses[definition.id];
      return status ? matchesIntegrationFilter(status.state, filter) : false;
    });
  }, [statuses, definitions, filter]);

  const working = useMemo(() => {
    if (!statuses) return 0;
    return definitions.filter((definition) => statuses[definition.id]?.state === "ok").length;
  }, [statuses, definitions]);

  const groups = useMemo(
    () =>
      INTEGRATION_BLOCK_ORDER.map((block) => ({
        block,
        items: visible.filter((item) => integrationBlockOf(item) === block),
      })).filter((entry) => entry.items.length > 0),
    [visible]
  );

  const openDefinition = openId ? definitions.find((item) => item.id === openId) ?? null : null;
  const refreshedAgo = formatAgo(loadedAt);

  return (
    <div className="pb-10">
      <UnifiedPageToolbar
        topLeft={
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Інтеграції</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Зовнішні сервіси, з якими працює CRM: що зараз живе, що потребує уваги і що плануємо підключити.
            </p>
          </div>
        }
        topRight={
          // Кнопка стоїть навпроти заголовка, а не в окремій смузі над сторінкою:
          // та смуга була порожня на 95% ширини й лише відсувала контент униз.
          <div className="flex items-center gap-3">
            {refreshedAgo ? (
              <span className="text-2xs text-muted-foreground">Оновлено {refreshedAgo}</span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Оновити
            </Button>
          </div>
        }
        filters={
          // На вузькому екрані чотири підписи не влазять у рядок, і останній
          // зрізало краєм. Горизонтальна прокрутка замість переносу: перемикач
          // має лишатись однією смугою.
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <SegmentedGroup className="inline-flex w-max gap-1 rounded-lg bg-muted/50 p-1">
              {FILTERS.map((key) => (
                <Button
                  key={key}
                  variant="segmented"
                  size="sm"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {INTEGRATION_FILTER_LABEL[key]}
                </Button>
              ))}
            </SegmentedGroup>
          </div>
        }
        meta={
          statuses ? (
            // Приглушено навмисно: це довідка про фон, а не заголовок. Раніше
            // поруч стояли ще лічильник і «N сервісів у списку» — три однакові
            // числа в одному рядку, з яких жодне не додавало нового.
            <div className="flex items-center gap-2 text-2xs text-muted-foreground/70">
              <span>
                Працюють {working} з {definitions.length}
              </span>
              <span className="flex items-center gap-1">
                {definitions.map((definition) => (
                  <span
                    key={definition.id}
                    className={cn(
                      "h-1 w-4 rounded-full opacity-70",
                      toneDotClass[INTEGRATION_STATE_TONE[statuses[definition.id]?.state ?? "unknown"]]
                    )}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </div>
          ) : null
        }
      />

      {!statuses && loading ? (
        <AppSectionLoader label="Читаємо стан інтеграцій…" className="mt-6" />
      ) : null}

      {groups.map(({ block, items }) => (
        <section key={block} className="mt-6 first:mt-5">
          {/* Заголовок групи показуємо лише коли груп справді дві: над єдиним
              списком він був би шумом. */}
          {groups.length > 1 ? (
            <div className="mb-3">
              <h2 className="text-xs font-semibold text-foreground">{INTEGRATION_BLOCK_LABEL[block]}</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">{INTEGRATION_BLOCK_HINT[block]}</p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((definition) => (
              <IntegrationCard
                key={definition.id}
                definition={definition}
                status={statuses![definition.id]}
                onOpen={() => setOpenId(definition.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {statuses && visible.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          У цій групі зараз порожньо. Спробуйте «Усі».
        </p>
      ) : null}

      <IntegrationSheet
        definition={openDefinition}
        status={openId && statuses ? statuses[openId] : null}
        open={openId != null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      />
    </div>
  );
}
