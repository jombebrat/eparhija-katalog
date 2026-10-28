import json, sys, os
from PIL import Image, ImageOps, ImageChops
src, data_in, out_dir, data_out = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
d = json.load(open(data_in))

def trim(im):
    # drop near-black bars (phone screenshots), then near-background margins, keep 6% air
    g = im.convert('L')
    w, h = im.size
    rows = [sum(g.crop((0, y, w, y + 1)).get_flattened_data()) / w for y in range(h)]
    top = next((y for y in range(h) if rows[y] > 40), 0)
    bot = next((y for y in range(h - 1, -1, -1) if rows[y] > 40), h - 1)
    im = im.crop((0, top, w, bot + 1))
    corner = im.getpixel((2, 2))
    bg = Image.new(im.mode, im.size, corner)
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 22 else 0)
    box = diff.getbbox()
    if box:
        bw, bh = box[2] - box[0], box[3] - box[1]
        # only trim when the product sits on a flat ground (box clearly smaller than frame)
        if bw * bh < 0.92 * im.size[0] * im.size[1]:
            pad = int(max(bw, bh) * 0.06)
            box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.size[0], box[2] + pad), min(im.size[1], box[3] + pad))
            im = im.crop(box)
    return im

def whitepoint(im):
    # photos shot on a near-white ground: lift that ground to pure white so it melts into the page's well
    w, h = im.size
    border = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 60)) for y in (1, h - 2)] + \
             [im.getpixel((x, y)) for y in range(0, h, max(1, h // 60)) for x in (1, w - 2)]
    border.sort(key=lambda p: sum(p))
    ref = border[int(len(border) * 0.8)]
    if sum(ref) / 3 < 190:
        return im
    scale = [min(1.3, 255 / max(1, c)) for c in ref]
    lut = []
    for k in range(3):
        lut += [min(255, int(round(v * scale[k]))) for v in range(256)]
    return im.point(lut)

def export(media, slug):
    im = Image.open(os.path.join(src, media))
    im = ImageOps.exif_transpose(im).convert('RGB')
    im = trim(im)
    im = whitepoint(im)
    large = im.copy(); large.thumbnail((1400, 1400), Image.LANCZOS)
    small = im.copy(); small.thumbnail((640, 640), Image.LANCZOS)
    large.save(os.path.join(out_dir, f'{slug}.webp'), 'WEBP', quality=82, method=6)
    small.save(os.path.join(out_dir, f'{slug}-s.webp'), 'WEBP', quality=78, method=6)
    return dict(file=slug, w=small.width, h=small.height, W=large.width, H=large.height)

cache = {}
for p in d['products']:
    slug = p['code'].lower()
    out = []
    for i, ph in enumerate(p['photos'], 1):
        if ph['media'] in cache: out.append(cache[ph['media']]); continue
        r = export(ph['media'], f'{slug}-{i}')
        cache[ph['media']] = r; out.append(r)
    p['photos'] = out
    p.pop('slide', None)
d['candles']['photos'] = [export('image145.jpeg', 'bougies-1'), export('image146.jpeg', 'bougies-2')]
d['candles'].pop('photo', None)
json.dump(d, open(data_out, 'w'), ensure_ascii=False, indent=1)
print('ok', len(cache))
