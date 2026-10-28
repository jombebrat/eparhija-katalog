# Magacinski katalog Eparhije zapadnoevropske

Izložbeni sajt magacina: 137 artikala u 11 kategorija i tabela voštanih sveća, sa šiframa, cenama i fotografijama iz kataloga `CATALOGUE_SR_FR_EN.pptx`.

- **Jezici:** francuski (glavni, `/`), engleski (`/en/`), srpski ćirilicom (`/sr/`).
- **Pretraga** po šifri (`P074`, radi i ćirilično `Р074`) i po nazivu na sva tri jezika, latinicom ili ćirilicom (`brojanica` nalazi `бројаница`).
- **„Moja lista":** posetilac doda artikle i količine, pa listu pošalje e-poštom magacinu (sa šiframa i okvirnim zbirom) ili je kopira. Nema plaćanja; lista se čuva samo u pregledaču posetioca.
- Radi i bez JavaScript-a (ceo katalog je u HTML-u), i na telefonu.

## Objavljivanje

Gotov sajt je u folderu **`docs/`**. Nije potreban server ni baza.

**GitHub Pages (besplatno):** u repozitorijumu otvori *Settings → Pages*, pod *Build and deployment* izaberi *Deploy from a branch*, grana `main`, folder `/docs`, pa *Save*. Za minut-dva sajt je na `https://<korisnik>.github.io/eparhija-katalog/`. (Na besplatnom GitHub nalogu repozitorijum mora biti javan.)

**Netlify ili Vercel:** poveži repozitorijum, *Publish directory* = `docs`, *Build command* ostavi prazno (ili `node build.mjs`). Radi i sa privatnim repozitorijumom.

**Sopstveni domen** (npr. `katalog.eparhija.fr`): podešava se u istim podešavanjima (*Custom domain*).

## Pre objavljivanja: kontakt magacina

Otvori `data/site.json` i upiši:

```json
"url": "https://jombebrat.github.io/eparhija-katalog/",
"email": "magacin@primer.fr",
"phone": "+33 1 23 45 67 89",
"address": { "fr": "…", "en": "…", "sr": "…" }
```

Zatim pokreni `node build.mjs` i sačuvaj promene (commit). Dok je e-pošta prazna, dugme „Envoyer par e-mail" je isključeno i na sajtu stoje isprekidano označena polja „à compléter".

## Izmene cena i artikala

Svi artikli su u **`data/catalogue.json`**:

```json
{ "code": "P074", "price": 24.72, "cat": "icones",
  "name": { "fr": "Icône Nika, moyenne", "en": "Nika icon, medium", "sr": "Икона Ника, средња" },
  "photos": [{ "file": "p074-1", ... }] }
```

1. Promeni cenu, naziv ili kategoriju (`cat` je jedna od: `encensoirs, icones, chandeliers, veilleuses, croix, pendentifs, culte, encens, chapelets, enfants, livres`).
2. Pokreni `node build.mjs` (potreban je samo Node 18+, bez instalacije paketa).
3. Commit i push: sajt se sam ažurira.

Tekstovi stranice (naslovi, dugmad, e-mail poruka) su u `data/strings.json`, za sva tri jezika.

**Nova fotografija:** sačuvaj je kao `docs/assets/img/p/<sifra>-1.webp` (velika, oko 1400 px) i `<sifra>-1-s.webp` (mala, oko 640 px), pa u `catalogue.json` dodaj `{ "file": "<sifra>-1", "w": .., "h": .., "W": .., "H": .. }` sa dimenzijama male (`w`, `h`) i velike (`W`, `H`) slike.

**Novi katalog u PowerPoint-u:** skripte u `tools/` izvlače artikle i fotografije iz `.pptx` (vidi komentare u njima).

## Šta je promenjeno u odnosu na katalog

- Duplirane šifre su spojene (P003, P014, P022, P074, P117, H001, H012); fotografije su sačuvane kao galerija.
- Ispravljene greške u kucanju: ДИПРИХ → ДИПТИХ, ПСЛАТИР → ПСАЛТИР, СЛАВКСЕ → СЛАВСКЕ, ТУВА → ТУБА, ВРОЈАНИЦЕ → БРОЈАНИЦЕ, БОГОРОДИЛИНЕ → БОГОРОДИЧИНЕ, ПОДЕСИЦА → ПОДЕСИВА, НО15/НО16 → H015/H016.
- Francuski: „Lampion" → „Veilleuse", „Cloche à bougies" → „Éteignoir à bougies", „Briquette" → „Charbon pour encensoir", „Sceau" → „Sceau à pain". Ćirilična slova u šiframa (Р, Н, А) su zamenjena latiničnim.
- Artikli od 37. do 47. slajda su podeljeni u tri kategorije: krstići i privesci, crkveni pribor, tamjan i briket.
- Sveće: format „10/1" je protumačen kao broj sveća u kilogramu, a cena kao cena po kilogramu. Proveriti sa magacinom.
- P057 i P099 (tamjan u tubi) nemaju fotografiju u katalogu.

## Struktura

```
build.mjs              pravi docs/index.html, docs/en/, docs/sr/ iz podataka
data/catalogue.json    artikli, cene, kategorije, fotografije
data/strings.json      tekstovi stranice na tri jezika
data/site.json         kontakt magacina i adresa sajta
docs/                  gotov sajt (ovo se objavljuje)
  assets/css/          tokens.css, base.css, fonts.css, site.css
  assets/js/app.js     pretraga, kategorije, detalji artikla, lista
  assets/img/p/        fotografije artikala (WebP)
  assets/fonts/        Onest (SIL Open Font License), lokalno, bez Google Fonts
tools/                 skripte za izvlačenje podataka iz .pptx kataloga
```
