// Sends mail from the warehouse's own mailbox over SMTP (Private Email), or through Resend when only RESEND_API_KEY is set.
// Secrets (Supabase > Edge Functions > Secrets, never in the repo): SMTP_PASS, SMTP_USER (the mailbox), optional SMTP_HOST, SMTP_PORT, ORDER_FROM.
import nodemailer from 'nodemailer';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const env = (k: string) => Deno.env.get(k) || '';

export const mailOn = () => !!((env('SMTP_PASS') && env('SMTP_USER')) || (env('RESEND_API_KEY') && env('ORDER_FROM')));

export async function sendMail(to: string, replyTo: string, subject: string, text: string, filename?: string, pdfB64?: string): Promise<boolean> {
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${esc(text).replace(/\n/g, '<br>')}</div>`;
  try {
    if (env('SMTP_PASS') && env('SMTP_USER')) {
      const port = Number(env('SMTP_PORT')) || 465;
      const t = nodemailer.createTransport({
        host: env('SMTP_HOST') || 'mail.privateemail.com', port, secure: port === 465,
        auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
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
