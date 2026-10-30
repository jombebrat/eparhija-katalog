"""Options (the saint or feast of an icon) from an Erplain export, for the articles already on the site.

Usage:  python3 tools/erplain_options.py <products-with-variants-export.xlsx>  >  options.sql
Then run options.sql in Supabase (SQL editor). Running it again updates the code and the stock of each
option and keeps the labels as they were edited in the admin.

In Erplain each saint is its own article, coded after the icon it belongs to (P064/8 is a P064),
or named after it ("Icône Ђорђе/Kasirana slavska A4 P064"). Only these families are read:
"""
import re
import sys
import unicodedata

import openpyxl

FAMILIES = ['P064', 'P066', 'P074', 'P127', 'A007']

# the export's label (normalised, see key()) -> Serbian, French, English
LABELS = {
    'ђорђе': ('Св. Ђорђе', 'Saint Georges', 'St George'),
    'djordje': ('Св. Ђорђе', 'Saint Georges', 'St George'),
    'ђурђиц': ('Ђурђиц', 'Saint Georges (Đurđic)', 'St George (Đurđic)'),
    'јоаким и ана': ('Св. Јоаким и Ана', 'Saints Joachim et Anne', 'Sts Joachim and Anna'),
    'јован': ('Св. Јован', 'Saint Jean', 'St John'),
    'јован богослов': ('Св. Јован Богослов', 'Saint Jean le Théologien', 'St John the Theologian'),
    'јован крститељ': ('Св. Јован Крститељ', 'Saint Jean-Baptiste', 'St John the Baptist'),
    'крститељ': ('Св. Јован Крститељ', 'Saint Jean-Baptiste', 'St John the Baptist'),
    'јован милостиви': ('Св. Јован Милостиви', 'Saint Jean le Miséricordieux', 'St John the Merciful'),
    'јустин ћелијски': ('Св. Јустин Ћелијски', 'Saint Justin de Ćelije', 'St Justin of Ćelije'),
    'александар невски': ('Св. Александар Невски', 'Saint Alexandre Nevski', 'St Alexander Nevsky'),
    'алимпије': ('Св. Алимпије Столпник', 'Saint Alypius le Stylite', 'St Alypius the Stylite'),
    'алимпије стплпник': ('Св. Алимпије Столпник', 'Saint Alypius le Stylite', 'St Alypius the Stylite'),
    'ап. јован': ('Св. апостол Јован', 'Saint Jean, apôtre', 'St John the Apostle'),
    'ап. андреј': ('Св. апостол Андреј', 'Saint André, apôtre', 'St Andrew the Apostle'),
    'ап. лука': ('Св. апостол Лука', 'Saint Luc, apôtre', 'St Luke the Apostle'),
    'ап. марко': ('Св. апостол Марко', 'Saint Marc, apôtre', 'St Mark the Apostle'),
    'ап. тома': ('Св. апостол Тома', 'Saint Thomas, apôtre', 'St Thomas the Apostle'),
    'арх. гаврило': ('Св. архангел Гаврило', 'Archange Gabriel', 'Archangel Gabriel'),
    'арх. михаило': ('Св. архангел Михаило', 'Archange Michel', 'Archangel Michael'),
    'арх. михајло': ('Св. архангел Михаило', 'Archange Michel', 'Archangel Michael'),
    'архангел михајло': ('Св. архангел Михаило', 'Archange Michel', 'Archangel Michael'),
    'arhangel mihajlo': ('Св. архангел Михаило', 'Archange Michel', 'Archangel Michael'),
    'архиђакон стефан': ('Св. архиђакон Стефан', 'Saint Étienne, archidiacre', 'St Stephen the Archdeacon'),
    'атанасије велики': ('Св. Атанасије Велики', 'Saint Athanase le Grand', 'St Athanasius the Great'),
    'бели анђео': ('Бели анђео', 'L’Ange blanc', 'The White Angel'),
    'beli andjeo': ('Бели анђео', 'L’Ange blanc', 'The White Angel'),
    'благовести': ('Благовести', 'Annonciation', 'Annunciation'),
    'богородица': ('Пресвета Богородица', 'Mère de Dieu', 'Mother of God'),
    'богојављење': ('Богојављење', 'Théophanie', 'Theophany'),
    'божић': ('Божић', 'Nativité du Christ', 'Nativity of Christ'),
    'василије острошки': ('Св. Василије Острошки', 'Saint Basile d’Ostrog', 'St Basil of Ostrog'),
    'ваведење': ('Ваведење', 'Entrée de la Mère de Dieu au Temple', 'Entry of the Mother of God into the Temple'),
    'вазнесење': ('Вазнесење', 'Ascension', 'Ascension'),
    'василије велики': ('Св. Василије Велики', 'Saint Basile le Grand', 'St Basil the Great'),
    'василје велики': ('Св. Василије Велики', 'Saint Basile le Grand', 'St Basil the Great'),
    'васкрс': ('Васкрсење Христово', 'Résurrection du Christ', 'Resurrection of Christ'),
    'васкрсење': ('Васкрсење Христово', 'Résurrection du Christ', 'Resurrection of Christ'),
    'васкрсење лазарево': ('Васкрсење Лазарево', 'Résurrection de Lazare', 'Raising of Lazarus'),
    'влакхо и сергеј': ('Св. Сергије и Вакх', 'Saints Serge et Bacchus', 'Sts Sergius and Bacchus'),
    'сергеј и влакхо': ('Св. Сергије и Вакх', 'Saints Serge et Bacchus', 'Sts Sergius and Bacchus'),
    'воздвижење часног крста': ('Воздвижење Часног Крста', 'Exaltation de la Croix', 'Exaltation of the Cross'),
    'крстовдан': ('Крстовдан', 'Exaltation de la Croix (Krstovdan)', 'Exaltation of the Cross (Krstovdan)'),
    'врачи': ('Св. врачи Козма и Дамјан', 'Saints Côme et Damien', 'Sts Cosmas and Damian'),
    'господ': ('Господ Исус Христос', 'Le Christ', 'Christ'),
    'димитрије': ('Св. Димитрије', 'Saint Démétrius', 'St Demetrius'),
    'златоусти': ('Св. Јован Златоусти', 'Saint Jean Chrysostome', 'St John Chrysostom'),
    'зосим и јаков': ('Св. Зосима и Јаков', 'Saints Zosime et Jacques', 'Sts Zosimas and James'),
    'зосима и јаков': ('Св. Зосима и Јаков', 'Saints Zosime et Jacques', 'Sts Zosimas and James'),
    'игњатије богоносац': ('Св. Игњатије Богоносац', 'Saint Ignace le Théophore', 'St Ignatius the God-bearer'),
    'илија': ('Св. пророк Илија', 'Saint Élie, prophète', 'St Elijah the Prophet'),
    'кирило и методије': ('Св. Кирило и Методије', 'Saints Cyrille et Méthode', 'Sts Cyril and Methodius'),
    'киријак': ('Св. Киријак', 'Saint Cyriaque', 'St Cyriacus'),
    'кнез лазар': ('Св. кнез Лазар', 'Saint prince Lazare', 'St Prince Lazar'),
    'цар лазар': ('Св. цар Лазар', 'Saint tsar Lazare', 'St Tsar Lazar'),
    'константин и јелена': ('Св. Константин и Јелена', 'Saints Constantin et Hélène', 'Sts Constantine and Helen'),
    'крштење г.и.х.': ('Крштење Господње', 'Baptême du Christ', 'Baptism of Christ'),
    'ксенија': ('Св. Ксенија', 'Sainte Xénia', 'St Xenia'),
    'мала госпојина': ('Мала Госпојина', 'Nativité de la Mère de Dieu', 'Nativity of the Mother of God'),
    'рођење богородице': ('Рођење Пресвете Богородице', 'Nativité de la Mère de Dieu', 'Nativity of the Mother of God'),
    'нектарије': ('Св. Нектарије Егински', 'Saint Nectaire d’Égine', 'St Nectarios of Aegina'),
    'небеска србија': ('Небеска Србија', 'La Serbie céleste', 'Heavenly Serbia'),
    'никола': ('Св. Никола', 'Saint Nicolas', 'St Nicholas'),
    'николај велимировић': ('Св. владика Николај Велимировић', 'Saint Nicolas Velimirović', 'St Nikolaj Velimirović'),
    'николај жички': ('Св. Николај Жички', 'Saint Nicolas de Žiča', 'St Nikolaj of Žiča'),
    'пантелејмон': ('Св. Пантелејмон', 'Saint Pantéléimon', 'St Panteleimon'),
    'параскева-петка': ('Св. Петка (Параскева)', 'Sainte Parascève (Petka)', 'St Paraskeva (Petka)'),
    'петка': ('Св. Петка', 'Sainte Parascève (Petka)', 'St Paraskeva (Petka)'),
    'петка млада': ('Св. Петка, млада', 'Sainte Parascève, jeune', 'St Paraskeva, young'),
    'петка стара': ('Св. Петка, стара', 'Sainte Parascève, âgée', 'St Paraskeva, elderly'),
    'петар и павле': ('Св. апостоли Петар и Павле', 'Saints Pierre et Paul', 'Sts Peter and Paul'),
    'покров': ('Покров Пресвете Богородице', 'Protection de la Mère de Dieu', 'Protection of the Mother of God'),
    'празници': ('Празници', 'Les grandes fêtes', 'The Great Feasts'),
    'пренос моштију николаја': ('Пренос моштију Св. Николе', 'Translation des reliques de saint Nicolas', 'Translation of the relics of St Nicholas'),
    'преображење': ('Преображење', 'Transfiguration', 'Transfiguration'),
    'прокопије': ('Св. Прокопије', 'Saint Procope', 'St Procopius'),
    'распеће': ('Распеће', 'Crucifixion', 'Crucifixion'),
    'рођење јована': ('Рођење Св. Јована Крститеља', 'Nativité de saint Jean-Baptiste', 'Nativity of St John the Baptist'),
    'сава': ('Св. Сава', 'Saint Sava', 'St Sava'),
    'сава српски': ('Св. Сава Српски', 'Saint Sava de Serbie', 'St Sava of Serbia'),
    'сава освећени': ('Св. Сава Освећени', 'Saint Sabbas le Sanctifié', 'St Sabbas the Sanctified'),
    'сисоје': ('Св. Сисоје Велики', 'Saint Sisoès le Grand', 'St Sisoes the Great'),
    'серафим саровски': ('Св. Серафим Саровски', 'Saint Séraphin de Sarov', 'St Seraphim of Sarov'),
    'симеон богопримац': ('Св. Симеон Богопримац', 'Saint Siméon le Théodoque', 'St Simeon the God-receiver'),
    'симеон миротичиви': ('Св. Симеон Мироточиви', 'Saint Siméon le Myroblyte', 'St Simeon the Myrrh-streaming'),
    'симеон мироточиви': ('Св. Симеон Мироточиви', 'Saint Siméon le Myroblyte', 'St Simeon the Myrrh-streaming'),
    'симеон столпник': ('Св. Симеон Столпник', 'Saint Siméon le Stylite', 'St Simeon the Stylite'),
    'спиридон': ('Св. Спиридон', 'Saint Spyridon', 'St Spyridon'),
    'сретење': ('Сретење Господње', 'Présentation du Seigneur au Temple', 'Meeting of the Lord'),
    'стефан': ('Св. Стефан', 'Saint Étienne', 'St Stephen'),
    'стефан дечански': ('Св. Стефан Дечански', 'Saint Étienne de Dečani', 'St Stefan of Dečani'),
    'три јерарха': ('Св. Три јерарха', 'Les Trois Saints Hiérarques', 'The Three Holy Hierarchs'),
    'трифун': ('Св. Трифун', 'Saint Tryphon', 'St Tryphon'),
    'тројеручица': ('Богородица Тројеручица', 'Mère de Dieu « aux trois mains »', 'Mother of God of the Three Hands'),
    'тројица': ('Света Тројица', 'Sainte Trinité', 'Holy Trinity'),
    'усековање главе': ('Усековање главе Св. Јована', 'Décollation de saint Jean-Baptiste', 'Beheading of St John the Baptist'),
    'усекованје': ('Усековање главе Св. Јована', 'Décollation de saint Jean-Baptiste', 'Beheading of St John the Baptist'),
    'успење': ('Успење Пресвете Богородице', 'Dormition de la Mère de Dieu', 'Dormition of the Mother of God'),
    'цвети': ('Цвети', 'Entrée du Christ à Jérusalem', 'Palm Sunday'),
}
# rows of a family that are the article itself or say no saint: left out
SKIP = {'', 'petite', 'икона рам стакло', '- nika a5 p074'}

