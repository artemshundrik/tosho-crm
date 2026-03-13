alter table if exists tosho.customers
add column if not exists contacts jsonb;

update tosho.customers
set contacts = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'name', nullif(trim(contact_name), ''),
      'position', nullif(trim(contact_position), ''),
      'phone', nullif(trim(contact_phone), ''),
      'email', nullif(trim(contact_email), ''),
      'birthday', nullif(contact_birthday::text, '')
    )
  )
)
where (contacts is null or contacts = '[]'::jsonb)
  and (
    nullif(trim(contact_name), '') is not null or
    nullif(trim(contact_position), '') is not null or
    nullif(trim(contact_phone), '') is not null or
    nullif(trim(contact_email), '') is not null or
    nullif(contact_birthday::text, '') is not null
  );
