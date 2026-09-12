/**
 * ЗНІМОК КОЛЬОРУ-СУСІДА В OPENCART (bergamo) — чисті рядки, без мережі.
 *
 * Навіщо це окремо від завантажувача. На сторінці товару Бергамо висить
 * перелік усіх його кольорів, у кожного своя адреса й свій код, — але фото там
 * лише в того кольору, чию сторінку ми відкрили. Решта кольорів лишалась без
 * знімка: половина пулу (5144 рядки з 10085, замір 12.09.2026) — порожня
 * плитка на картці позиції прорахунку.
 *
 * Адресу решти кадрів МОЖНА вивести з батьківської, бо ім'я файлу складене з
 * номера моделі й коду кольору. Не можна лише вгадувати наосліп: чуже фото на
 * картці гірше за відсутнє (біла шапка з чорним знімком виглядає нормально й
 * доїжджає до замовника). Тому тут лише СКЛАДАННЯ кандидатів, а вибір робить
 * сайт — завантажувач питає кожну адресу HEAD-запитом і бере першу живу.
 *
 * Правил чотири, бо брендів у Бергамо дванадцять і назви файлів у них різні:
 *   voyager `V3447-03` → `v3447_03_a`    — ім'я файлу це артикул
 *   cofee   `3044-3A` → `3044-3a_01`     — код стоїть у імені рядком
 *   cofee   `CO3008.40` → `3008_40_a`    — код той самий, розділювач інший
 *   id      `40634790` → `40634_navy_a`  — замість коду слово
 *
 * А ось межа методу, і вона теж важлива: james_harvest пише в імені номер
 * завантаження (`2262052100` → `2262052-197-246825256`), якого нізвідки не
 * взяти. Такі родини лишаються без фото, і це не недогляд.
 */

/**
 * Українська назва кольору → слово, яким його називає ІМ'Я ФАЙЛУ знімка.
 * Потрібне рівно для одного випадку: у частини брендів кадр названий не кодом
 * кольору, а словом («40634_navy_a» при артикулі 40634790), і код 790 у назві
 * не з'являється взагалі — підставляти нема чого.
 *
 * ПОЛОВИНА РЯДКІВ ТУТ ВИЧИТАНА З САМОГО САЙТУ, а не з голови: слова `navy`,
 * `black`, `white`, `grey`, `greymelange`, `silvergrey`, `charcoalmelange`,
 * `red`, `yellow`, `orange`, `mint`, `blue`, `denim`, `brut`, `rope`, `aqua`,
 * `royalblue`, `offwhite` знайдені в іменах файлів, де колір рядка вже відомий.
 * Решта — звичайні англійські назви, якими торгові марки одягу підписують
 * кадри; помилка тут нічим не загрожує, бо кожна виведена адреса перед записом
 * перевіряється запитом.
 *
 * Кілька слів на колір — це черга проб, а не синоніми: сайт ужив одне з них.
 */
export const COLOR_WORDS = {
  "білий": ["white", "offwhite"],
  "молочний": ["offwhite", "cream"],
  "чорний": ["black"],
  "темно-синій": ["navy", "darkblue"],
  "темно-сіній": ["navy"],
  "синій": ["blue", "royalblue"],
  "яскраво-синій": ["blue", "royalblue"],
  "королівський синій": ["royalblue", "royal"],
  "кобальт": ["cobalt", "french", "navy"],
  "блакитний": ["skyblue", "lightblue", "aqua"],
  "морський": ["aqua", "marine"],
  "бірюзовий": ["turquoise", "aqua"],
  "сірий": ["grey", "gray"],
  "сірий меланж": ["greymelange", "greymel", "grey"],
  "світло-сірий": ["lightgrey", "grey"],
  "темно-сірий": ["darkgrey", "grey"],
  "сріблясто-сірий": ["silvergrey", "silver"],
  "сріблястий": ["silver"],
  "вугільний меланж": ["charcoalmelange", "charcoal"],
  "графітовий": ["graphite", "charcoal"],
  "червоний": ["red"],
  "бордовий": ["burgundy", "wine", "darkred"],
  "рожевий": ["pink"],
  "пастельно-рожевий": ["pastelpink", "pink"],
  "кораловий": ["coral"],
  "помаранчевий": ["orange"],
  "жовтий": ["yellow"],
  "неоновий жовтий": ["neonyellow", "yellow"],
  "зелений": ["green"],
  "темно-зелений": ["darkgreen", "bottlegreen", "green"],
  "оливковий": ["olive", "army", "khaki"],
  "лаймовий": ["lime"],
  "м'ятний": ["mint"],
  "бежевий": ["beige", "sand", "rope"],
  "світло-бежевий": ["rope", "beige", "sand"],
  "коричневий": ["brown"],
  "світло-коричневий": ["lightbrown", "camel", "brown"],
  "джинсовий": ["denim", "brut"],
  "фіолетовий": ["purple", "violet"],
  "золотий": ["gold"],
  "прозорий": ["clear", "transparent"],
};

