# Magacinski katalog Eparhije zapadnoevropske

Izložbeni sajt magacina: 137 artikala u 11 kategorija i tabela voštanih sveća, sa šiframa i fotografijama iz kataloga `CATALOGUE_SR_FR_EN.pptx`. **Cene vide samo sveštenici** čiji je mejl na spisku, a porudžbina stiže kao PDF.

- **Jezici:** francuski (glavni, `/`), engleski (`/en/`), srpski ćirilicom (`/sr/`).
- **Pretraga** po šifri (`P074`, radi i ćirilično `Р074`) i po nazivu na sva tri jezika, latinicom ili ćirilicom (`brojanica` nalazi `бројаница`).
- **Na ulazu** iskoči prozor: izbor jezika i mejl. Ako je mejl na spisku sveštenstva, vide se cene (sajt pamti mejl na tom uređaju). „Continuer sans les prix" vodi na katalog bez cena.
- **Količina** se bira odmah na kartici (− 1 +), u tabeli sveća (kg) i u detaljima artikla.
- **Porudžbina:** sveštenik u listi upiše ime, parohiju, telefon, adresu i napomenu i klikne „Envoyer la commande". Server proveri mejl, uzme cene iz baze, sačuva porudžbinu, napravi PDF na jeziku sajta i pošalje ga svešteniku i magacinu (kad je podešeno slanje mejlova). PDF može i odmah da se preuzme.
- Radi i bez JavaScript-a (ceo katalog je u HTML-u), i na telefonu.

## Objavljivanje

Gotov sajt je u folderu **`docs/`**. Nije potreban server ni baza.

**GitHub Pages (besplatno):** u repozitorijumu otvori *Settings → Pages*, pod *Build and deployment* izaberi *Deploy from a branch*, grana `main`, folder `/docs`, pa *Save*. Za minut-dva sajt je na `https://<korisnik>.github.io/eparhija-katalog/`. (Na besplatnom GitHub nalogu repozitorijum mora biti javan.)

**Netlify ili Vercel:** poveži repozitorijum, *Publish directory* = `docs`, *Build command* ostavi prazno (ili `node build.mjs`). Radi i sa privatnim repozitorijumom.

**Sopstveni domen** (npr. `katalog.eparhija.fr`): podešava se u istim podešavanjima (*Custom domain*).

## Cene, sveštenici i porudžbine (Supabase)

Cene **nisu** u ovom repozitorijumu ni na stranici: nalaze se u bazi (Supabase), u tabeli `products`. Stranica ih dobija od servera tek kad sveštenik upiše mejl koji je na spisku.

| Tabela | Šta je u njoj | Ko je menja |
| --- | --- | --- |
| `priests` | mejl, ime, parohija, telefon, `active` | magacin: novi red za svakog sveštenika; `active = false` ukida pristup |
| `products` | šifra, nazivi na 3 jezika, **cena**, jedinica (`piece` ili `kg`) | magacin: menja cene |
| `orders` | svaka poslata porudžbina sa stavkama i zbirom | samo čitanje |
| `attempts` | provere mejlova (čuva se dan), protiv nagađanja adresa | niko |

Sve se uređuje u Supabase kontrolnoj tabli, *Table Editor*, kao u Excelu. Tabele su zatvorene za javni pristup (RLS), čitaju ih samo dve funkcije:

- `supabase/functions/prices`: mejl → cene (posle 10 pogrešnih pokušaja sa iste adrese u 15 minuta odgovara „previše pokušaja").
- `supabase/functions/order`: mejl + stavke → porudžbina u bazi, PDF, mejlovi.

**Slanje mejlova** (PDF svešteniku i magacinu) radi preko servisa [Resend](https://resend.com): u Resend-u potvrdi domen magacina (DNS zapis), napravi API ključ, pa u Supabase-u (*Edge Functions → Secrets*) dodaj:

```
RESEND_API_KEY   = re_...
ORDER_FROM       = Magacin Eparhije <porudzbine@domen-magacina.fr>
WAREHOUSE_EMAIL  = magacin@domen-magacina.fr
WAREHOUSE_LANG   = sr        (jezik poruke magacinu: fr, en ili sr)
```

Dok ovo nije podešeno, porudžbina se ipak čuva u tabeli `orders`, a sveštenik dobija PDF za preuzimanje.

**Novi Supabase projekat:** primeni `supabase/migrations/…_catalogue.sql`, unesi artikle i cene u `products`, objavi dve funkcije (`supabase functions deploy prices` i `order`, obe bez JWT provere, vidi `supabase/config.toml`), pa u `data/site.json` upiši `supabaseUrl` (https://<ref>.supabase.co) i `supabaseKey` (publishable ključ, `sb_publishable_…`, sme da bude javan) i pokreni `node build.mjs`.

## Pre objavljivanja: kontakt magacina

Otvori `data/site.json` i upiši:

```json
"url": "https://jombebrat.github.io/eparhija-katalog/",
"email": "magacin@primer.fr",
"phone": "+33 1 23 45 67 89",
"address": { "fr": "…", "en": "…", "sr": "…" }
```

Zatim pokreni `node build.mjs` i sačuvaj promene (commit). Dok je e-pošta prazna, dugme „Envoyer par e-mail" je isključeno i na sajtu stoje isprekidano označena polja „à compléter".

## Izmene artikala

Nazivi, kategorije i fotografije su u **`data/catalogue.json`** (cene su u bazi, vidi gore):

```json
{ "code": "P074", "cat": "icones",
  "name": { "fr": "Icône Nika, moyenne", "en": "Nika icon, medium", "sr": "Икона Ника, средња" },
  "photos": [{ "file": "p074-1", ... }] }
```

1. Promeni naziv ili kategoriju (`cat` je jedna od: `encensoirs, icones, chandeliers, veilleuses, croix, pendentifs, culte, encens, chapelets, enfants, livres`).
2. Pokreni `node build.mjs` (potreban je samo Node 18+, bez instalacije paketa).
   Novi artikal treba dodati i u tabelu `products` u bazi, sa istom šifrom i cenom.
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
supabase/              baza (migrations/) i dve serverske funkcije (functions/prices, functions/order)
docs/                  gotov sajt (ovo se objavljuje)
  assets/css/          tokens.css, base.css, fonts.css, site.css
  assets/js/app.js     pretraga, kategorije, detalji artikla, lista
  assets/img/p/        fotografije artikala (WebP)
  assets/fonts/        Onest (SIL Open Font License), lokalno, bez Google Fonts
tools/                 skripte za izvlačenje podataka iz .pptx kataloga
```
