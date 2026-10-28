import json, re, sys
raw = json.load(open(sys.argv[1]))

CATS = [
 ("encensoirs",  "Encensoirs", "Censers", "Кадионице"),
 ("icones",      "Icônes", "Icons", "Иконе"),
 ("chandeliers", "Chandeliers", "Candlesticks", "Чираци"),
 ("veilleuses",  "Veilleuses", "Oil lamps", "Кандила"),
 ("croix",       "Croix", "Crosses", "Крстови"),
 ("pendentifs",  "Petites croix et pendentifs", "Small crosses and pendants", "Крстићи и привесци"),
 ("culte",       "Articles de culte", "Church supplies", "Црквени прибор"),
 ("encens",      "Encens et charbon", "Incense and charcoal", "Тамјан и брикет"),
 ("chapelets",   "Chapelets", "Prayer ropes", "Бројанице"),
 ("enfants",     "Coin enfants", "Children's corner", "Дечији кутак"),
 ("livres",      "Livres", "Books", "Књиге"),
 ("bougies",     "Bougies en cire", "Wax candles", "Воштане свеће"),
]
SLIDE_CAT = {}
for s in range(3, 8): SLIDE_CAT[s] = "encensoirs"
for s in range(9, 15): SLIDE_CAT[s] = "icones"
for s in range(16, 19): SLIDE_CAT[s] = "chandeliers"
for s in range(20, 27): SLIDE_CAT[s] = "veilleuses"
for s in range(28, 31): SLIDE_CAT[s] = "croix"
for s in range(49, 58): SLIDE_CAT[s] = "chapelets"
SLIDE_CAT[59] = "enfants"
for s in range(61, 65): SLIDE_CAT[s] = "livres"
PEND = {"P028","P135","H009","H010","P031","P035","P120","H016","H016-1","H016-2","H015","P117","H002","P032","P033","P118","P034"}
ENCENS = {"P055","P054","P056","P146","P057","P099"}

SR_FIX = {"ДИПРИХ":"ДИПТИХ","ПСЛАТИР":"ПСАЛТИР","СЛАВКСЕ":"СЛАВСКЕ","ТУВА":"ТУБА","ВРОЈАНИЦ":"БРОЈАНИЦ",
          "БОГОРОДИЛИНЕ":"БОГОРОДИЧИНЕ","ПОДЕСИЦА":"ПОДЕСИВА"}
SR_KEEP = {"ника":"Ника","књаз милош":"Књаз Милош","св. сава":"Св. Сава","а4":"А4","а5":"А5","pvc":"PVC","м.р.":"М.Р."}
def sr_case(s):
    for a,b in SR_FIX.items(): s = s.replace(a,b)
    s = s.lower()
    for a,b in SR_KEEP.items(): s = re.sub(r'(?<!\w)'+re.escape(a)+r'(?!\w)', b, s)
    return s[0].upper()+s[1:]

