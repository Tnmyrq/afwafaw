"""
Подготовка РЕАЛЬНЫХ фото для сайта: конвертирует JPG/PNG/HEIC* в WebP нужных размеров.

    python tools/images.py папка_с_фото

Результат:
  src/assets/img/food/01.webp     — 1200 px по длинной стороне (для просмотра на весь экран)
  src/assets/img/food/01-sm.webp  — 600 px, квадрат (для сетки)
Файлы нумеруются по алфавиту исходных имён. Затем проверьте alt-тексты в content/content.json.
Если первым аргументом указать --hero файл.jpg, будет создан src/assets/img/hero.webp (900×900).

* HEIC поддерживается, если установлен pillow-heif (pip install pillow-heif).
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

try:
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "img"
EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def square(im, size):
    return ImageOps.fit(im, (size, size), Image.LANCZOS, centering=(0.5, 0.5))


def main():
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--hero":
        im = ImageOps.exif_transpose(Image.open(args[1])).convert("RGB")
        square(im, 900).save(OUT / "hero.webp", "WEBP", quality=78, method=6)
        print("hero.webp готов")
        return
    if len(args) != 1:
        print(__doc__)
        sys.exit(1)
    src = Path(args[0])
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in EXT)
    (OUT / "food").mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(files, 1):
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        big = im.copy()
        big.thumbnail((1200, 1200), Image.LANCZOS)
        big.save(OUT / "food" / f"{i:02d}.webp", "WEBP", quality=78, method=6)
        square(im, 600).save(OUT / "food" / f"{i:02d}-sm.webp", "WEBP", quality=74, method=6)
        print(f"{p.name} → food/{i:02d}.webp, food/{i:02d}-sm.webp")
    print(f"Готово: {len(files)} фото. Добавьте/проверьте записи в content/content.json → gallery.items")


if __name__ == "__main__":
    main()
