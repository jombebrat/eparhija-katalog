import { htmlMail } from '/home/claude/eparhija-katalog/supabase/functions/order/mail.ts';
import { T, fill } from '/home/claude/eparhija-katalog/supabase/functions/order/i18n.ts';
const t = T.fr, s = T.sr;
const a = htmlMail('Confirmation de commande n° 286', fill(t.mailPriest, { n: 286, total: '19,60 €' }) + '\n\n' + fill(t.mailManage, { account: 'https://magacinzapadnoevropski.com/compte/', contact: 'contact@magacinzapadnoevropski.com' }), { lang: 'fr', heading: fill(t.order, { n: 286 }), facts: [[t.factNumber, 'n° 286'], [t.total, '19,60 €']], cta: { label: t.mailBtnAccount, url: 'https://magacinzapadnoevropski.com/compte/' } });
const b = htmlMail('Ваш код: 123456', fill(s.codeMail, { code: '123456' }), { lang: 'sr', heading: s.codeHeading, code: '123456' });
const link = 'https://magacinzapadnoevropski.com/sr/?ponuda=abc';
const c = htmlMail('Понуда', fill(s.quoteMail, { n: 7, total: '45,00 €', link }), { lang: 'sr', heading: fill(s.quote, { n: 7 }), facts: [[s.total, '45,00 €']], cta: { label: s.mailBtnQuote, url: link } });
const d = htmlMail('Poruđbina', 'Nova izmena\n\nPre:\n- P011  Кадионица × 2  (4,52 €)\n- H007  Свеће × 3  (12,00 €)\nZbir: 16,52 €', { lang: 'sr' });
await Deno.writeTextFile(new URL('./a.html', import.meta.url), a); await Deno.writeTextFile(new URL('./b.html', import.meta.url), b); await Deno.writeTextFile(new URL('./c.html', import.meta.url), c); await Deno.writeTextFile(new URL('./d.html', import.meta.url), d);
