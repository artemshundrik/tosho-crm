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

CANVAS = (660, 730)   # полотно одного боку, px (показ ~330 px, тобто 2x)
MARGIN = 20
QUALITY = 80

img = Image.open(SRC).convert("RGB")
W, H = img.size
gray = img.convert("L")
px = gray.load()

bg = px[2, 2]
CUT = bg - 3           # маска товару: ловимо навіть майже білу тканину
CUT_SPLIT = bg - 20    # пошук проміжку: суворіше, інакше JPEG-шум = «вміст»
print(f"джерело {W}x{H}; фон {bg}; поріг маски {CUT}, поріг розрізу {CUT_SPLIT}")

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
    """Маска товару: зв'язний шматок від центру, з поверненими дірками."""
    w, h = half.size
    g = half.convert("L")
    p = g.load()

    # 1. кандидати → чорне (0) на білому (255)
    cand = Image.new("L", (w, h), 255)
    cp = cand.load()
    for y in range(h):
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
    mask = masks[name].filter(ImageFilter.GaussianBlur(0.7))   # згладити контур
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
