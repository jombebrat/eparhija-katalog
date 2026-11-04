const puppeteer = require(process.env.HM + '/node_modules/puppeteer-core');
const OUT = process.env.S + '/qa/';
const API = 'http://localhost:54321';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.HM + '/chrome.sh', args: ['--no-sandbox'] });
  const errs = [];
  for (const [w, h, tag, path] of [[1000, 900, 'd', 'compte/'], [390, 844, 'm', 'sr/nalog/']]) {
    const p = await b.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: w, height: h });
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    // two orders to play with
    for (let i = 0; i < 2; i++) await fetch(API + '/functions/v1/order', { method: 'POST', body: JSON.stringify({ email: 'otac.nikola@example.com', lang: tag === 'm' ? 'sr' : 'fr', items: [{ code: 'P011', qty: 2 }, { code: 'P014', qty: 1 }, { code: 'H007', qty: 3 }], name: 'P. Nikola' }) });
    await p.goto('http://localhost:8765/' + path, { waitUntil: 'networkidle0' });
    await p.type('#ac-email', 'otac.nikola@example.com'); await p.keyboard.press('Enter'); await wait(500);
    await fetch(API + '/functions/v1/order', { method: 'POST', body: JSON.stringify({ action: 'code', email: 'otac.nikola@example.com', lang: 'fr' }) });
    await p.type('#ac-code', '123456'); await p.keyboard.press('Enter'); await wait(1000);
    await p.evaluate(() => { location.hash = '#porudzbine'; }); await wait(400);
    await p.evaluate(() => document.querySelector('[data-edit]').scrollIntoView({ block: 'center' }));
    
    await p.screenshot({ path: OUT + `chg-1-${tag}.png` }); await p.click('[data-edit]'); await wait(400);
    await p.evaluate(() => { document.querySelector('.editline__qty').value = '5'; document.querySelector('.editline__qty').dispatchEvent(new Event('input', { bubbles: true })); document.querySelectorAll('[data-rm]')[1].click(); });
    await wait(200);
    await p.screenshot({ path: OUT + `chg-2-${tag}.png` });
    console.log(tag, 'total shown', await p.$eval('[data-edit-total]', (e) => e.textContent));
    await p.click('[data-edit-form] [type=submit]'); await wait(700);
    await p.screenshot({ path: OUT + `chg-toast-${tag}.png` });
    console.log(tag, 'after edit msg:', await p.$eval('[data-msg]:not(:empty)', (e) => e.textContent), '| lines:', await p.$$eval('[data-order]:first-child .lines tbody tr, .myorder:has([data-edit]) .lines tbody tr', (r) => r.length));
    await p.click('[data-cancel]'); await wait(300);
    await p.screenshot({ path: OUT + `chg-3-${tag}.png` });
    await p.click('[data-cancel-yes]'); await wait(700);
    console.log(tag, 'after cancel msgs:', await p.$$eval('[data-msg]', (e) => e.map((x) => x.textContent).filter(Boolean)), '| tags:', await p.$$eval('.myorder .tag', (e) => e.map((x) => x.textContent)));
    await p.screenshot({ path: OUT + `chg-4-${tag}.png` });
    await p.close();
  }
  console.log('changes', JSON.stringify(await (await fetch(API + '/__changes')).json()), 'errors', errs);
  await b.close();
})();