# hand-written names where the catalogue's own words read badly on a card alone
OVR = {
 # code: (sr, fr, en)  None keeps the cleaned catalogue text
 "P014": ("Кадионица", "Encensoir", "Censer"),
 "H007": (None, "Petit encensoir", "Small censer"),
 "H006": (None, "Grand encensoir", "Large censer"),
 "H004": ("Кадионица метална, већа", "Encensoir en métal, grand", "Metal censer, large"),
 "H005": ("Кадионица метална, мања", "Encensoir en métal, petit", "Metal censer, small"),
 "P064": (None, "Icône montée A4", "Mounted icon A4"),
 "P074": ("Икона Ника, средња", "Icône Nika, moyenne", "Nika icon, medium"),
 "P128": ("Икона Ника, најмања", "Icône Nika, très petite", "Nika icon, smallest"),
 "P127": ("Икона Ника, највећа", "Icône Nika, très grande", "Nika icon, largest"),
 "A007": ("Икона у раму са стаклом А4", "Icône encadrée sous verre A4", "Glass-framed icon A4"),
 "P063": (None, "Bénédiction de la maison", "House blessing"),
 "P137": (None, "Icône Nika encadrée", "Framed Nika icon"),
 "P073": (None, "Diptyque carte postale", "Postcard diptych"),
 "P066": ("Икона каширана мања", "Petite icône montée", "Small mounted icon"),
 "P067": ("PVC иконице", "Petites icônes en PVC", "Small PVC icons"),
 "P010": (None, "Grand chandelier", "Large candlestick"),
 "A001": (None, "Chandelier nickelé", "Nickel candlestick"),
 "A008": (None, "Chandelier doré", "Gold candlestick"),
 "P009": (None, "Petit chandelier", "Small candlestick"),
 "P016": (None, "Chandelier en céramique", "Ceramic candlestick"),
 "P015": (None, "Chandelier en céramique", "Ceramic candlestick"),
 "P004": (None, "Veilleuse Knjaz Miloš", "Knjaz Miloš oil lamp"),
 "P003": (None, "Veilleuse suspendue", "Hanging oil lamp"),
 "A003": (None, "Veilleuse suspendue", "Hanging oil lamp"),
 "A004": (None, "Veilleuse suspendue", "Hanging oil lamp"),
 "A002": ("Кандило висеће, мат", "Veilleuse suspendue, mate", "Hanging oil lamp, matte"),
 "P142": (None, "Veilleuse dorée russe", "Russian gilt oil lamp"),
 "P005": (None, "Veilleuse de table aux aigles", "Table oil lamp with eagles"),
 "P002": (None, "Veilleuse de table dentelle", "Lace table oil lamp"),
 "H001": (None, "Veilleuse de table", "Table oil lamp"),
 "P141": (None, "Veilleuse de table combinée", "Combined table oil lamp"),
 "H017": (None, "Veilleuse de table", "Table oil lamp"),
 "P132": (None, "Veilleuse de table", "Table oil lamp"),
 "A005": (None, "Veilleuse de table nickelée", "Nickel table oil lamp"),
 "A010": (None, "Veilleuse de table dorée", "Gilded table oil lamp"),
 "A011": (None, "Veilleuse de table M.R.", "Table oil lamp M.R."),
 "A012": ("Кандило стоно N.P.", "Veilleuse de table N.P.", "Table oil lamp N.P."),
 "P022": (None, "Petite croix en résine", "Small resin cross"),
 "P020": ("Крст стони са стопом, већи", "Grande croix de table", "Large table cross"),
 "P021": ("Крст стони са стопом, мањи", "Petite croix de table", "Small table cross"),
 "P131": ("Крст стони са стопом, смола", "Croix de table en résine", "Resin table cross"),
 "P136": (None, "Croix de bénédiction en résine", "Resin hand cross"),
 "P024": (None, "Croix de bénédiction", "Hand cross"),
 "P028": (None, "Petite croix en bois", "Small wooden cross"),
 "P135": (None, "Petite croix parfumée", "Scented small cross"),
 "H009": (None, "Pendentif croix", "Cross pendant"),
 "P035": (None, "Pendentif croix", "Cross pendant"),
 "P120": (None, "Pendentif croix", "Cross pendant"),
 "H016": (None, "Croix en boîte", "Cross in a box"),
 "H016-1": (None, "Croix en boîte", "Cross in a box"),
 "H016-2": (None, "Croix en boîte", "Cross in a box"),
 "H015": (None, "Croix en boîte", "Cross in a box"),
 "H002": (None, "Croix en boîte", "Cross in a box"),
 "P117": ("Крст за ауто, смола", "Croix de voiture en résine", "Resin car cross"),
 "P118": ("Крст за ауто, гравура", "Croix de voiture gravée", "Engraved car cross"),
 "P034": (None, "Croix de voiture", "Car cross"),
 "P032": (None, "Médaillon en métal", "Metal medallion"),
 "P033": ("Привезак од дрвета", "Pendentif en bois", "Wooden pendant"),
 "H011": ("Убрус", "Serviette (ubrus)", "Cloth (ubrus)"),
 "H020": (None, "Éteignoir à bougies", "Candle snuffer"),
 "P051": (None, "Rose blanche", "White rose"),
 "P052": (None, "Rose tricolore", "Tricolour rose"),
 "P019": (None, "Sceau à pain, grand", "Bread seal, large"),
 "P018": (None, "Sceau à pain, moyen", "Bread seal, medium"),
 "P017": (None, "Sceau à pain, petit", "Bread seal, small"),
 "P023": (None, "Sceau à pain, cube", "Bread seal, cube"),
 "P025": (None, "Moules pour pain de slava", "Slava bread moulds"),
 "P062": (None, "Grand aspersoir en basilic", "Large basil sprinkler"),
 "P098": (None, "Petit aspersoir en basilic", "Small basil sprinkler"),
 "P119": (None, "Boîte Mola", "Mola box"),
 "P133": (None, "Coffret de baptême", "Baptism set"),
 "P055": ("Брикет", "Charbon pour encensoir", "Censer charcoal"),
 "P054": ("Литургијски брикет", "Charbon liturgique", "Liturgical charcoal"),
 "P056": ("Фитиљ", "Mèches pour veilleuse", "Oil lamp wicks"),
 "P146": (None, "Encens de Vatopédi", "Vatopedi incense"),
 "P057": ("Тамјан у туби, обичан", "Encens en tube, ordinaire", "Tube incense, plain"),
 "P099": ("Тамјан у туби, мирисни", "Encens en tube, parfumé", "Tube incense, scented"),
 "H013": (None, "Chapelet en perles", "Pearl prayer rope"),
 "H014": (None, "Chapelets pour enfants", "Children's prayer ropes"),
 "P103": (None, "Chapelet ajustable", "Adjustable prayer rope"),
 "P037": (None, "Petite croix tressée", "Braided small cross"),
 "P040": (None, "Chapelet en pierres semi-précieuses", "Semi-precious stone prayer rope"),
 "P041": (None, "Chapelet enfant en plastique", "Children's plastic prayer rope"),
 "P043": (None, "Chapelets tressés", "Braided prayer ropes"),
 "P044": (None, "Chapelet tricolore", "Tricolour prayer rope"),
 "P047": (None, "Chapelet en verre", "Glass prayer rope"),
 "P050": (None, "Larmes de la Vierge", "Tears of the Virgin"),
 "P049": (None, "Larmes de la Vierge", "Tears of the Virgin"),
 "P046": (None, "Colliers en bois", "Wooden necklaces"),
 "P107": (None, "Chapelet en bois", "Wooden prayer rope"),
 "P104": ("Бројанице тање, подесиве", "Chapelets fins ajustables", "Thin adjustable prayer ropes"),
 "P105": (None, "Chapelet en plastique", "Plastic prayer rope"),
 "P106": (None, "Chapelet en cristal", "Crystal prayer rope"),
 "P126": ("Бројаница, танки кристал", "Chapelet fin en cristal", "Thin crystal prayer rope"),
 "P121": ("Бројанице дечије, подесиве", "Chapelet enfant ajustable", "Children's adjustable prayer rope"),
 "P109": (None, "Chapelet à pompon", "Tassel prayer rope"),
 "P111": (None, "Chapelet en soie", "Silk prayer rope"),
 "P045": (None, "Grands chapelets", "Large prayer ropes"),
 "P150": ("Златни чвор 100", "Chapelet nœud doré 100", "Golden knot prayer rope 100"),
 "P149": ("Златни чвор 50", "Chapelet nœud doré 50", "Golden knot prayer rope 50"),
 "P152": (None, "Chapelet à capuche", "Hood prayer rope"),
 "P108": (None, "Grande croix en cristal", "Large crystal cross"),
 "P151": (None, "Bracelet en boîte", "Bracelet in a box"),
 "N001": ("Коцка Св. Сава", "Cube Saint-Sava", "Saint Sava cube"),
 "P084": (None, "Sainte Écriture", "Holy Scripture"),
 "P079": (None, "Sainte Écriture (A5)", "Holy Scripture (A5)"),
 "P081": (None, "Bible pour enfants", "Children's Bible"),
 "P086": (None, "Livre de prières pour enfants", "Children's prayer book"),
 "P085": (None, "Livre de prières orthodoxe", "Orthodox prayer book"),
 "P080": (None, "Répons de la liturgie", "Responses to the Liturgy"),
 "P138": (None, "Répons de la liturgie", "Responses to the Liturgy"),
 "P134": (None, "Livre de prières", "Prayer book"),
}
FR_KEEP = ["Nika","Knjaz","Miloš","A4","A5","PVC","M.R.","N.P.","Vierge","Slava","Mola","Saint-Sava","Vatopédi","Écriture","Testament","Nouveau"]
def lat_case(s, keep):
    words = s.split(' ')
    out = []
    for i, w in enumerate(words):
        if i == 0 or w in keep: out.append(w[0].upper()+w[1:] if i == 0 else w)
        else: out.append(w.lower())
    return ' '.join(out)

