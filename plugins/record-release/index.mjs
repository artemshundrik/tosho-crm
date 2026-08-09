/**
 * Записує кожен успішний деплой в історію релізів — і піднімає у «Викочено»
 * картки запитів, чиї коміти в цей деплой приїхали.
 *
 * Друге тут не випадково: «Викочено» ставить ФАКТ деплою, а факт деплою відомий
 * рівно в цьому місці. Будь-де інше це було б чиєсь припущення, що деплой
 * стався.
 *
 * ЧОМУ onSuccess, А НЕ onPostBuild: збірка й викладка — різні стадії, і вони
 * розходяться. Ми вже ловили деплой, де збірка пройшла успішно, а викладка
 * впала на імені функції. Запис на «збірка ок» означав би, що в історії
 * лежить реліз, якого користувачі не бачили.
 *
 * ПЛАГІН НІКОЛИ НЕ ВАЛИТЬ ДЕПЛОЙ. Пропущений запис в історії коштує рядка в
 * звіті; провалений деплой коштує ~15 кредитів із бюджету ≈40 на місяць. Тому
 * всі помилки тут — попередження, а не збій.
 */

import { releaseDevRequests } from "../../scripts/lib/devRequestReleases.mjs";
import {
  collect,
  lastCommitRef,
  rangeFrom,
  rewriteSubjects,
  writeRelease,
} from "../../scripts/lib/releaseCommits.mjs";

export const onSuccess = async () => {
  const env = process.env;

  // Прев'ю й гілкові деплої в історію не йдуть: там не «зроблена робота».
  if (env.CONTEXT !== "production") {
    console.log(`[release] контекст ${env.CONTEXT} — пропускаємо`);
    return;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[release] немає SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY у змінних збірки — " +
        "перевір, що вони мають scope «Builds». Запис пропущено."
    );
    return;
  }

  try {
    const head = env.COMMIT_REF ?? "HEAD";
    const lastRef = await lastCommitRef(env);

    // Той самий коміт може прийти повторним деплоєм — порівнюємо коротко, бо
    // ручний скрипт і плагін пишуть sha різної довжини.
    if (lastRef && lastRef.slice(0, 8) === head.slice(0, 8)) {
      console.log("[release] цей коміт уже записаний");
      return;
    }

    const changes = collect(rangeFrom(lastRef));

    if (changes.length === 0) {
      console.log("[release] нових комітів немає");
      return;
    }

    const plain = await rewriteSubjects(changes, env);
    const enriched = changes.map((change) =>
      plain.has(change.sha) ? { ...change, plain: plain.get(change.sha) } : change
    );

    await writeRelease(head, enriched, env);
    console.log(
      `[release] записано ${enriched.length} змін, переказано ${plain.size}`
    );

    // Дошка запитів: картки, чиї коміти приїхали цим деплоєм, стають
    // «Викочено». Свій try/catch, бо це ІНША справа: історія релізів уже
    // записана, і зривати її через недоступну дошку немає причин.
    try {
      const released = await releaseDevRequests(
        enriched.map((change) => change.sha),
        env
      );
      if (released.length > 0) {
        console.log(
          `[release] у «Викочено» переїхали картки: ${released
            .map((card) => `REQ-${card.number}`)
            .join(", ")}`
        );
      }
    } catch (error) {
      console.warn(`[release] картки запитів не оновились: ${error.message}`);
    }
  } catch (error) {
    // Свідомо не кидаємо далі: історія важлива, деплой важливіший.
    console.warn(`[release] запис не вдався: ${error.message}`);
  }
};
