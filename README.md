# Magacin Eparhije zapadnoevropske

Katalog magacina Eparhije zapadnoevropske (23, rue du Simplon, 75018 Paris): 147 artikala u 12 kategorija, sa šiframa i fotografijama iz kataloga `CATALOGUE_SR_FR_EN.pptx`. **Cene vide samo članovi** čiji je mejl na listi, a porudžbina stiže kao PDF sa grbom. Članovi imaju **svoj nalog** sa svim porudžbinama, a magacin sve vodi iz **administracije** na `/admin/`, sa statistikom i listom za naručivanje.

- **Jezici:** francuski (glavni, `/`), engleski (`/en/`), srpski ćirilicom (`/sr/`).
- **Pretraga** po šifri (`P074`, radi i ćirilično `Р074`) i po nazivu na sva tri jezika, latinicom ili ćirilicom (`brojanica` nalazi `бројаница`).
- **Na ulazu** iskoči prozor: izbor jezika i mejl. Ako je mejl na listi članova, vide se cene (sajt pamti mejl na tom uređaju). „Continuer sans les prix“ vodi na katalog bez cena.
- **Količina** se bira odmah na kartici (− 1 +), u tabeli sveća i u detaljima artikla.
- **Porudžbina:** član upiše ime, parohiju, telefon, adresu i napomenu i klikne „Envoyer la commande“. Server proveri mejl, uzme cene iz baze, sačuva porudžbinu, napravi PDF na jeziku sajta i pošalje ga članu i magacinu (kad je podešeno slanje mejlova). PDF može i odmah da se preuzme. Na srpskoj strani ime naručioca ide ćirilicom („P. Jovan Pavlović“ → „о. Јован Павловић“).
- **Moj nalog** (`/compte/`, `/en/account/`, `/sr/nalog/`): član se prijavljuje kodom od 6 cifara koji mu stiže mejlom. Vidi sve svoje porudžbine sa statusom i stavkama, preuzima PDF svake porudžbine, jednim klikom poručuje isto ponovo i čuva svoje podatke (ime, parohija, telefon, adresa za dostavu) koji se sami upisuju u porudžbinu. Radi kad je podešeno slanje mejlova (vidi dole).
- **Stanje:** artikal sa stanjem 0 na sajtu piše „Épuisé“ i ne može da se naruči.
- Radi i bez JavaScript-a (ceo katalog je u HTML-u), i na telefonu.

## Administracija (`/admin/`)

Prijava korisničkim imenom (ili mejlom) i lozinkom. U administraciji:

| Odeljak | Šta se radi |
| --- | --- |
| **Artikli i stanje** | tabela svih artikala: pretraga po šifri ili nazivu, filter po kategoriji, „Nema na stanju“, „Sakriveni“. **Stanje se upisuje direktno u tabeli** (broj + Enter). Prazno polje: stanje se ne prati. Kvačica „Na sajtu“ sakriva ili prikazuje artikal. „Uredi“: šifra, kategorija, nazivi i napomene na 3 jezika, cena, jedinica (komad/kg), stanje, redosled, **fotografije** (otpremanje sa računara ili telefona, sajt ih sam smanjuje; prva je naslovna). Novi artikal: dugme „Novi artikal“. |
| **Porudžbine** | sve porudžbine sa sajta, sa stavkama. **„Označi kao izvršenu“ skida naručene količine sa stanja**; „Vrati u nove“ ih vraća. „PDF“ i „Štampaj“. Izvoz u Excel (CSV). |
| **Statistika** | za 30 dana, 90 dana, 12 meseci ili od početka: broj porudžbina, iznos, prosečna porudžbina, broj članova koji su poručili; **Za naručivanje** (artikli kojih nema, koji su pali na granicu „Poruči kad padne na“, ili kojih po prodaji poslednjih 90 dana ima za manje od mesec dana); **najviše se prodaje** (po količini ili iznosu); **najmanje se prodaje** (i šta nije poručeno nikad); promet po mesecima; članovi koji najviše poručuju. Izvoz prodaje u CSV. |
| **Sveštenstvo** | lista mejlova članova koji vide cene: dodavanje, izmena, adresa za dostavu, isključivanje pristupa. |
| **Kategorije** | nazivi na 3 jezika, redosled, prikaz (kartice ili tabela kao sveće), naslovna fotografija na početnoj. |

