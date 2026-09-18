-- manual
-- Злити бухгалтерів у «Виплатах команді»: заглушки → справжні акаунти (REQ-291).
--
-- ЩО БУЛО НЕ ТАК. Тетяну К. і Юлію К. спершу завели у відомість заглушками без
-- акаунта (MANUAL_PAYROLL_PEOPLE у src/lib/payroll.ts, фіксовані id), щоб вести
-- їхню зарплату. Наприкінці серпня обидві прийшли в CRM справжніми
-- користувачами — і відомість показувала кожну двічі: заглушку з історією й
-- порожній або напівпорожній акаунт.
--
-- Гірше того, в акаунта Юлії лежали свої рядки за ті самі місяці: відомість
-- сама пише в базу ставку з картки співробітника, щойно місяць відкрили
-- (prefill у FinancePayroll.tsx). Там лише ставка — і місяць рахував Юлію у
-- підсумках двічі.
--
-- Заміряно на проді 18.09.2026 перед злиттям:
--   заглушка Тетяни — 3 місяці (травень–липень), 2 позначки «виплачено»;
--   заглушка Юлії   — 3 місяці (травень–липень), 2 позначки «виплачено»;
--   акаунт Тетяни   — 0 рядків;
--   акаунт Юлії     — 5 рядків (травень–вересень), усі п'ять лише зі ставкою з
--                     картки, без нотаток; 3 з них перетинаються із заглушкою;
--   інших згадок заглушок у базі немає — перевірено всі uuid-, text- і
--   jsonb-колонки схем tosho і public.
--
-- ЯК. Рядок акаунта, що лише повторює ставку заглушки, поступається рядку
-- заглушки за той самий місяць; рядок заглушки переїжджає на акаунт разом із
-- позначкою «виплачено». Рядок акаунта, де є хоч щось інше — бонус, офіційна
-- частина, аванс, нотатка чи інша ставка, — зупиняє весь скрипт: затирати
-- введене руками ми не вповноважені.
--
-- ЧОМУ -- manual: разове злиття даних, не схема. Застосовується через
-- `npm run db:apply scripts/payroll-merge-accountant-placeholders.sql`.
-- Повторний запуск безпечний: заглушок уже не буде, і все зачепить нуль рядків.

do $$
declare
  pair record;
  v_blocked int;
begin
  for pair in
    select *
      from (values
        -- заглушка                                    справжній акаунт
        ('30e3147f-3c00-45f9-ac04-91a160799efd'::uuid, '286d9ff8-b535-4e88-a473-f4a957f0d224'::uuid), -- Тетяна К.
        ('d604c8de-9976-42db-b9ec-f2f756818295'::uuid, '7f47767a-9d9b-45e5-ac3e-21667258d8f7'::uuid)  -- Юлія К.
      ) as v(placeholder_id, real_id)
  loop
    -- 1. Рядок акаунта за місяць заглушки, де є щось, крім тієї самої ставки, — стоп.
    select count(*) into v_blocked
      from tosho.payroll_entries a
      join tosho.payroll_entries p
        on p.workspace_id = a.workspace_id
       and p.period = a.period
       and p.user_id = pair.placeholder_id
     where a.user_id = pair.real_id
       and (a.base_amount <> p.base_amount
            or a.bonus_amount <> 0 or a.deduction_amount <> 0 or a.penalty_amount <> 0
            or a.personal_order_amount <> 0 or a.official_advance_amount <> 0
            or a.official_tax_amount <> 0 or a.advance_amount <> 0
            or a.note is not null);
    if v_blocked > 0 then
      raise exception 'Акаунт % має за місяці заглушки суми, введені руками (% рядк.) — злиття зупинено',
        pair.real_id, v_blocked;
    end if;

    -- 2. Позначка виплати в акаунта за той самий місяць — теж стоп: котра з двох
    --    правдива, вирішує людина, а не скрипт.
    select count(*) into v_blocked
      from tosho.finance_payout_meta a
      join tosho.finance_payout_meta p
        on p.team_id = a.team_id
       and p.period = a.period
       and p.user_id = pair.placeholder_id
     where a.user_id = pair.real_id;
    if v_blocked > 0 then
      raise exception 'Акаунт % уже має позначки виплати за місяці заглушки (% шт.) — злиття зупинено',
        pair.real_id, v_blocked;
    end if;

    -- 3. Рядки акаунта, що лише повторюють ставку, поступаються рядкам заглушки.
    delete from tosho.payroll_entries a
     using tosho.payroll_entries p
     where a.user_id = pair.real_id
       and p.user_id = pair.placeholder_id
       and p.workspace_id = a.workspace_id
       and p.period = a.period;

    -- 4. Історія заглушки переїжджає на акаунт.
    update tosho.payroll_entries set user_id = pair.real_id where user_id = pair.placeholder_id;
    update tosho.finance_payout_meta set user_id = pair.real_id where user_id = pair.placeholder_id;
  end loop;
end
$$;

-- Перевірка після застосування — заглушок не лишилось ніде, у бухгалтерів по
-- одному рядку на місяць:
--   select user_id, count(*) from tosho.payroll_entries
--    where user_id in ('30e3147f-3c00-45f9-ac04-91a160799efd', 'd604c8de-9976-42db-b9ec-f2f756818295',
--                      '286d9ff8-b535-4e88-a473-f4a957f0d224', '7f47767a-9d9b-45e5-ac3e-21667258d8f7')
--    group by user_id;
