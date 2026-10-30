# TODO

## Admin panel: ideje iz Medusinog admina

Pregledano: kako Medusa uređuje unos i izmenu robe ([kreiranje](https://docs.medusajs.com/user-guide/products/create), [izmena](https://docs.medusajs.com/user-guide/products/edit), [uvoz](https://docs.medusajs.com/user-guide/products/import), [zalihe](https://docs.medusajs.com/user-guide/inventory/inventory)). Ne prelazimo na Medusu, preuzimamo samo ove ideje.

Redosled: prvo 1 i 3, jer najviše štede posao.

- [ ] **1. Uvoz iz CSV-a ili Excela u admin panelu**
  - Šablon se preuzima iz forme, jedan red je jedan artikal (ili jedna opcija).
  - Pre uvoza pregled: „dodaje se N, menja se M, greške: K“, bez upisa dok se ne potvrdi.
  - Postojeći artikal se prepoznaje po šifri (npr. P064), opcija po njenoj šifri (SKU).
  - Zamenjuje skriptu `tools/erplain_options.py` kad se menja izvoz iz Erplaina.
- [ ] **2. Statusi artikla: Nacrt / Objavljen**
  - Nacrt se ne vidi na sajtu ni u korpi, vidi se samo u adminu.
  - Artikal se priprema (slike, cene, opcije) pa objavljuje kad je spreman.
- [ ] **3. Brzo dodavanje opcija**
  - Jedno polje: upišu se sve opcije odjednom, odvojene zarezom ili novim redom (npr. svetitelji), pa se naprave redovi.
  - Pregled pre snimanja, mogućnost da se pojedinačni red odčekira.
  - Zameniti dodavanje opcija jednu po jednu u uređivanju artikla.
- [ ] **4. Unos kretanja zaliha**
  - Posebna radnja: primljeno / izdato / ispravka, sa količinom i razlogom.
  - Svako kretanje se beleži (ko, kada, koliko, zašto), a stanje se računa iz njih.
  - Sada se stanje samo prepisuje, bez traga.

## Cene za nečlanove (viša cena na sajtu)

Ideja: članovi (crkve) i dalje kupuju po nabavnoj ceni, a ko nije član vidi višu cenu odmah, bez upita đakonu.

- [ ] **Javna cena na sajtu za one koji se nisu prijavili**
  - Prijavljen član (mejl sa spiska) vidi sadašnje, nabavne cene, kao do sada.
  - Posetilac bez prijave vidi višu cenu i može da poruči sam, bez slanja upita.
  - Kako se određuje viša cena, da se odluči: jedan procenat u adminu (npr. +25%), ili posebno polje „cena za ostale“ po artiklu (151 unos), ili nivo cene po članu na spisku.
- [ ] **Upit đakonu ostaje samo za kupovinu na veliko**
  - Dugme „Zatraži cene“ postaje „Zatraži popust za veću količinu“, sa poljem za količinu i napomenu.
  - Đakon odgovara ponudom sa posebnim cenama (tabela ponude već dozvoljava ručnu izmenu cene).
- [ ] **Šta treba prilagoditi**
  - Porudžbina nečlana: funkcija `order` sada računa cene samo za članove, treba dodati višu cenu i za goste (i naplatu, vidi IBAN/Stripe).
  - PDF cenovnik ostaje samo za članove (nabavne cene); za javnost se po želji pravi druga verzija ili samo „bez cena“.
  - Pravno: u mejlu/uslovima navesti da su cene za crkve i ustanove eparhije posebne, a ostalima važi javna cena.
