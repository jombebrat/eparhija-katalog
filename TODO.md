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