/** Спільний початок рядків. Для артикулів родини це номер моделі. */
export function commonPrefix(list) {
  let prefix = list[0] || "";
  for (const item of list) {
    let i = 0;
    while (i < prefix.length && i < item.length && prefix[i] === item[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/** Спільне закінчення рядків. Для артикулів родини це хвіст постачальника. */
export function commonSuffix(list) {
  let suffix = list[0] || "";
  for (const item of list) {
    let i = 0;
    while (i < suffix.length && i < item.length && suffix[suffix.length - 1 - i] === item[item.length - 1 - i]) i++;
    suffix = suffix.slice(suffix.length - i);
  }
  return suffix;
}

/**
 * Постачальницький хвіст артикула («3044-6A-CO») у назвах файлів не
 * з'являється, тож перед підстановкою його треба зняти. Який він — кажуть самі
 * артикули: спільне закінчення сусідів, узяте літерами.
 */
export function familyTag(articles) {
  return (commonSuffix(articles.filter(Boolean)).match(/[A-Za-z]+$/) || [""])[0].toLowerCase();
}

/** Кадр знімка: ім'я файлу без розміру («…_a-1100x1100.jpg» → `…_a`). */
export const frameOf = (url) =>
  (String(url || "").split("/").pop() || "").replace(/(-\d+x\d+[a-z]*)?\.\w+$/i, "").toLowerCase();

const stemOf = (article) => article.toLowerCase().replace(/-/g, "_");

/**
 * Адреси, за якими МОЖЕ лежати знімок цього кольору, від найнадійнішої до
 * найслабшої. Кожна — підстановка в РЕАЛЬНЕ ім'я батьківського файлу: кадр
 * («_a») і розширення беремо з нього, а не вгадуємо.
 *
 * Адреса батька — кешована (`/image/cache/…-1100x1100.jpg`), а кандидати
 * складаються без кешу (`/image/…`), і це принципово: файл у кеші OpenCart
 * з'являється лише тоді, коли хтось ВІДКРИЄ сторінку того кольору, а оригінал
 * лежить завжди. Перша спроба вивести адресу зламалась саме на цьому — три
 * проби дали 404, і висновок був «вивести не можна».
 *
 * @param {object} p
 * @param {string} p.parentImage кешована адреса знімка кольору, чию сторінку розбираємо
 * @param {string|null} p.parentArticle артикул того кольору
 * @param {string|null} p.parentColor його назва кольору українською
 * @param {string|null} p.article артикул кольору-сусіда
 * @param {string|null} p.color назва кольору сусіда, як її дав сайт
 * @param {string} p.model спільний початок артикулів родини
 * @param {string} p.tag спільний літерний хвіст артикулів сусідів
 */
export function colorImageCandidates({ parentImage, parentArticle, parentColor, article, color, model, tag }) {
  const parts = String(parentImage || "").match(
    /^(.*)\/image\/cache\/(.+)\/([^/]+?)(?:-\d+x\d+[a-z]*)?(\.(?:jpg|jpeg|png|webp))$/i
  );
  if (!parts || !article) return [];
  const [, origin, folder, file, ext] = parts;
  const lower = file.toLowerCase();
  const out = [];
  const push = (name) => {
    const url = `${origin}/image/${folder}/${name}${ext}`;
    if (name && name.toLowerCase() !== lower && !out.includes(url)) out.push(url);
  };

  // 1. Ім'я — це артикул: замінюємо артикул цілком (voyager, james_harvest).
  const parentStem = parentArticle ? stemOf(parentArticle) : null;
  if (parentStem && lower.startsWith(parentStem)) {
    push(`${stemOf(article)}${file.slice(parentStem.length)}`);
  }

  const parentCode = parentArticle && model ? parentArticle.slice(model.length) : "";
  const code = model ? article.slice(model.length) : "";

  // 2. Ім'я містить КОД кольору рядком: міняємо лише його (voyager `v3447_03_a`,
  //    cofee `3044-3a_01`). Беремо останнє входження — код стоїть у хвості, а
  //    його цифри можуть випадково трапитись і в номері моделі.
  //
  //    ПІДСТАВЛЯЄМО МАЛИМИ Й БЕЗ ХВОСТА ПОСТАЧАЛЬНИКА. Усі 4941 назва файлу в
  //    Бергамо — у нижньому регістрі, без жодного винятку (замір 12.09.2026),
  //    а хвіст на кшталт «-CO» у них не з'являється взагалі. Тож `3044-6B-CO`
  //    підставляється як `3044-6b`: сирий код дав би гарантовано мертву адресу
  //    й зайвий запит на кожен колір.
  const trimTag = (raw) => {
    const low = raw.toLowerCase();
    const cut = tag && low.endsWith(tag) ? low.slice(0, -tag.length) : low;
    return cut.replace(/[^a-z0-9]+$/, "");
  };
  if (parentCode && code && code !== parentCode) {
    for (const form of [parentCode, stemOf(parentCode)]) {
      const i = lower.lastIndexOf(form.toLowerCase());
      if (i < 0) continue;
      for (const repl of [...new Set([trimTag(code), code.toLowerCase()])]) {
        push(file.slice(0, i) + repl + file.slice(i + form.length));
      }
    }
  }

  // 3. Код той самий, а записаний інакше («CO3008.40» → `3008_40_a`,
  //    «4360.2 CO» → `4360_2_a`). Шукаємо не рядок коду, а його СКЕЛЕТ —
  //    літери й цифри без розділювачів, — починаючи з номера моделі.
  //
  //    ЛІТЕРУ З КОДУ ВИКИДАТИ НЕ МОЖНА, і це спіймано на живій пробі: у шапок
  //    coFEE кольори різняться саме літерою (3044-6A-CO ‖ 3044-6B-CO), і
  //    правило «лишити цифри» видало всім п'ятьом один знімок. Тому скелет
  //    іде першим кандидатом, а голі цифри — лише другим.
  const skel = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const untag = (s) => (tag && s.endsWith(tag) ? s.slice(0, -tag.length) : s);
  const forms = (raw) => [...new Set([untag(skel(raw)), raw.replace(/\D/g, "")])].filter(Boolean);
  const modelDigits = (model || "").replace(/\D/g, "");
  const modelAt = modelDigits ? lower.indexOf(modelDigits) : -1;
  if (modelAt >= 0 && parentCode && code) {
    const tailFrom = modelAt + modelDigits.length;
    const tail = lower.slice(tailFrom);
    for (const pf of forms(parentCode)) {
      const i = tail.indexOf(pf);
      if (i < 0) continue;
      for (const cf of forms(code)) {
        if (cf !== pf) push(file.slice(0, tailFrom + i) + cf + file.slice(tailFrom + i + pf.length));
      }
      break;
    }
  }

  // 4. Замість коду — СЛОВО («40634_navy_a» при артикулі 40634790). Тут
  //    потрібен словник: код 790 у назві файлу не з'являється взагалі.
  const parentWords = COLOR_WORDS[String(parentColor || "").trim().toLowerCase()] || [];
  const words = COLOR_WORDS[String(color || "").trim().toLowerCase()] || [];
  for (const pw of parentWords) {
    const i = lower.lastIndexOf(pw);
    if (i < 0) continue;
    for (const w of words) if (w !== pw) push(file.slice(0, i) + w + file.slice(i + pw.length));
    break;
  }
  return out;
}

/**
 * ЗНІМОК, ЩО ПІДІЙШОВ ДВОМ КОЛЬОРАМ, НЕ БЕРЕМО НІ ОДНОМУ.
 *
 * Такий збіг означає рівно одне: підстановка з'їла не ту частину імені й
 * кольори між собою не розрізняє. Далі це був би найгірший із можливих
 * наслідків — біла шапка з чорним знімком, причому виглядало б нормально.
 *
 * Запобіжник стоїть тут, а не в самих правилах, бо ловить будь-яке з них — і
 * те, яке додадуть після нас. Батьківський кадр теж рахується зайнятим: він
 * лежить за іншою адресою (кешованою), але це той самий файл.
 */
export function dropSharedFrames(urls, parentImage) {
  const times = new Map([[frameOf(parentImage), 1]]);
  for (const url of urls) {
    if (!url) continue;
    times.set(frameOf(url), (times.get(frameOf(url)) || 0) + 1);
  }
  return urls.map((url) => (url && times.get(frameOf(url)) === 1 ? url : null));
}
