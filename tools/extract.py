import re, json, sys, os
from defusedxml import minidom
base = sys.argv[1]
NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
def text_of(node):
    paras = []
    for p in node.getElementsByTagNameNS(NS_A, 'p'):
        t = ''.join(x.firstChild.data if x.firstChild else '' for x in p.getElementsByTagNameNS(NS_A, 't'))
        paras.append(t)
    return '\n'.join(paras).strip()
def xfrm(node):
    off = node.getElementsByTagNameNS(NS_A, 'off'); ext = node.getElementsByTagNameNS(NS_A, 'ext')
    o = off[0]; e = [x for x in ext if x.parentNode.localName in ('xfrm',)][0]
    return int(o.getAttribute('x')), int(o.getAttribute('y')), int(e.getAttribute('cx')), int(e.getAttribute('cy'))
out = []
for i in range(1, 69):
    p = f'{base}/ppt/slides/slide{i}.xml'
    if not os.path.exists(p): continue
    doc = minidom.parse(p)
    rels = open(f'{base}/ppt/slides/_rels/slide{i}.xml.rels', encoding='utf8').read()
    relmap = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="\.\./media/([^"]+)"', rels))
    relmap.update({b: a for a, b in re.findall(r'Target="\.\./media/([^"]+)"[^>]*Id="(rId\d+)"', rels)})
    pics = []
    for pic in doc.getElementsByTagName('p:pic'):
        blip = pic.getElementsByTagNameNS(NS_A, 'blip')[0]
        rid = blip.getAttribute('r:embed')
        src = pic.getElementsByTagNameNS(NS_A, 'srcRect')
        crop = {k: int(src[0].getAttribute(k) or 0) for k in 'ltrb'} if src else None
        x, y, cx, cy = xfrm(pic.getElementsByTagName('p:spPr')[0])
        pics.append(dict(media=relmap.get(rid), x=x, y=y, w=cx, h=cy, crop=crop))
    tables = []
    for gf in doc.getElementsByTagName('p:graphicFrame'):
        tbl = gf.getElementsByTagNameNS(NS_A, 'tbl')
        if not tbl: continue
        x, y, cx, cy = xfrm(gf.getElementsByTagName('p:xfrm')[0]) if gf.getElementsByTagName('p:xfrm') else (0,0,0,0)
        cols = [int(g.getAttribute('w')) for g in tbl[0].getElementsByTagNameNS(NS_A, 'gridCol')]
        rows = []
        for tr in tbl[0].getElementsByTagNameNS(NS_A, 'tr'):
            rows.append([text_of(tc) for tc in tr.getElementsByTagNameNS(NS_A, 'tc')])
        if any(c for r in rows for c in r):
            tables.append(dict(x=x, y=y, cols=cols, rows=rows))
    shapes = []
    for sp in doc.getElementsByTagName('p:sp'):
        t = text_of(sp)
        if t: shapes.append(t)
    out.append(dict(slide=i, pics=pics, tables=tables, shapes=shapes))
json.dump(out, open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
