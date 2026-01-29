-- Quote status migration (old -> new)
-- Run in Supabase SQL editor after deploying frontend changes.

-- 0) If status is ENUM, add new values first (safe to run multiple times)
alter type tosho.quote_status add value if not exists 'new';
alter type tosho.quote_status add value if not exists 'estimating';
alter type tosho.quote_status add value if not exists 'estimated';
alter type tosho.quote_status add value if not exists 'awaiting_approval';
alter type tosho.quote_status add value if not exists 'cancelled';

-- 1) Update current quote statuses (compare as text to avoid enum errors)
update tosho.quotes
set status = (
case status::text
  when 'draft' then 'new'
  when 'in_progress' then 'estimating'
  when 'sent' then 'estimated'
  when 'approved' then 'approved'
  when 'rejected' then 'cancelled'
  when 'completed' then 'approved'
  when 'awaiting_approval' then 'awaiting_approval'
  when 'new' then 'new'
  when 'estimating' then 'estimating'
  when 'estimated' then 'estimated'
  when 'cancelled' then 'cancelled'
  else 'new'
end
)::tosho.quote_status;

-- 2) Update history table (if it exists)
update tosho.quote_status_history
set from_status = (
case from_status::text
  when 'draft' then 'new'
  when 'in_progress' then 'estimating'
  when 'sent' then 'estimated'
  when 'approved' then 'approved'
  when 'rejected' then 'cancelled'
  when 'completed' then 'approved'
  when 'awaiting_approval' then 'awaiting_approval'
  when 'new' then 'new'
  when 'estimating' then 'estimating'
  when 'estimated' then 'estimated'
  when 'cancelled' then 'cancelled'
  else 'new'
end
)::tosho.quote_status,
to_status = (
case to_status::text
  when 'draft' then 'new'
  when 'in_progress' then 'estimating'
  when 'sent' then 'estimated'
  when 'approved' then 'approved'
  when 'rejected' then 'cancelled'
  when 'completed' then 'approved'
  when 'awaiting_approval' then 'awaiting_approval'
  when 'new' then 'new'
  when 'estimating' then 'estimating'
  when 'estimated' then 'estimated'
  when 'cancelled' then 'cancelled'
  else 'new'
end
)::tosho.quote_status;

-- 3) Ensure default status is "new"
alter table tosho.quotes
  alter column status set default 'new';

-- NOTE:
-- If you have check constraints or RPC tosho.set_quote_status that validate status values,
-- update them to: new, estimating, estimated, awaiting_approval, approved, cancelled.
