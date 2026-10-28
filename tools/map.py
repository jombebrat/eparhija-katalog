import json, re, sys
d = json.load(open(sys.argv[1]))
CYR2LAT = str.maketrans({'Р':'P','Н':'H','А':'A','О':'0','Ν':'N'})
def parse(cell):
    t = re.sub(r'[ \t ]+', ' ', cell).strip()
    m = re.search(r'CODE\s*:\s*(.+?)\s+(?:PRIX|ЦЕН[AА])\s*:?\s*(?:€\s*)?([\d.,]+)\s*€?', t, re.S)
    if not m: return None
    head = t[:m.start()].strip()
    tail = t[m.end():].strip()
    code = re.sub(r'\s*-\s*', '-', m.group(1).strip()).translate(CYR2LAT)
    price = float(m.group(2).replace(',', '.'))
    sr, rest = [x.strip() for x in head.split('—', 1)]
    if '/' in rest:
        fr, en = [x.strip() for x in rest.split('/', 1)]
    else:
        fr, en = rest, ''
    return dict(sr=sr, fr=fr, en=en.replace('\n',' ').strip(), code=code, price=price, note=tail)
cat = None; prods = []
for s in d:
    i = s['slide']
    if not s['pics']:
        txt = (s['shapes'] + [r[0] for t in s['tables'] for r in t['rows']])
        if txt: cat = txt[0].replace('\n', ' | '); print('CATEGORY', i, cat)
        continue
    if i in (10, 66, 67):
        print('SPECIAL', i); continue
    t = max(s['tables'], key=lambda t: sum(len(c) for r in t['rows'] for c in r))
    edges = [t['x']]
    for w in t['cols']: edges.append(edges[-1] + w)
    cells = t['rows'][0]
    items = [parse(c) if c.strip() else None for c in cells]
    for k, it in enumerate(items):
        if it: it.update(slide=i, cat=cat, photos=[])
    for p in sorted(s['pics'], key=lambda p: p['x']):
        cx = p['x'] + p['w'] / 2
        k = max(0, min(len(cells) - 1, sum(1 for e in edges[1:-1] if cx > e)))
        if len([x for x in items if x]) == 1: k = next(j for j, x in enumerate(items) if x)
        if items[k]: items[k]['photos'].append(dict(media=p['media'], crop=p['crop']))
        else: print('  unlabeled photo slide', i, p['media'])
    for it in items:
        if it: prods.append(it)
        elif it is None: pass
    for k, c in enumerate(cells):
        if c.strip() and not items[k]: print('  UNPARSED', i, repr(c))
json.dump(prods, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(len(prods), 'products')
for p in prods:
    print(p['slide'], p['code'], p['price'], '|', p['sr'], '|', p['fr'], '|', p['en'], '|', len(p['photos']), p['note'][:40])