U artiklu se upisuje i **„Poruči kad padne na“**: kad stanje padne na taj broj, artikal dobije oznaku „poruči“ u tabeli i ide na listu za naručivanje (filter „Za naručivanje“ i Statistika). Artikli, porudžbine i prodaja se izvoze u CSV koji se otvara u Excel-u.

Izmene se na sajtu vide čim se stranica ponovo otvori (sajt čita katalog iz baze); nije potrebno ponovo objavljivati sajt.

### Administratori

Korisničko ime bez `@` je nalog `<ime>@magacin.example.com` u Supabase-u (ta adresa ne prima poštu, služi samo za prijavu). Novi administrator:

1. U Supabase-u otvori projekat → *Authentication → Users → Add user → Create new user*, upiši `ime@magacin.example.com` (ili pravi mejl) i lozinku i uključi *Auto Confirm User*.
2. U *SQL Editor* pokreni (sa tim mejlom):
   ```sql
   insert into admins (user_id, email) select id, email from auth.users where email = 'ime@magacin.example.com';
   ```
3. Preporuka: *Authentication → Sign In / Providers → Email*: isključi *Allow new users to sign up*. Nalozi članova se otvaraju sami preko servera, a bez reda u `admins` niko ne vidi administraciju.

Lozinka se menja u administraciji (dugme „Lozinka“). Ako se zaboravi, vlasnik projekta je postavlja u *Authentication → Users*.

## Objavljivanje

Gotov sajt je u folderu **`docs/`**.

**GitHub Pages (besplatno):** u repozitorijumu otvori *Settings → Pages*, pod *Build and deployment* izaberi *Deploy from a branch*, grana `main`, folder `/docs`, pa *Save*. Za minut-dva sajt je na `https://<korisnik>.github.io/eparhija-katalog/`, a administracija na `…/admin/`. (Na besplatnom GitHub nalogu repozitorijum mora biti javan.)

**Netlify ili Vercel:** poveži repozitorijum, *Publish directory* = `docs`, *Build command* ostavi prazno (ili `node build.mjs`). Radi i sa privatnim repozitorijumom.

**Sopstveni domen** (npr. `magacin.eparhija.fr`): podešava se u istim podešavanjima (*Custom domain*).

## Baza (Supabase)

Cene, stanje, sveštenici i porudžbine **nisu** u ovom repozitorijumu ni na stranici: nalaze se u bazi.

| Tabela | Šta je u njoj | Ko vidi |
| --- | --- | --- |
| `categories` | kategorije | svi |
| `products` | šifra, nazivi, napomene, **cena**, jedinica, **stanje**, fotografije, `active` | posetioci samo nazive i fotografije aktivnih artikala; cene samo sveštenici sa liste (preko funkcije `prices`); stanje i cene administratori |
| `priests` | lista članova: mejl, ime, parohija, telefon, adresa, `active` | administratori; član samo svoj red |
| `orders` | svaka porudžbina sa stavkama, zbirom i statusom | administratori; član samo svoje porudžbine |
| `admins` | nalozi administracije | samo administratori |
| `attempts` | provere mejlova (protiv nagađanja adresa) | niko |

Pristup čuva sama baza (RLS i prava po kolonama), ne stranica. Fotografije koje se otpreme iz administracije idu u Storage, u javni bucket `products`.

Dve serverske funkcije:

- `supabase/functions/prices`: mejl → cene (posle 10 pogrešnih pokušaja sa iste adrese u 15 minuta odgovara „previše pokušaja“).
- `supabase/functions/order`: mejl + stavke → porudžbina u bazi, PDF sa grbom, mejlovi; uz to šalje članu kod za prijavu na nalog i ponovo pravi PDF stare porudžbine (članu za njegove, administratoru za sve).

