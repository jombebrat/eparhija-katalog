# CLAUDE.md: beleške za nastavak rada

Ovo čitaj prvo. Opis sajta je u `README.md`, otvorene stvari u `TODO.md`.

## Šta je ovo
Trojezični (FR glavni, EN, SR ćirilica) katalog i porudžbine magacina Eparhije zapadnoevropske ("MAGACIN ZAPADNOEVROPSKI", Pariz). Repo `jombebrat/eparhija-katalog`, grana `main`, `/docs` ide na GitHub Pages, živi na https://magacinzapadnoevropski.com/. Supabase projekat `ivzzhtaksdwbhhioilsn`. Edge funkcije: `prices`, `order`, `as-member`, `ship`.

## Pravila rada sa vlasnikom
- Razgovor na srpskom.
- Objavi odmah (commit + push) i javi hash za vraćanje (`git revert <hash>`; ako je menjana funkcija, treba je i ponovo objaviti).
- Svaki commit se završava sa:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` i `Claude-Session: <link sesije>`.
- **Lozinka mejl sandučeta se nikad ne upisuje u kod, fajlove, repo ni logove.** Živi samo u Supabase Edge Function Secrets. Imena tajni: `SMTP_USER` (contact@magacinzapadnoevropski.com), `SMTP_PASS`, `ORDER_FROM`, `WAREHOUSE_EMAIL` (opciono `RESEND_API_KEY`, `WAREHOUSE_LANG`, `SITE_URL`). Vlasniku je preporučeno da lozinku promeni i ažurira `SMTP_PASS`.
- Odluke: Erplain i dalje izdaje račune; sajt samo čuva i prosleđuje PDF računa. PDF/mejl porudžbine je "Potvrda porudžbine", ne račun. Slanje mejlova ide u pozadini (`EdgeRuntime.waitUntil`), da sajt bude brz.

## Build
- Produkcija: `OFFLINE=1 node build.mjs` (pravi `docs/`).
- Lokalni test sa mock-om: `SITE_API_URL=http://localhost:54321 OFFLINE=1 node build.mjs`, pa obavezno ponovo produkcijski build i provera `grep -rl localhost docs --include=*.html | wc -l` = 0.
- Tekstovi: `data/strings.json` (`ACCOUNT_STRINGS` lista u `build.mjs` određuje šta ide u nalog člana).

## Delovi i gde su
- Administracija: `docs/assets/js/admin/*.js` (vanilla ES moduli), stil `docs/assets/css/admin.css`. `orders.js`: lista i bočni panel porudžbine; oznaka "Izmenjena" (kad je `edited_at`) i okvir sa prvobitnim stavkama/iznosom; za otkazane: "Vrati u nove" i "Obriši porudžbinu" (dvostruka potvrda, briše i fajl računa).
- Nalog člana: `docs/assets/js/account.js` + `account.css`. Porudžbine su kartice (`.myorder`); za status `new` postoje "Izmeni" i "Otkaži" u dijalogu (`<dialog class="acdlg">`, `openEdit`, `askCancel`, `changeOrder`), posle izmene/otkazivanja iskoči toast. Za status u obradi/spremna samo poruka da je zaključano.
- Funkcija `order` (`supabase/functions/order/`): `index.ts` (rute, `finishOrder`, `memberChange` za `member-cancel`/`member-edit`), `mail.ts`, `lines.ts`, `pdf.ts`, `i18n.ts`.
  - `memberChange`: član se overava JWT-om, `orders.email` mora da bude njegov, dozvoljeno samo dok je status `new` (inače 409 `locked`); izmena sme da menja samo količine ili ukloni stavke, povećanje proverava stanje; upisuje `edited_at`, `items_original`, `total_original`; magacinu ide mejl.
- Funkcija `ship`: šalje član-u račun (PDF) kad admin označi poslato; deli `mail.ts` sa `order` (kopija, držati iste).
- Mejlovi: `mail.ts` ima `Look` i `htmlMail(subject,text,look)`: crno zaglavlje sa grbom, naslov, tekst, kod u okviru, tabela činjenica, dugme, podnožje; tekstualni deo se šalje uz HTML. SMTP: nodemailer, `mail.privateemail.com:465`; Resend je rezerva. Tekstovi mejlova su u `i18n.ts` (fr/en/sr).
- Baza: migracije u `supabase/migrations/`. `orders.status` u (`new`,`processing`,`ready`,`done`,`cancelled`). Kolone `edited_at`, `items_original`, `total_original` (migracija `20261104150000_member_changes`). Članovi menjaju porudžbine samo preko funkcije `order` (service role). RLS preko `is_admin()`. Okidači `order_stock` (stanje) i `log_status` (istorija statusa).

## Objavljivanje Edge funkcija (bez CLI-ja, preko Supabase MCP)
- `deploy_edge_function` traži **sve fajlove funkcije odjednom** (order: deno.json, mail.ts, lines.ts, pdf.ts, i18n.ts, index.ts; ship: deno.json, mail.ts, index.ts), `import_map_path: "deno.json"`, `verify_jwt: false`.
- Niz fajlova praviti pythonom `json.dumps(..., ensure_ascii=True)` (bezbedno escape-ovanje).
- Pre commit-a obrisati `supabase/functions/*/deno.lock`. Provera tipova: `deno check index.ts`.
- Iz ove sredine se ne može dohvatiti supabase.co, pa se funkcije testiraju na mock-u.

## Testiranje (lokalno)
- Statički server: `cd docs && python3 -m http.server 8765` (često se ugasi, pokrenuti ponovo).
- Mock Supabase (Deno), test nalozi i puppeteer skripte su u `tools/test/` (uputstvo u `tools/test/README.md`). Test nalozi: član otac.nikola@example.com (kod 123456), admin admin@example.com. Cene u mock-u su izmišljene.
- Skripte pokrivaju tok člana (izmena/otkazivanje), admin oznaku "Izmenjena" (treba filter "Sve") i pregled mejlova.

## Sajt u izradi (lozinka na ulazu)
`data/site.json` → `gate` ({on, salt, rounds, hash}). Dok je `on: true`, `build.mjs` ubacuje u sve javne strane (ne i `/admin/`) prekrivku "Sajt u izradi" sa poljem za lozinku; proverava se u pregledaču (PBKDF2), u repou je samo otisak, nikad lozinka. Isključivanje: `on: false`, pa `OFFLINE=1 node build.mjs` i objava. Nova lozinka: `node tools/gate-hash.mjs <lozinka>`. Ovo samo skriva sajt od posetilaca, nije prava zaštita (katalog je u javnom repou); mejlovi članovima vode na sajt, pa i oni moraju da unesu lozinku dok je uključeno.

## Nije proveravano na pravom sajtu
Stvarna isporuka mejlova (Gmail/Apple Mail, spam), SPF/DKIM PASS (podešeno, nije potvrđeno), DMARC TXT zapis (preporučen), brisanje porudžbine u pravoj bazi, prikaz prvobitnog iznosa u adminu.

## Otvoreno
Vidi `TODO.md`. Dodatno: 7 neuvezenih Erplain klijenata, Erplain API, sopstveno izdavanje računa, IBAN/Stripe/TTC-HT, SMS (Brevo), kontakt podaci na pravnoj stranici, odluka o cenama za nečlanove.