NOTES = {"P137": {"fr": "Inscription personnalisable sur l'icône.", "en": "The inscription on the icon can be personalised.", "sr": "Натпис на икони може да се персонализује."}}

by_code = {}
order = []
for r in raw:
    code = r['code']
    if code in by_code:
        by_code[code]['photos'] += r['photos']
        continue
    sr, fr, en = OVR.get(code, (None, None, None))
    cat = SLIDE_CAT.get(r['slide']) or ("pendentifs" if code in PEND else "encens" if code in ENCENS else "culte")
    p = dict(code=code, price=r['price'], cat=cat,
             name=dict(fr=fr or lat_case(r['fr'], FR_KEEP), en=en or lat_case(r['en'], ["Nika","A4","A5","PVC","Bible","Liturgy","Scripture","Testament","New","Holy","Virgin"]), sr=sr or sr_case(r['sr'])),
             photos=r['photos'], slide=r['slide'])
    if code in NOTES: p['note'] = NOTES[code]
    by_code[code] = p; order.append(code)

# Nika sizes from slide 10: one photo shows all three sizes
s10 = {"media": "image18.JPG", "crop": None}
for code, price, after in (("P128", 12.36, "P074"), ("P127", 41.20, "P128")):
    sr, fr, en = OVR[code]
    by_code[code] = dict(code=code, price=price, cat="icones", name=dict(fr=fr, en=en, sr=sr), photos=[s10], slide=10)
    order.insert(order.index(after) + 1, code)