# Latin letters typed inside Cyrillic words ("Пaнтелејмон")
HOMO = str.maketrans('aeopcxAEOPCXMHTKB', 'аеорсхАЕОРСХМНТКВ')


def key(s):
    s = unicodedata.normalize('NFC', str(s or '')).strip()
    if re.search('[Ѐ-ӿ]', s):
        s = s.translate(HOMO)
    s = re.sub(r'^св\.\s*', '', s.lower())
    return re.sub(r'\s+', ' ', s).strip()


def sql(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def main(path):
    rows = list(openpyxl.load_workbook(path, data_only=True).worksheets[0].iter_rows(values_only=True))[1:]
    out, unknown = [], []
    for r in rows:
        eid, name, sku, available = r[0], str(r[1] or ''), str(r[8] or ''), r[29]
        tail = re.search(r'\b([PAHMLNK]\d{3})\s*$', name)
        parent = sku.split('/')[0] if '/' in sku else (tail.group(1) if tail else None)
        if parent not in FAMILIES or not ('/' in sku or tail):
            continue
        raw = re.sub(r'^Ic[oô]ne\s*(cadre|cartonn[ée]e)?\s*', '', name.split('/')[0], flags=re.I).strip()
        k = key(raw)
        if k in SKIP:
            continue
        if k not in LABELS:
            unknown.append(f'{sku} {name}')
            continue
        stock = max(0, int(available or 0))
        out.append((parent, sku or None, eid, *LABELS[k], stock))
    if unknown:
        sys.exit('No label for:\n  ' + '\n  '.join(unknown))
    strip = lambda s: re.sub(r'^(св\.\s*(апостол|архангел|архиђакон|пророк|врачи|владика|кнез|цар)?\s*|света\s+|пресвета\s+)', '', s.lower())
    out.sort(key=lambda o: (o[0], strip(o[3]), o[1] or ''))
    print('-- options from the Erplain export; generated by tools/erplain_options.py')
    print('insert into public.options (product, sku, erplain_id, label_sr, label_fr, label_en, stock, sort) values')
    vals, n = [], {}
    for parent, sku, eid, sr, fr, en, stock in out:
        n[parent] = n.get(parent, 0) + 10
        vals.append(f'  ({sql(parent)}, {sql(sku)}, {eid}, {sql(sr)}, {sql(fr)}, {sql(en)}, {stock}, {n[parent]})')
    print(',\n'.join(vals))
    print('on conflict (erplain_id) do update set sku = excluded.sku, stock = excluded.stock;')
    print(f'-- {len(out)} options: ' + ', '.join(f'{p} {v // 10}' for p, v in n.items()), file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
