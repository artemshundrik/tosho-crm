-- Adds the free-text "Доповнення" (addendum / notes) field to quotes.
-- Surfaced in the new-quote dialog (NewQuoteDialog) and on the quote details
-- page (QuoteDetailsPage). Read/written via createQuote / updateQuote /
-- getQuoteSummary in src/lib/toshoApi.ts, all of which tolerate the column
-- being absent, so this migration is safe to apply independently.
--
-- Idempotent: safe to re-run.

alter table tosho.quotes
  add column if not exists notes text;

comment on column tosho.quotes.notes is
  'Free-text addendum / notes ("Доповнення") shown on the quote details page.';
