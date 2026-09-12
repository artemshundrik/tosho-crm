"""Розрізає згенерований рендер «спереду / ззаду» на два прозорі WebP.

ЧОМУ НЕ ПОРІГ ПО ЯСКРАВОСТІ І НЕ ЗАЛИВКА ВІД КРАЮ. Тканина тут майже біла:
фон 249, тіло футболки близько 235-245. Поріг з'їдає тканину, а заливка від
краю лишає білий крап — JPEG-шум робить острівці, не сполучені з рамкою кадру
(перевірено очима, коміт цього файлу тому й другий).

Тому товар шукається як ЗВ'ЯЗНИЙ ШМАТОК від центру: усе, що з ним не
з'єднане, — фон, хай яке воно світле. Діри всередині (відблиски, світліші за
поріг) повертаються окремим проходом, інакше на сорочці лишились би дірки.

Обидва боки лягають на ОДНАКОВЕ полотно з одним масштабом: координати зон
описані раз і мусять збігтися на обох боках.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT_DIR, SLUG = sys.argv[1], sys.argv[2], sys.argv[3]

# Два необов'язкові ножі понад типовий розбір.
#
# ЧЕТВЕРТИЙ АРГУМЕНТ — наскільки суворіший поріг ПОШУКУ ТІЛА (не фінальної
# маски). Фінальна маска завжди м'яка (фон мінус 3), бо тканина буває майже
# білою. Але м'який поріг ловить і м'яку тінь: у рендері горнятка наліт
# підлоги має 240-246 при фоні 249. Суворий поріг (237) тінь відкидає, зате
# вигризає найсвітліші вінця кераміки — тому ним лише ЗНАХОДИМО зв'язне тіло,
# а контур повертаємо перетином м'якої маски з трохи розширеним тілом.
#
CUT_OFFSET = float(sys.argv[4]) if len(sys.argv) > 4 else 3.0
CUT_BELOW = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else None

# ШОСТИЙ — скільки проходів ерозії зробити, шукаючи «тіло» предмета.
#
# Це головний ніж проти м'якої тіні. Поріг тут не працює в обидва боки: у
# горнятка наліт підлоги (240-246) і найсвітліші вінця кераміки (майже 249)
# лежать по один бік будь-якої межі — суворіший поріг вигризав вінця ззаду,
# а наліт лишав. Зате наліт ТОНКИЙ, а горнятко товсте: кілька проходів
# ерозії рвуть перемичку між ними, далі від центру заливається тільки тіло,
# і форма повертається розширенням назад. Нуль — не чіпати.
ERODE = int(sys.argv[6]) if len(sys.argv) > 6 else 0

CANVAS = (660, 730)   # полотно одного боку, px (показ ~330 px, тобто 2x)
MARGIN = 20
QUALITY = 80

RAW = Image.open(SRC)
# ГОТОВА АЛЬФА ПОБИВАЄ БУДЬ-ЯКУ ЕВРИСТИКУ. Коли рендер прийшов прозорим PNG,
# маска вже намальована руками художника — і тоді ані порогів, ані заливок,
# ані ножів проти тіні не треба: беремо альфу як є. Уся машинерія нижче
# лишається для непрозорих JPEG, де маску доводиться вгадувати.
HAS_ALPHA = RAW.mode in ("RGBA", "LA") or "transparency" in RAW.info
img = RAW.convert("RGBA") if HAS_ALPHA else RAW.convert("RGB")
W, H = img.size
alpha_full = img.split()[3] if HAS_ALPHA else None
gray = img.convert("L")
px = gray.load()

bg = px[2, 2]
CUT = bg - 3           # м'який поріг: ловимо навіть майже білу тканину
CORE = bg - CUT_OFFSET # суворий: ним шукаємо ТІЛО, без м'якої тіні довкола
CUT_SPLIT = bg - 20    # пошук проміжку: суворіше, інакше JPEG-шум = «вміст»
print(f"джерело {W}x{H}; альфа={'готова' if HAS_ALPHA else 'вгадуємо'}")

if HAS_ALPHA:
    ap = alpha_full.load()
    cols = [x for x in range(W) if any(ap[x, y] > 8 for y in range(0, H, 3))]
else:
    cols = [x for x in range(W) if any(px[x, y] < CUT_SPLIT for y in range(0, H, 3))]
gaps, run = [], None
colset = set(cols)
for x in range(cols[0], cols[-1] + 1):
    if x in colset:
        if run:
            gaps.append(run)
            run = None
    else:
        run = (run[0], x) if run else (x, x)
if run:
    gaps.append(run)
split = sum(max(gaps, key=lambda g: g[1] - g[0])) // 2
print(f"розріз на x={split}")


def garment_mask(half):
    """Маска товару: альфа як є, а для непрозорого джерела — зв'язний шматок."""
    if HAS_ALPHA:
        # Відсікаємо серпанок: у світшота тло не нульове, а альфа=1, і рамка
        # вмісту тоді дорівнює всьому кадру. Справжній край тут рампа 0→255 на
        # пару пікселів, тож поріг у 8 його не чіпає.
        return half.split()[3].point(lambda v: 0 if v < 8 else v)
    w, h = half.size
    g = half.convert("L")
    p = g.load()

    # 1. кандидати → чорне (0) на білому (255)
    #
    # Різ знизу стоїть САМЕ ТУТ, до пошуку зв'язного шматка, а не після нього.
    # Після — уламок тіні лишався приклеєним до предмета вздовж лінії різу й
    # їхав у маску разом із ним (видно очима на синьому тлі). До — уламок стає
    # окремим шматком, до якого заливка від центру просто не доходить.
    floor = h if CUT_BELOW is None else int(CUT_BELOW * h)
    cand = Image.new("L", (w, h), 255)
    cp = cand.load()
    for y in range(min(h, floor)):
        for x in range(w):
            if p[x, y] < CUT:
                cp[x, y] = 0

    # 2. насіння — найтемніша точка в центральній третині: там напевно тканина
    seed, best = None, 256
    for y in range(h // 3, 2 * h // 3, 4):
        for x in range(w // 3, 2 * w // 3, 4):
            if cp[x, y] == 0 and p[x, y] < best:
                best, seed = p[x, y], (x, y)
    if seed is None:   # центр порожній — шукаємо найтемнішу точку всюди
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                if cp[x, y] == 0 and p[x, y] < best:
                    best, seed = p[x, y], (x, y)
    if seed is None:
        raise SystemExit("не знайшов товару в половині кадру")

    # Ерозія шукає тіло без тонких приростів; заливка йде вже по ньому, а
    # потім форма вертається розширенням і перетином із вихідними кандидатами
    # — щоб предмет не схуднув на ширину ерозії.
    if CORE < CUT:
        strict = Image.new("L", (w, h), 255)
        sp = strict.load()
        for y in range(min(h, floor)):
            for x in range(w):
                if p[x, y] < CORE:
                    sp[x, y] = 0
        if sp[seed[0], seed[1]] != 0:
            inside = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if sp[x, y] == 0]
            if not inside:
                raise SystemExit("суворий поріг з'їв предмет — зменшіть четвертий аргумент")
            seed = min(inside, key=lambda pt: p[pt[0], pt[1]])
        ImageDraw.floodfill(strict, seed, 128, thresh=0)

        body = Image.new("L", (w, h), 0)
        bp = body.load()
        for y in range(h):
            for x in range(w):
                if sp[x, y] == 128:
                    bp[x, y] = 255
        # Розширюємо тіло назад: суворий поріг зрізає з нього світлий край, і
        # без цього предмет вийшов би обгризеним (вінця горнятка ззаду).
        for _ in range(max(ERODE, 1)):
            body = body.filter(ImageFilter.MaxFilter(5))
        bp = body.load()
        for y in range(h):
            for x in range(w):
                if cp[x, y] == 0 and bp[x, y] == 0:
                    cp[x, y] = 255

    ImageDraw.floodfill(cand, seed, 128, thresh=0)   # товар → 128

    # 3. діри: усе не-товар, не сполучене з рамкою, теж товар
    outside = Image.new("L", (w, h), 0)
    op = outside.load()
    for y in range(h):
        for x in range(w):
            if cp[x, y] != 128:
                op[x, y] = 255
    for s in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if outside.getpixel(s) == 255:
            ImageDraw.floodfill(outside, s, 64, thresh=0)
    oq = outside.load()

    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            if cp[x, y] == 128 or oq[x, y] == 255:
                mp[x, y] = 255
    return mask


halves = {"front": img.crop((0, 0, split, H)), "back": img.crop((split, 0, W, H))}
masks = {k: garment_mask(v) for k, v in halves.items()}
boxes = {k: m.getbbox() for k, m in masks.items()}
for k, b in boxes.items():
    print(f"{k}: bbox {b} → {b[2]-b[0]}x{b[3]-b[1]}")

tall = max(b[3] - b[1] for b in boxes.values())
wide = max(b[2] - b[0] for b in boxes.values())
scale = min((CANVAS[0] - 2 * MARGIN) / wide, (CANVAS[1] - 2 * MARGIN) / tall)
print(f"спільний масштаб {scale:.4f}")

for name, half in halves.items():
    # Згладжуємо лише те, що самі й вирізали: у готової альфи край уже
    # згладжений художником, і зайве розмиття робить його ватяним.
    mask = masks[name] if HAS_ALPHA else masks[name].filter(ImageFilter.GaussianBlur(0.7))
    rgba = half.convert("RGBA")
    rgba.putalpha(mask)

    b = boxes[name]
    cropped = rgba.crop(b)
    target = (round(cropped.width * scale), round(cropped.height * scale))
    cropped = cropped.resize(target, Image.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    pos = ((CANVAS[0] - target[0]) // 2, (CANVAS[1] - target[1]) // 2)
    canvas.paste(cropped, pos, cropped)

    out = f"{OUT_DIR}/{SLUG}-{name}.webp"
    canvas.save(out, "WEBP", quality=QUALITY, method=6)
    box_pct = (
        round(pos[0] / CANVAS[0] * 100, 1), round(pos[1] / CANVAS[1] * 100, 1),
        round(target[0] / CANVAS[0] * 100, 1), round(target[1] / CANVAS[1] * 100, 1),
    )
    print(f"{name}: товар у полотні {pos} {target}; у відсотках полотна {box_pct} → {out}")
