const puppeteer = require(process.env.HM + '/node_modules/puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.HM + '/chrome.sh', args: ['--no-sandbox'] });
  for (const n of ['a', 'b', 'c']) {
    const p = await b.newPage(); await p.setViewport({ width: 700, height: 900, deviceScaleFactor: 1 });
    await p.setRequestInterception(true);
    p.on('request', (r) => r.url().includes('/assets/img/grb-112.png') ? r.respond({ status: 200, contentType: 'image/png', body: require('fs').readFileSync('/home/claude/eparhija-katalog/docs/assets/img/grb-112.png') }) : r.continue());
    await p.goto('file://' + process.env.S + '/mailprev/' + n + '.html');
    await p.screenshot({ path: process.env.S + '/mailprev/' + n + '.png', fullPage: true });
  }
  await b.close();
})();
