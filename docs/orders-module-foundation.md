# Orders Module Foundation

## Що вже використовується з поточної CRM

- `quotes`
  Джерело для переходу в замовлення. Базова умова: тільки статус `approved`.
- `quote_items`
  Джерело для позицій замовлення, рахунку, СП і технологічної карти.
- `customers`
  Джерело для email, телефону, реквізитів, підписанта і договору.
- `leads`
  Тимчасове джерело до конвертації в замовника. Не може бути фінальною стороною замовлення.
- `activity_log` з `action = design_task`
  Джерело для статусу погодження візуалу і макету.
- `quote_attachments`
  Джерело для макетів, візуалів і файлів, які треба відправляти клієнту разом з документами.

## Рекомендований flow

1. Менеджер завершує прорахунок і переводить його в `approved`.
2. Система перевіряє gate-умови:
   - контрагент не `lead`
   - є email і мобільний номер
   - є реквізити, повна юр. назва, ПІБ і посада підписанта
   - є позиції для переносу в замовлення
   - візуал погоджено
   - макет погоджено
3. Якщо gate пройдений, доступна дія `Створити замовлення`.
4. При створенні:
   - копіюємо метадані прорахунку в `orders`
   - переносимо затверджені позиції в `order_items`
   - генеруємо `contract`, `invoice`, `specification`, `tech_card`
   - відкриваємо канали відправки: email / Telegram / Viber

## Мінімальна модель даних для backend

- `orders`
  `id`, `team_id`, `quote_id`, `customer_id`, `number`, `status`, `payment_status`, `delivery_status`, `payment_method`, `currency`, `total`, `manager_user_id`, `pm_user_id`, `delivery_details`, `created_at`, `updated_at`
- `order_items`
  `id`, `order_id`, `quote_item_id`, `position`, `name`, `qty`, `unit`, `unit_price`, `line_total`, `metadata`
- `order_status_history`
  `id`, `order_id`, `from_status`, `to_status`, `changed_by`, `note`, `created_at`
- `order_documents`
  `id`, `order_id`, `kind`, `file_url`, `channel`, `sent_to`, `sent_at`, `created_at`
- `order_payment_events`
  `id`, `order_id`, `amount`, `currency`, `kind`, `comment`, `created_by`, `created_at`
- `order_delivery_events`
  `id`, `order_id`, `status`, `tracking_number`, `carrier`, `comment`, `created_by`, `created_at`

## Важливі правила

- Не дублювати клієнтів, дизайн чи позиції в окремих таблицях-чернетках.
- Основний статус, статус оплати і статус доставки тримати окремо.
- Створення замовлення робити транзакційно через один service/RPC:
  якщо хоча б одна gate-умова не виконана, запис `orders` не створюється.
- Для історичних прорахунків без явного `lead_id` потрібен fallback по `customer_name`, але цільовий backend краще перевести на явний `counterparty_id`.
- Позначення "які саме позиції переходять у замовлення" варто зберігати явно:
  або `quote_items.is_selected_for_order`, або окремою таблицею `quote_to_order_items`.

## Що вже зроблено у UI

- Сторінка `Замовлення` тепер показує канбан готовності по затверджених прорахунках.
- Є табличний реєстр з позиціями у вигляді рахунку.
- Є окрема карта статусів і правил інтеграції з поточними модулями.
- Для картки замовника додана обов'язкова валідація `email + мобільний номер`.
