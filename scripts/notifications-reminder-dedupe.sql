begin;

with ranked_reminder_notifications as (
  select
    id,
    row_number() over (
      partition by user_id, href
      order by
        case when read_at is null then 0 else 1 end,
        created_at asc,
        id asc
    ) as row_rank
  from public.notifications
  where href is not null
    and strpos(href, 'reminder=') > 0
)
delete from public.notifications n
using ranked_reminder_notifications r
where n.id = r.id
  and r.row_rank > 1;

create unique index if not exists notifications_user_reminder_href_unique
  on public.notifications (user_id, href)
  where href is not null
    and strpos(href, 'reminder=') > 0;

commit;

notify pgrst, 'reload schema';
