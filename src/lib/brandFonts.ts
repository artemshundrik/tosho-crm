/**
 * Фірмовий шрифт ToSho — Mariupol, накреслення Regular і Bold (брендбук, стор. 14).
 * Ним набрані документи, що їдуть замовнику: комерційна пропозиція в PDF і в HTML.
 *
 * ФАЙЛІВ У РЕПОЗИТОРІЇ НЕМАЄ — І БУТИ НЕ МАЄ. Ліцензія шрифту (Mariupol Free Font
 * EULA 2017, лежить в архіві з Rentafont) дозволяє вбудовувати його в PDF для
 * третіх осіб і підключати на сайті через @font-face, але забороняє поширювати
 * самі файли, а репозиторій публічний. Тож файли завантажені руками в публічне
 * сховище `public-assets/public/brand/fonts/`, поруч із лого, і віддаються звідти
 * як звичайний вебшрифт.
 *
 * Інший файл — під новою назвою, а не поверх старого: браузери тримають шрифт у
 * кеші й підміни не помітять.
 */
const FONT_DIR = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets/public/brand/fonts`;

export const BRAND_FONT_FAMILY = "Mariupol";
export const BRAND_FONT_REGULAR_URL = `${FONT_DIR}/Mariupol-Regular.otf`;
export const BRAND_FONT_BOLD_URL = `${FONT_DIR}/Mariupol-Bold.otf`;
