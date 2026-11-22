# Generic oil-filter wrap label (no real brand): two repeats round the can, plus a small white date/part sticker.
# Writes oil_filter_label.png (used by finish_materials.py). Needs Pillow and the DejaVu fonts (path F below).
from PIL import Image, ImageDraw, ImageFont
import random
W, H = 2048, 640
F = "/usr/share/fonts/truetype/dejavu/"
def f(name, s): return ImageFont.truetype(F + name, s)
img = Image.new("RGB", (W, H), (14, 14, 16))
d = ImageDraw.Draw(img)
ORANGE = (232, 92, 18); WHITE = (238, 236, 230); GREY = (150, 150, 155)
half = W // 2
for k in range(2):
    x0 = k * half
    d.rectangle([x0, 70, x0 + half, 92], fill=ORANGE)             # stripes
    d.rectangle([x0, H - 92, x0 + half, H - 70], fill=ORANGE)
    # slanted orange block behind the title
    d.polygon([(x0 + 40, 140), (x0 + 560, 140), (x0 + 530, 280), (x0 + 10, 280)], fill=ORANGE)
    d.text((x0 + 60, 168), "HIGH FLOW", font=f("DejaVuSans-BoldOblique.ttf", 68), fill=(16, 16, 18))
    d.text((x0 + 590, 148), "OIL", font=f("DejaVuSans-Bold.ttf", 60), fill=WHITE)
    d.text((x0 + 590, 210), "FILTER", font=f("DejaVuSans-Bold.ttf", 60), fill=WHITE)
    d.text((x0 + 40, 330), "SYNTHETIC MEDIA  •  ANTI-DRAINBACK VALVE  •  BYPASS 11 PSI", font=f("DejaVuSansCondensed-Bold.ttf", 26), fill=WHITE)
    d.text((x0 + 40, 380), "OF-454HP", font=f("DejaVuSansMono-Bold.ttf", 64), fill=ORANGE)
    d.text((x0 + 40, 470), "INSTALL: OIL GASKET, TURN 3/4 AFTER CONTACT. HAND TIGHTEN ONLY.", font=f("DejaVuSansCondensed.ttf", 21), fill=GREY)
    d.text((x0 + 40, 505), "1-1/2\"-16 UNF  •  FOR RACING AND HIGH PERFORMANCE USE", font=f("DejaVuSansCondensed.ttf", 21), fill=GREY)
# small white sticker (only once): part no, barcode, date
sx, sy = 1836, 150
d.rectangle([sx, sy, sx + 200, sy + 130], fill=(245, 244, 240), outline=(200, 200, 200))
d.text((sx + 14, sy + 8), "OF-454HP", font=f("DejaVuSansMono-Bold.ttf", 22), fill=(20, 20, 20))
random.seed(7); x = sx + 16
while x < sx + 186:
    w = random.choice((2, 2, 3, 4, 6)); d.rectangle([x, sy + 38, x + w - 1, sy + 98], fill=(15, 15, 15)); x += w + random.choice((2, 3, 4))
d.text((sx + 10, sy + 102), "LOT 25-10  QTY 1", font=f("DejaVuSansMono.ttf", 18), fill=(20, 20, 20))
img.save("oil_filter_label.png", optimize=True)
print(img.size)
