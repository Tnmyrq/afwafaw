"""
Генерирует ЗАГЛУШКИ изображений для демо-версии: фото блюд, hero, OG-картинку и иконки.
Реальные фото потом кладутся на место заглушек (см. tools/images.py и README).

    python tools/make-placeholders.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "src" / "assets" / "img"
FOOD = IMG / "food"
FOOD.mkdir(parents=True, exist_ok=True)

BG = ["#F1E2CF", "#EAD6BF", "#E6D9C8", "#DCC6AA", "#EFE6DA", "#E3CDB4"]
FOODS = ["#7FB069", "#5E9A5A", "#A9C46C", "#E05D3A", "#F29E6D", "#D9A066", "#E8C58F",
         "#8E3B5C", "#F6C445", "#C8553D", "#B5C96A", "#9C6644"]


def font(size, bold=True):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default()


def plate(size, seed, label=None):
    """Стилизованная тарелка с едой (рисуем в 2x и уменьшаем — сглаживание)."""
    rnd = random.Random(seed)
    S = size * 2
    im = Image.new("RGB", (S, S), rnd.choice(BG))
    d = ImageDraw.Draw(im)
    # мягкие «доски»/текстура фона
    for i in range(0, S, S // 7):
        shade = rnd.randint(-8, 8)
        base = im.getpixel((1, 1))
        d.rectangle([0, i, S, i + S // 14], fill=tuple(max(0, min(255, c + shade)) for c in base))
    cx = S // 2 + rnd.randint(-S // 20, S // 20)
    cy = S // 2 + rnd.randint(-S // 20, S // 20)
    R = int(S * 0.40)
    # тень
    sh = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sh).ellipse([cx - R + 20, cy - R + 40, cx + R + 20, cy + R + 40], fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(S // 30))
    im.paste((60, 40, 25), (0, 0), sh)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill="#FBFAF7")
    r2 = int(R * 0.80)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill="#F2EEE8")
    # еда секторами
    sectors = rnd.randint(3, 5)
    start = rnd.random() * math.tau
    for s in range(sectors):
        col = rnd.choice(FOODS)
        a0 = start + s * math.tau / sectors
        for _ in range(rnd.randint(28, 46)):
            a = a0 + rnd.random() * math.tau / sectors
            rr = math.sqrt(rnd.random()) * r2 * 0.85
            x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
            br = rnd.randint(S // 40, S // 16)
            shade = rnd.randint(-22, 10)  # одинаковый сдвиг по каналам — оттенок не «плывёт»
            jitter = tuple(max(0, min(255, int(col[i:i + 2], 16) + shade)) for i in (1, 3, 5))
            d.ellipse([x - br, y - br * rnd.uniform(0.7, 1), x + br, y + br], fill=jitter)
    # зелень сверху
    for _ in range(rnd.randint(8, 16)):
        a = rnd.random() * math.tau
        rr = rnd.random() * r2 * 0.7
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        d.ellipse([x - 10, y - 5, x + 10, y + 5], fill="#3E8E5E")
    im = im.filter(ImageFilter.GaussianBlur(1.2)).resize((size, size), Image.LANCZOS)
    if label:
        d = ImageDraw.Draw(im, "RGBA")
        f = font(max(14, size // 34))
        tw = d.textlength(label, font=f)
        pad = size // 60
        d.rounded_rectangle([pad * 2, size - pad * 2 - f.size - pad * 2, pad * 4 + tw, size - pad * 2],
                            radius=pad * 2, fill=(43, 33, 24, 170))
        d.text((pad * 3, size - pad * 3 - f.size), label, font=f, fill=(255, 248, 240, 255))
    return im


def main():
    # hero
    plate(900, 7, "Заглушка — замените на фото блюда").save(IMG / "hero.webp", "WEBP", quality=72, method=6)
    # галерея: полноразмер 1200 и превью 600
    for i in range(1, 13):
        big = plate(1200, 100 + i, f"Фото {i} — замените на реальное")
        big.save(FOOD / f"{i:02d}.webp", "WEBP", quality=72, method=6)
        big.resize((600, 600), Image.LANCZOS).save(FOOD / f"{i:02d}-sm.webp", "WEBP", quality=70, method=6)

    # OG 1200×630
    og = Image.new("RGB", (1200, 630), "#FFF8F0")
    p = plate(560, 7)
    mask = Image.new("L", (560, 560), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 560, 560], radius=40, fill=255)
    og.paste(p, (600, 35), mask)
    d = ImageDraw.Draw(og)
    d.rounded_rectangle([60, 70, 112, 122], radius=26, fill="#E8743B")
    d.text((128, 72), "ВкусБаланс", font=font(44), fill="#2B2118")
    d.multiline_text((60, 200), "Еда под вашу цель.\nБез голода\nи запретов", font=font(56), fill="#2B2118", spacing=10)
    d.text((60, 470), "Похудение · Набор массы · Баланс", font=font(28, bold=False), fill="#6B5A4C")
    d.rounded_rectangle([60, 530, 420, 586], radius=16, fill="#E8743B")
    d.text((86, 541), "Подобрать программу", font=font(28), fill="#FFFFFF")
    og.save(IMG / "og.jpg", "JPEG", quality=85, optimize=True, progressive=True)

    # иконки
    ico = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    di = ImageDraw.Draw(ico)
    di.ellipse([8, 8, 248, 248], fill="#E8743B")
    di.ellipse([60, 56, 140, 136], fill="#F7B267")
    di.ellipse([120, 128, 188, 196], fill="#3E8E5E")
    ico.save(IMG / "favicon.ico", sizes=[(32, 32), (48, 48)])
    touch = Image.new("RGB", (180, 180), "#FFF8F0")
    touch.paste(ico.resize((150, 150), Image.LANCZOS), (15, 15), ico.resize((150, 150), Image.LANCZOS))
    touch.save(IMG / "apple-touch-icon.png")
    (IMG / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<circle cx="16" cy="16" r="15" fill="#E8743B"/><circle cx="12" cy="12" r="5" fill="#F7B267"/>'
        '<circle cx="19.5" cy="20" r="4.2" fill="#3E8E5E"/></svg>',
        encoding="utf-8",
    )
    print("Заглушки созданы в", IMG)


if __name__ == "__main__":
    main()