by_code["P074"]["photos"].append(s10)

prods = [by_code[c] for c in order]
# dedupe photos
for p in prods:
    seen = []; 
    for ph in p['photos']:
        if ph['media'] not in [x['media'] for x in seen]: seen.append(ph)
    p['photos'] = seen

candles = {
  "photo": {"media": None},
  "rows": [
    {"fmt": "1/1", "h": "72", "w": "4,5", "price": 23},
    {"fmt": "2/1", "h": "56", "w": "3,5", "price": 18},
    {"fmt": "3/1", "h": "50,05", "w": "3", "price": 18},
    {"fmt": "5/1", "h": "45", "w": "2,6", "price": 18},
    {"fmt": "10/1", "h": "42", "w": "1,8", "price": 18},
    {"fmt": "30/1", "h": "29", "w": "1,2", "price": 17},
    {"fmt": "50/1", "h": "26", "w": "1", "price": 17},
    {"fmt": "100/1", "h": "23", "w": "0,8", "price": 17},
    {"fmt": "200/1", "h": "24", "w": "0,4", "price": 24},
  ],
  "dikiri": {"price": 23, "per_kilo": 10}
}
json.dump(dict(categories=[dict(id=c[0], name=dict(fr=c[1], en=c[2], sr=c[3])) for c in CATS], products=prods, candles=candles),
          open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(prods), Counter(p['cat'] for p in prods))
for p in prods: print(f"{p['code']:8} {p['price']:6.2f} {p['cat']:11} {len(p['photos'])} | {p['name']['sr']} | {p['name']['fr']} | {p['name']['en']}")
