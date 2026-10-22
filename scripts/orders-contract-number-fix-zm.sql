-- Договір замовлення TO-1026-0005 (колишнє ZM-1026-0005) мав номер ZM-1026-0005:
-- його створили до нумерації договорів за датою (scripts/orders-specification-numbering.sql),
-- і номером записався номер замовлення. Ставимо номер за правилом: ДД/ММ/РРРР-NNN
-- від дати договору. Інших договорів за 19.10.2026 немає, тож це 001.
-- Погодження договору з відбитком старого номера стане «зміненим» — треба погодити наново.

update tosho.orders
set contract_number = to_char(contract_date, 'DD/MM/YYYY') || '-001'
where contract_number = 'ZM-1026-0005'
  and contract_date = date '2026-10-19'
  and not exists (
    select 1 from tosho.orders o where o.contract_number like '19/10/2026-%'
  );

select quote_number, contract_number, contract_date from tosho.orders where quote_number = 'TO-1026-0005';
