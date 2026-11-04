// Sends mail from the warehouse's own mailbox over SMTP (Private Email), or through Resend when only RESEND_API_KEY is set.
// Secrets (Supabase > Edge Functions > Secrets, never in the repo): SMTP_PASS, SMTP_USER (the mailbox), optional SMTP_HOST, SMTP_PORT, ORDER_FROM.
// The plain text goes out as the text part; the HTML part is the same message in the site's look (table layout, inline styles:
// that is what mail programs understand).
import nodemailer from 'nodemailer';

const env = (k: string) => Deno.env.get(k) || '';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const SITE = (env('SITE_URL') || 'https://magacinzapadnoevropski.com/').replace(/\/?$/, '/');

type Lang = 'fr' | 'en' | 'sr';
export type Look = {
  lang?: Lang;
  heading?: string;                          // big title under the header (default: the subject)
  facts?: [string, string][];                // a small table: label, value
  code?: string;                             // a sign-in code, shown large
  cta?: { label: string; url: string };      // the one button
};

const FOOT: Record<Lang, { org: string; company: string; auto: string }> = {
  fr: { org: 'Entrepôt du Diocèse d’Europe occidentale', company: 'MAGACIN ZAPADNOEVROPSKI, SASU · RCS Paris 981 254 600 · TVA FR52981254600', auto: 'Vous pouvez répondre directement à ce message.' },
  en: { org: 'Warehouse of the Eparchy of Western Europe', company: 'MAGACIN ZAPADNOEVROPSKI, SASU · RCS Paris 981 254 600 · VAT FR52981254600', auto: 'You can reply directly to this message.' },
  sr: { org: 'Магацин Епархије западноевропске', company: 'MAGACIN ZAPADNOEVROPSKI, SASU · RCS Paris 981 254 600 · ПДВ FR52981254600', auto: 'На ову поруку можете директно да одговорите.' },
};
const ADDRESS = '23, rue du Simplon, 75018 Paris';

// web addresses in the text become links (the text part keeps them plain)
const linkify = (h: string) => h.replace(/https?:\/\/[^\s<]+/g, (u) => {
  const tail = u.match(/[.,;:!?)]+$/)?.[0] ?? '';
  const url = tail ? u.slice(0, -tail.length) : u;
  return `<a href="${url}" style="color:#111;text-decoration:underline">${url}</a>${tail}`;
});

const FONT = "'Onest',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function htmlMail(subject: string, text: string, look: Look = {}): string {
  const lang: Lang = look.lang && FOOT[look.lang] ? look.lang : 'fr';
  const f = FOOT[lang];
  const heading = look.heading ?? subject;
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => (look.cta ? p.split('\n').filter((l) => l.trim() !== look.cta!.url).join('\n') : p))
    .filter(Boolean);
  const codeRow = look.code
    ? `<tr><td align="center" style="padding:8px 0 24px"><div style="display:inline-block;padding:16px 28px;border-radius:12px;background:#f3f3f1;border:1px solid #e4e4e1;font:700 34px/1 'Courier New',Courier,monospace;letter-spacing:10px;color:#111">${esc(look.code)}</div></td></tr>` : '';
  const body = paragraphs.map((p) => {
    if (look.code && p === look.code) return codeRow;
    const lines = p.split('\n');
    const isList = lines.length > 1 && lines.every((l) => l.startsWith('- '));
    return isList
      ? `<tr><td style="padding:0 0 16px;font:400 15px/1.6 ${FONT};color:#333">${lines.map((l) => `<div style="padding:6px 0;border-bottom:1px solid #ececea">${linkify(esc(l.slice(2)))}</div>`).join('')}</td></tr>`
      : `<tr><td style="padding:0 0 16px;font:400 15px/1.65 ${FONT};color:#333">${linkify(esc(p)).replace(/\n/g, '<br>')}</td></tr>`;
  }).join('');
  const facts = look.facts?.length
    ? `<tr><td style="padding:0 0 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e1;border-radius:12px;background:#fafaf8">${look.facts.map(([k, v], i) => `<tr><td style="padding:12px 16px;${i ? 'border-top:1px solid #ececea;' : ''}font:400 13px/1.4 ${FONT};color:#777">${esc(k)}</td><td align="right" style="padding:12px 16px;${i ? 'border-top:1px solid #ececea;' : ''}font:700 15px/1.4 ${FONT};color:#111">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : '';
  const cta = look.cta
    ? `<tr><td style="padding:6px 0 24px"><a href="${esc(look.cta.url)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#111;color:#fff;font:600 15px/1 ${FONT};text-decoration:none">${esc(look.cta.label)}</a></td></tr>` : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eeeeeb">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeeeb"><tr><td align="center" style="padding:28px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:16px;overflow:hidden;background:#ffffff;box-shadow:0 2px 14px rgba(0,0,0,.07)">
  <tr><td style="background:#0d0d0d;padding:22px 28px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:14px"><img src="${SITE}assets/img/grb-112.png" width="41" height="48" alt="" style="display:block;border:0"></td>
    <td style="font:700 15px/1.3 ${FONT};color:#ffffff">${esc(f.org)}<br><span style="font:400 12px/1.4 ${FONT};color:#b5b5b0">magacinzapadnoevropski.com</span></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:34px 28px 10px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:0 0 22px;font:700 24px/1.25 ${FONT};color:#111">${esc(heading)}</td></tr>
    ${body}${look.code && !paragraphs.includes(look.code) ? codeRow : ''}${facts}${cta}
   </table>
  </td></tr>
  <tr><td style="padding:0 28px"><div style="height:1px;background:#ececea"></div></td></tr>
  <tr><td style="padding:20px 28px 28px;font:400 12px/1.6 ${FONT};color:#8a8a85">
   ${esc(f.org)} · ${esc(ADDRESS)}<br>${esc(f.company)}<br>${esc(f.auto)}
  </td></tr>
 </table>
</td></tr></table></body></html>`;
}

export const mailOn = () => !!((env('SMTP_PASS') && env('SMTP_USER')) || (env('RESEND_API_KEY') && env('ORDER_FROM')));

export async function sendMail(to: string, replyTo: string, subject: string, text: string, filename?: string, pdfB64?: string, look?: Look): Promise<boolean> {
  const html = htmlMail(subject, text, look);
  try {
    if (env('SMTP_PASS') && env('SMTP_USER')) {
      const port = Number(env('SMTP_PORT')) || 465;
      const t = nodemailer.createTransport({
        host: env('SMTP_HOST') || 'mail.privateemail.com', port, secure: port === 465,
        auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 25000,
      });
      await t.sendMail({
        from: env('ORDER_FROM') || env('SMTP_USER'), to, replyTo, subject, text, html,
        ...(pdfB64 ? { attachments: [{ filename, content: pdfB64, encoding: 'base64' }] } : {}),
      });
      return true;
    }
    const key = env('RESEND_API_KEY');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('ORDER_FROM'), to: [to], reply_to: replyTo, subject, text, html, ...(pdfB64 ? { attachments: [{ filename, content: pdfB64 }] } : {}) }),
    });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('mail', (e as Error).message);
    return false;
  }
}
