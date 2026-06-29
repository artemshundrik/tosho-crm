-- Fix: internal quote deadline (tosho.quotes.deadline_at) loses its time-of-day.
--
-- Problem: deadline_at was a `date` column while the UI offers a date+time picker
-- (just like customer_deadline_at / design_deadline_at, which are timestamptz).
-- Any chosen time (e.g. 10:00) was silently truncated on write, and on read
-- `new Date("YYYY-MM-DD")` parses as UTC midnight -> 03:00 in Europe/Kyiv (UTC+3),
-- so every internal deadline displayed "03:00" regardless of what was entered.
--
-- Fix: promote deadline_at to `timestamp with time zone`, aligning it with the
-- other two deadline columns. Existing date-only values become UTC midnight.
-- No frontend change is required — the same combine/parse path already round-trips
-- timestamptz correctly for the sibling columns.
--
-- tosho.v_quotes_list reads deadline_at, so it must be dropped and recreated
-- around the type change (Postgres forbids altering a column a view depends on).

BEGIN;

DROP VIEW tosho.v_quotes_list;

ALTER TABLE tosho.quotes
  ALTER COLUMN deadline_at TYPE timestamptz
  USING deadline_at::timestamptz;

CREATE VIEW tosho.v_quotes_list AS
 SELECT q.id,
    q.team_id,
    q.number,
    q.status,
    q.comment,
    q.title,
    q.quote_type,
    q.print_type,
    q.currency,
    q.subtotal,
    q.discount,
    q.tax,
    q.total,
    q.created_by,
    q.assigned_to,
    q.created_at,
    q.updated_at,
    q.sent_at,
    q.decided_at,
    c.name AS customer_name,
    c.customer_type,
    NULL::numeric AS processing_minutes,
    EXTRACT(epoch FROM now() - q.updated_at) / 60::numeric AS updated_minutes_ago,
    q.deadline_at,
    q.deadline_note,
    c.logo_url AS customer_logo_url,
    q.delivery_type
   FROM tosho.quotes q
     LEFT JOIN tosho.customers c ON c.id = q.customer_id;

-- restore grants captured before the rebuild
GRANT SELECT ON tosho.v_quotes_list TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON tosho.v_quotes_list TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tosho.v_quotes_list TO service_role;

COMMIT;