**Slanje mejlova** (PDF svešteniku i magacinu) radi preko servisa [Resend](https://resend.com): u Resend-u potvrdi domen magacina (DNS zapis), napravi API ključ, pa u Supabase-u (*Edge Functions → Secrets*) dodaj:

```
RESEND_API_KEY   = re_...
ORDER_FROM       = Magacin Eparhije <porudzbine@domen-magacina.fr>
WAREHOUSE_EMAIL  = magacin@domen-magacina.fr
WAREHOUSE_LANG   = sr        (jezik poruke magacinu: fr, en ili sr)
```

Dok ovo nije podešeno, porudžbina se ipak čuva (vidi se u administraciji), član dobija PDF za preuzimanje, ali **prijava na „Moj nalog“ ne radi** (kod ne može da stigne). Za probu bez sopstvenog domena: u Resend-u `ORDER_FROM = onboarding@resend.dev`; tada mejlovi stižu samo na adresu Resend naloga.

PDF je potvrda porudžbine, ne račun: francuska faktura traži i SIRET, PDV broj i druge obavezne podatke.

**Novi Supabase projekat:** primeni migracije iz `supabase/migrations/` po redu, objavi dve funkcije (`supabase functions deploy prices` i `order`, obe bez JWT provere, vidi `supabase/config.toml`), u `data/site.json` upiši `supabaseUrl` (`https://<ref>.supabase.co`) i `supabaseKey` (publishable ključ, `sb_publishable_…`, sme da bude javan), pokreni `node build.mjs` i dodaj prvog administratora (gore).

## Kontakt magacina na sajtu

U `data/site.json` upiši adresu sajta, mejl i telefon magacina:

```json
"url": "https://jombebrat.github.io/eparhija-katalog/",
"email": "magacin@primer.fr",
"phone": "+33 1 23 45 67 89"
```

Zatim pokreni `node build.mjs` i sačuvaj promene (commit). Dok je mejl prazan, na sajtu stoji isprekidano označeno polje „à compléter“.

## Za programera

`node build.mjs` (Node 18+, bez paketa) čita katalog iz baze, čuva ga u `data/catalogue.json` (bez cena i stanja) i pravi `docs/index.html`, `docs/en/`, `docs/sr/` i `docs/admin/`. Bez interneta (ili sa `OFFLINE=1`) koristi `data/catalogue.json`. Prvi prikaz stranice je iz tog snimka; u pregledaču se katalog odmah osvežava iz baze.

Tekstovi stranice (naslovi, dugmad, poruke) su u `data/strings.json`, za sva tri jezika.

```
build.mjs              pravi stranice iz podataka
data/catalogue.json    snimak kataloga iz baze (bez cena)
data/strings.json      tekstovi stranice na tri jezika
data/site.json         adresa baze, kontakt magacina, adresa sajta
supabase/              baza (migrations/) i dve serverske funkcije (functions/prices, functions/order)
docs/                  gotov sajt (ovo se objavljuje)
  admin/               administracija
  compte/, en/account/, sr/nalog/   nalog člana
  assets/css/          tokens.css, base.css, fonts.css, site.css, admin.css, account.css
  assets/js/           render.js (zajednički za build i pregledač), app.js (katalog), admin.js (administracija), account.js (nalog člana)
  assets/img/p/        fotografije artikala iz kataloga (WebP)
  assets/img/grb-*     grb SPC
  assets/fonts/        Onest (SIL Open Font License), lokalno
tools/                 skripte za izvlačenje podataka iz .pptx kataloga
```

## Šta je promenjeno u odnosu na PowerPoint katalog

- Duplirane šifre su spojene (P003, P014, P022, P074, P117, H001, H012); fotografije su sačuvane kao galerija.
- Ispravljene greške u kucanju: ДИПРИХ → ДИПТИХ, ПСЛАТИР → ПСАЛТИР, СЛАВКСЕ → СЛАВСКЕ, ТУВА → ТУБА, ВРОЈАНИЦЕ → БРОЈАНИЦЕ, БОГОРОДИЛИНЕ → БОГОРОДИЧИНЕ, ПОДЕСИЦА → ПОДЕСИВА, НО15/НО16 → H015/H016.
- Francuski: „Lampion“ → „Veilleuse“, „Cloche à bougies“ → „Éteignoir à bougies“, „Briquette“ → „Charbon pour encensoir“, „Sceau“ → „Sceau à pain“. Ćirilična slova u šiframa (Р, Н, А) su zamenjena latiničnim.
- Artikli od 37. do 47. slajda su podeljeni u tri kategorije: krstići i privesci, crkveni pribor, tamjan i briket.
- Sveće: format „10/1“ je protumačen kao broj sveća u kilogramu, a cena kao cena po kilogramu. Proveriti sa magacinom.
- P057 i P099 (tamjan u tubi) nemaju fotografiju u katalogu.
