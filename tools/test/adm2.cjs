const puppeteer = require(process.env.HM + '/node_modules/puppeteer-core');
const OUT = process.env.S + '/qa/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.HM + '/chrome.sh', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 });
  await p.goto('http://localhost:8765/admin/', { waitUntil: 'networkidle0' });
  await p.type('#l-email', 'admin@example.com'); await p.type('#l-pass', 'tajna-lozinka-1');
  await p.keyboard.press('Enter'); await wait(1200);
  await p.evaluate(() => { location.hash = '#porudzbine'; }); await wait(800);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Sve/.test(x.textContent.trim()))?.click()); await wait(1200);
  console.log('edited tags', await p.$$eval('.tag--edited', (e) => e.length));
  await p.screenshot({ path: OUT + 'adm-edited-list.png' });
  await p.evaluate(() => document.querySelector('tr:has(.tag--edited) [data-open-order]').click()); await wait(600);
  await p.screenshot({ path: OUT + 'adm-edited-sheet.png' });
  await b.close();
})();
