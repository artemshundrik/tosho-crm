-- Seed contractors and suppliers from the provided Excel file
-- "Підрядники - Замовники (1).xlsx".
-- Run after scripts/contractors-schema.sql.
-- This script is intended as a one-time import into the current workspace/team.

do $$
declare
  resolved_team_id uuid;
begin
  if to_regprocedure('tosho.current_workspace_id()') is not null then
    execute 'select tosho.current_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('public.current_workspace_id()') is not null then
    execute 'select public.current_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('tosho.my_workspace_id()') is not null then
    execute 'select tosho.my_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('public.my_workspace_id()') is not null then
    execute 'select public.my_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regclass('public.team_members') is not null then
    execute 'select team_id from public.team_members where team_id is not null order by created_at asc limit 1' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regclass('tosho.memberships') is not null then
    execute 'select workspace_id from tosho.memberships where workspace_id is not null order by created_at asc limit 1' into resolved_team_id;
  end if;

  if resolved_team_id is null then
    raise exception 'Could not resolve current team_id automatically. Open the script and replace resolved_team_id manually.';
  end if;

  delete from tosho.contractors
  where team_id = resolved_team_id;

  insert into tosho.contractors (
    team_id,
    kind,
    name,
    services,
    contact_name,
    phone,
    address,
    delivery_info
  )
  values
    (resolved_team_id, 'contractor', 'Нова Пошта', 'перевозки', 'Мазанка Марія (наш менеджер)', '(067) 545-58-78', null, null),
    (resolved_team_id, 'supplier', 'Епіцентр', 'персональний менеджер', 'Слободян Валентина', '(080)020-27-27; (044)232-90-27; (093) 170-47-27', null, null),
    (resolved_team_id, 'supplier', 'Розетка', 'представник', null, null, 'doc@rozetka.com.ua', null),
    (resolved_team_id, 'contractor', 'ФОП Гуртовий', 'вантажні перевезення', null, '(063) 503-60-60', 'https://davay-pereedem.com/ua/vantazhni-perevezennia-kyiv', '(рахунки виставляли з ПДВ)'),
    (resolved_team_id, 'contractor', 'ТОВ «УЄТЛ»', 'вантажні перевезення', 'Марина (наш манеджер)', '(067) 458-49-89', 'https://moving-expert.kyiv.ua', '(рахунки виставляли з ПДВ)'),
    (resolved_team_id, 'supplier', 'ОлПак', 'скотч', 'менеджер', '(067) 962-34-25', 'https://olpak.com.ua/', null),
    (resolved_team_id, 'contractor', 'ТОВ «Грейс Груп»', 'Кашировка, висічка', 'Світлана', '(067) 665-74-24', 'м. Київ, вул. Олекси Тихого, 84 (колишня Виборська)', null),
    (resolved_team_id, 'contractor', 'ТОВ «СВ-Друк»', 'УФ-друк, шавкодрук, тамподруком, а також дтф', 'Світлана', '(050) 864-43-99', 'м. Київ, вул. Полковника Шутова, 9А', 'м. Київ, відділення №327, ЭДРПОУ 35909417, Проценко Валентин Іванович, тел. (066)607-81-01'),
    (resolved_team_id, 'contractor', 'ТОВ «Гранд Стиль»', 'Гравіювання, УФ-друк', 'Олеся', '(068) 845-70-60', 'м. Київ, вул. Новоконстянтинівська, 1Г', E'Киев, НП 181 на компанию\nГранд Стиль Интернешнл\nЭДРПОУ 41388134\nДоставка по б/н\nМаксименко Олеся (представник) (068) 845-70-60'),
    (resolved_team_id, 'contractor', 'Юнівест', 'Ширкоформат, вивіски, наружна реклама', 'Роман', '(067) 246-58-64', null, null),
    (resolved_team_id, 'contractor', '«ЧЕХ»', 'Лакування', 'Наталя, Ірина', '(050) 285-51-15, (050)- 293-55-72 sale7@cheh.kiev.ua', 'вул. Академіка Крижанівського, 4', null),
    (resolved_team_id, 'contractor', '«Карбон Сервіс»', null, 'Любов', '(050) 914-19-04', 'м. Київ, провулок Лабораторний 1, 2-й під''їзд дальній від дороги', 'Олександр (067)173-54-42; Анастасія (099)559-16-86'),
    (resolved_team_id, 'contractor', 'ТОВ «С-Майстер»', 'Вишивка', 'Тимофеєва Світлана Анатолівна', 'А', 'м. Київ, вул. Гарматна 38 А', 'Відправка адресна'),
    (resolved_team_id, 'supplier', 'ТОВ «Компанія Еней»', 'Сувенірна продукція', 'Коваль Ярина', '(067) 676-71-69', null, 'НП: Львівська обл., с. Малехів, Нова Пошта, відділення1 ЄДРПОУ 23955204'),
    (resolved_team_id, 'contractor', 'ТОВ «КОЛОРИТ»', 'штампи; висічка', 'Володя Юрій', '(050) 418-82-17 (099) 780-06-48', 'вул. Машинобудівнича, 35а (орієнтир, далі набрати Володю - він пояснить)', E'stamp_kolorit2020@ukr.net\nstamp_kolorit@ukr.net\nshtampfop@gmail.com'),
    (resolved_team_id, 'supplier', 'ТОВ «ФІРМА «Л.І.Я.»', 'гофро-картон, кашировка, висічка', 'Таня', E'(050) 334-88-28\n(044) 501-40-35\n(096) 468-52-25\n(066) 758-98-60', 'вулиця Івана Дзюби, 3', 'firmaliya@ukr.net'),
    (resolved_team_id, 'contractor', 'Підрядник наліпки', 'наліпки', 'Іван', '(093) 591-96-60', 'вул. Жилянська 101', null),
    (resolved_team_id, 'supplier', 'ТОВ «ТоТобі»', 'одяг', 'Громовий Ярослав Леонідович', '(099) 060-19-69', 'Склад -', 'м. Вишневе, відділення №1 (код 40872583)'),
    (resolved_team_id, 'contractor', 'Мазур Алла', null, 'Мазур Алла', '(067) 997-35-90', 'м. Київ, вул. Леваневського 9', 'м. Київ, Поштомат №7966'),
    (resolved_team_id, 'supplier', 'Бергамо Україна', 'одяг', 'Куциба Константин', '(067) 448-36-32', null, 'м. Вишневе, відділення №1 (код 34192206)'),
    (resolved_team_id, 'supplier', 'ТОВ «Актив Принт»', 'килимки для мишок', 'Олена Нікітіна', E'(050) 380-55-90;\n(067) 537-70-64', 'вул. Солом''янська, 3-Б', null),
    (resolved_team_id, 'supplier', 'ТОВ «ПАКАРТ»', 'пакети', 'Людмила', '(067) 407-95-45', 'м. Київ, вул. Бориспільська, 9, корпус 57', 'pakart@ukr.net'),
    (resolved_team_id, 'contractor', 'Підрядник по календарю з годинником', 'підрядник по календарю з годинником', 'Андрій', '(050) 320-86-75', 'с.Щасливе, вул. Лесі Українки, 26', null),
    (resolved_team_id, 'contractor', '«АванпостПак»', 'пакети, тиснення', 'Леся', '(096) 880-27-94', 'м. Київ, вул. Пшенична 7 А', 'Ігор (066) 182-20-24, Леся alesya22222@ukr.net'),
    (resolved_team_id, 'supplier', '«ОРІОН»', 'щоденники', 'Аня', '(099) 222-34-36', 'вул. Зоологічна, 4А', null),
    (resolved_team_id, 'contractor', 'ФОП', 'Дерево', 'Влад', '(095) 742-02-88', null, null),
    (resolved_team_id, 'contractor', 'ФОП', 'Дерево', 'Олександр', '(066) 407-65-19', null, null),
    (resolved_team_id, 'contractor', 'Центр гравірування «Гравус»', 'гравірування', 'Андрій', '(063) 550-08-98', 'пр-т Берестейський, 18', null),
    (resolved_team_id, 'contractor', 'Таргет, Байкове', 'вишивка', 'Юлія', '(066) 908-32-58', 'вул. Богунська, 38', null),
    (resolved_team_id, 'contractor', 'ВЕТАЛ', 'тиснення', 'Олена', E'+380667126243 (писати на вайбер)\n+380677056129 (телеграм)', null, null),
    (resolved_team_id, 'contractor', 'Голден Арт', 'тиснення, ламінація, лак, конгрев', '1.Шевчук Андрій, 2.Сергій', E'098 777 88 75 - прорахунки\n<info@goldenart.com.ua>\n2.Сергій, 097 608 18 89\n(таксі, відвантаження, уточнення по готовності)', null, null),
    (resolved_team_id, 'contractor', 'Evstratenko Sergey', 'виготовленя кліше', null, 'Klishe@klishe.com.ua 093 610 98 73 , 050 330 38 34', null, null),
    (resolved_team_id, 'contractor', 'ТОВ «Колібрі 72»', 'УФ-лак', 'Оксана', E'380 50 07 55 162, 380 63 678 6776 colibri72@ukr.net\npebble3009@gmail.com\nwww.colibri72.com.ua', E'вул. Олекси Тихого (Виборзька), 84\nм. Київ, 03067', null),
    (resolved_team_id, 'contractor', 'ІННЕТЕ', 'Вишивка', 'Світлана', '(050) 411-94-52', 'Червоної калини, 26А', null),
    (resolved_team_id, 'contractor', 'Юрій', 'кашировка', null, 'Юрій +380 (66) 775 72 39', 'Вул. Гулаків-Артемовських, 3. Бувша ( Алябева 3)', null),
    (resolved_team_id, 'contractor', 'ТОВ «Поліграф ЮЕЙ»', 'поліграфія', 'бухгалтер Наталія менеджер Андрій', '380 (50) 751 21 10 380 (98) 333 69 21', null, null),
    (resolved_team_id, 'contractor', 'Карбонсервіс', 'цифра', 'Катерина', 'Katya@karbon-service.com.ua', 'пров.Лабораторний, 1 (оф .202)', null),
    (resolved_team_id, 'contractor', 'Валко', 'друк на конвертах', 'Вадим', 'vadim@valko.com.ua', null, null),
    (resolved_team_id, 'contractor', 'Гамбринус', 'каширування', 'Наталя', '0675372906', 'Відрадний, 95 Е', null),
    (resolved_team_id, 'supplier', 'Інетерпап', 'папір', 'Володя', '380504215540', null, null),
    (resolved_team_id, 'contractor', 'Компанія Вернікс', 'широкоформатний друк роблять.', 'Діма', '380988679815', null, null),
    (resolved_team_id, 'contractor', 'Компанія «Гравія»', 'гравіювання', 'Сергієнко Андрій', '(063) 999-24-22', 'Вишневе Київська, 2А', null),
    (resolved_team_id, 'contractor', 'ФОП Андреев Ігор', 'гравіювання', 'Ігор', '(067) 915 04 44', 'вул. Ушинського, 40', null),
    (resolved_team_id, 'contractor', 'Ок Прінт', 'цифровий друк', 'Олексій', '380993454577', 'вул. Солом''янська, 5, оф. 120', null),
    (resolved_team_id, 'contractor', 'Цифровий друк Олег Буслюк', 'цифровий друк', 'Олег', '0993272947', 'вул. Шахтарська, 5', null),
    (resolved_team_id, 'supplier', 'ТОВ «ПАК-Ю», м.Ірпінь', 'гофроящики, коробки', null, '096-855-25-25', null, null),
    (resolved_team_id, 'supplier', E'ТОВ «КАРТ-ПАК»,\nс. Шпітьки', null, null, E'380 (67) 247-64-99,\n+380 (63) 102-23-84,\n+380 (50) 951-12-60', null, null),
    (resolved_team_id, 'supplier', 'ТОВ «БОКСПАК УКРАЇНА»', null, null, E'38 (067) 007 - 02 - 89\n+38 (097) 405 - 74 – 85', null, null),
    (resolved_team_id, 'contractor', 'Інтертехнодрук', 'друк', 'Рубанка Вікторія', E'конт тел 050/ 352-96-71\nраб. тел 044/ 238-64-60', null, null),
    (resolved_team_id, 'contractor', 'Прінтстор (формула)', 'друк', 'Максим', '(067) 401-82-34', null, null),
    (resolved_team_id, 'supplier', 'ТОВ фірма «ПромПостачСервіс»', 'папір', 'Юлія Афанасенко', '(050) 190-36-75', 'Харків', null);
end $$;

notify pgrst, 'reload schema';
