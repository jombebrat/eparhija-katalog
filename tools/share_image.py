"""The link-preview image (1200x630) for each language: coat of arms, the site's name, a few articles.
Usage: python3 tools/share_image.py [outdir]   (default docs/assets/img)"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageOps
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{R}/docs/assets/img'
FD = f'{R}/supabase/functions/order/assets'
S = json.load(open(f'{R}/data/strings.json'))
W, H, K = 1200, 630, 2   # drawn at 2x, then reduced
bg, ink, muted, rule = '#FDFCFA', '#161616', '#6b6b6b', '#E6E3DC'
SHOW = ['a008-1', 'h017-1', 'p063-1']
def font(w, s): return ImageFont.truetype(f'{FD}/onest-{w}.ttf', s * K)
def lines(d, text, f, width):
    out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= width * K or not cur: cur = t
        else: out.append(cur); cur = w
    return out + [cur]
for lang in ('fr', 'en', 'sr'):
    name = S[lang]['brand'].replace("'", '’')
    im = Image.new('RGB', (W * K, H * K), bg); d = ImageDraw.Draw(im)
    grb = Image.open(f'{R}/docs/assets/img/grb-480.png').convert('RGBA')
    gh = 118 * K; grb = grb.resize((round(grb.width * gh / grb.height), gh), Image.LANCZOS)
    im.paste(grb, (84 * K, 96 * K), grb)
    f = font(700, 50); y = 270 * K
    for l in lines(d, name, f, 470):
        d.text((84 * K, y), l, font=f, fill=ink); y += 62 * K
    d.text((84 * K, 506 * K), 'magacinzapadnoevropski.com', font=font(400, 24), fill=muted)
    tw, th, gap, x0 = 168, 360, 22, 640
    for i, s in enumerate(SHOW):
        x, yy = (x0 + i * (tw + gap)) * K, (118 + (i % 2) * 56) * K
        d.rounded_rectangle([x, yy, x + tw * K, yy + th * K], 18 * K, fill='#ffffff', outline=rule, width=K)
        p = Image.open(f'{R}/docs/assets/img/p/{s}.webp').convert('RGB')
        p.thumbnail(((tw - 28) * K, (th - 40) * K), Image.LANCZOS)
        im.paste(p, (x + (tw * K - p.width) // 2, yy + (th * K - p.height) // 2))
    im.resize((W, H), Image.LANCZOS).save(f'{OUT}/share-{lang}.jpg', quality=90, optimize=True)
    print('share', lang, name)
