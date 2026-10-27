-- Прорахунки лідів, яких уже перевели в замовника, привʼязуються до нього (REQ-338).
--
-- ЩО БУЛО НЕ ТАК. Переведення ліда створювало замовника й видаляло ліда, але
-- прорахунки лишались з `customer_id is null`: лід тримається в прорахунку лише
-- текстом `customer_name` (див. quotes-party-name-sync.sql). Для чекліста
-- «Створити замовлення» такий прорахунок і далі належав ліду — «Ліда не
-- переведено», реквізитів і підписанта «немає», хоча в замовника все заповнено.
-- Скарга 27.10.2026 на TS-0926-0042 (ФРУТ ТАЙМ). Код переведення тепер
-- привʼязує прорахунки сам; цей файл лагодить тих, кого перевели раніше.
--
-- ЗВУЖЕНО НАВМИСНО, як і в REQ-193:
--   * збіг назви точний (з точністю до пробілів по краях) — нечіткий забрав би
--     чужі прорахунки;
--   * рівно один замовник із такою назвою в команді — двох не вгадуємо;
--   * живого ліда з такою назвою немає — інакше прорахунок, найімовірніше, його.
-- Safe to run multiple times: другий прохід не знаходить нічого.

with candidates as (
  select q.id as quote_id, min(c.id::text)::uuid as customer_id
  from tosho.quotes q
  join tosho.customers c
    on c.team_id = q.team_id
   and btrim(c.name) = btrim(q.customer_name)
  where q.customer_id is null
    and coalesce(btrim(q.customer_name), '') <> ''
    and not exists (
      select 1 from tosho.leads l
      where l.team_id = q.team_id
        and btrim(l.company_name) = btrim(q.customer_name)
    )
  group by q.id
  having count(distinct c.id) = 1
)
update tosho.quotes q
set customer_id = candidates.customer_id
from candidates
where q.id = candidates.quote_id;
