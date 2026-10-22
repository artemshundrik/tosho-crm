-- Замовлення з прорахунку отримують власний номер TO-…, 22.10.2026, REQ-322.
--
-- Досі замовлення з прорахунку брало номер прорахунку (TS-…): два замовлення з
-- одного прорахунку мали однаковий номер (TS-0726-0013 двічі). Тепер номер
-- видає getNextOrderNumber (src/features/orders/orderRecords.ts), а TS-… лишається
-- за прорахунком і показується в шапці замовлення «з прорахунку TS-…».
--
-- Тут — чотири наявні замовлення з TS-номерами. Номер TO-{MMYY}-{NNNN} за місяцем
-- створення; у 03, 05 і 07.2026 TO-номерів ще не було, тож лічильник з 0001.
-- Договорам цих замовлень — номер за датою (ДД/ММ/РРРР-NNN), як у нових: двом
-- без номера документ підставляв номер замовлення, двом записався TS-0726-0013.
-- Повтор безпечний: умови where тримаються за старі значення.

update tosho.orders set quote_number = 'TO-0326-0001',
  contract_number = coalesce(contract_number, '22/05/2026-001'),
  contract_date = coalesce(contract_date, date '2026-05-22')
where id = '6cc28440-0c72-4808-8512-85a8c5bf611d' and quote_number = 'TS-0326-0066';

update tosho.orders set quote_number = 'TO-0526-0001',
  contract_number = coalesce(contract_number, '29/05/2026-001'),
  contract_date = coalesce(contract_date, date '2026-05-29')
where id = 'b3e35f3c-485a-407d-a5b1-117efe2a7043' and quote_number = 'TS-0526-0024';

-- Два замовлення з одного прорахунку під одним договором — номер договору спільний.
update tosho.orders set quote_number = 'TO-0726-0001', contract_number = '29/07/2026-001'
where id = '8bfbef16-57f8-40e3-bd5a-d876d25605e9' and quote_number = 'TS-0726-0013';

update tosho.orders set quote_number = 'TO-0726-0002', contract_number = '29/07/2026-001'
where id = '75e7dc49-9865-422d-a397-9c2b8c4f378c' and quote_number = 'TS-0726-0013';

select quote_number, contract_number, contract_date from tosho.orders order by created_at;
