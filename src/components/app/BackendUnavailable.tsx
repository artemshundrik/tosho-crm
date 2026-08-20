import { RefreshCw, ServerCrash } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Екран «база не відповідає».
 *
 * НАВІЩО ОКРЕМИЙ ЕКРАН. Під час аварії 20.08.2026 застосунок показував
 * «Завантаження CRM» безкінечно: бібліотека нескінченно повторювала оновлення
 * сесії, і людина не могла зрозуміти, чи щось відбувається взагалі. Показати
 * замість цього форму входу було б ще гірше — це брехня: людина спробує
 * увійти, і вхід теж не працюватиме, бо лежить та сама база.
 *
 * Тому третій стан, який каже рівно те, що є: сталось не з тобою, і від тебе
 * нічого не залежить, крім «спробувати ще раз».
 */
export function BackendUnavailable() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full tone-icon-box-warning">
          <ServerCrash className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">База не відповідає</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Це не у вас — сервер CRM зараз недоступний. Дані на місці, входити наново не треба:
          щойно звʼязок відновиться, усе відкриється як було.
        </p>
        <Button className="mt-5 gap-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Спробувати ще раз
        </Button>
      </div>
    </div>
  );
}
