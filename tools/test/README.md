# Lokalno testiranje

Mock Supabase-a (`supa.ts`, Deno) i puppeteer skripte. Test nalozi su izmišljeni: član `otac.nikola@example.com` (kod 123456), admin `admin@example.com` / `tajna-lozinka-1`. Nikakve prave tajne nisu ovde i ne smeju da budu.

1. `tools/test/mock.sh start` (port 54321; potreban Deno, `DENO=/putanja/do/deno`).
2. `SITE_API_URL=http://localhost:54321 OFFLINE=1 node build.mjs`, pa `cd docs && python3 -m http.server 8765`.
3. `HM=<folder sa node_modules/puppeteer-core i chrome.sh> node tools/test/chg.cjs` (tok člana: izmena i otkazivanje; `adm2.cjs`: oznaka "Izmenjena" u adminu). Skripte pišu screenshotove u trenutni folder (po potrebi prilagoditi putanje).
4. Pregled mejlova: `mailprev/r.ts` pravi HTML, `mailprev/shot.cjs` ga slika.
5. Na kraju: `tools/test/mock.sh stop`, pa produkcijski `OFFLINE=1 node build.mjs` i `grep -rl localhost docs --include=*.html | wc -l` mora biti 0.
