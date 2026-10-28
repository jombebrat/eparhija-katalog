# Izvlačenje kataloga iz PowerPoint-a

Potrebno: Python 3 sa `Pillow` i `defusedxml` (`pip install pillow defusedxml`).

```sh
mkdir -p work && cd work
python3 -c "import zipfile; zipfile.ZipFile('../CATALOGUE.pptx').extractall('unpacked')"
python3 ../tools/extract.py unpacked slides.json          # slajdovi: slike, tabele, pozicije
python3 ../tools/map.py slides.json raw.json              # svaka fotografija uz svoj artikal (po koloni tabele)
python3 ../tools/clean.py raw.json clean.json             # spajanje duplikata, ispravke, nazivi na 3 jezika, kategorije
python3 ../tools/images.py unpacked/ppt/media clean.json ../docs/assets/img/p ../data/catalogue.json
cd .. && node build.mjs
```

`clean.py` sadrži ručne ispravke naziva (rečnik `OVR`) i raspored slajdova po kategorijama (`SLIDE_CAT`); za novi katalog ih treba proveriti. Tabela sveća je upisana ručno na dnu `clean.py`.
