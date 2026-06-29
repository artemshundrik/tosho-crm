-- Add a "звідки прийшов клієнт" source field to customers (leads already have
-- tosho.leads.source). Kept as plain nullable text (no CHECK) so legacy/free-text
-- values survive; the UI constrains new entries to CUSTOMER_LEAD_SOURCES.
-- Applied to prod 2026-06-29.
ALTER TABLE tosho.customers ADD COLUMN IF NOT EXISTS source text;
