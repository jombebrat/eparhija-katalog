// Words for the order PDF and the emails, in the language the member chose on the site.
export type Lang = 'fr' | 'en' | 'sr';

export const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', sr: 'sr-Cyrl-RS' };

export const T: Record<Lang, Record<string, string>> = {
  fr: {
    org: 'Magasin de l’Éparchie d’Europe occidentale',
    sub: 'Éparchie d’Europe occidentale, Église orthodoxe serbe',
    order: 'Commande n° {n}',
    date: 'Date',
    from: 'Commandé par',
    email: 'E-mail',
    parish: 'Paroisse',
    phone: 'Téléphone',
    address: 'Adresse',
    note: 'Remarque',
    code: 'Code',
    item: 'Article',
    qty: 'Qté',
    unit: 'Prix unitaire',
    line: 'Total',
    total: 'Total indicatif',
    kg: 'kg',
    perKg: '/ kg',
    foot: 'Prix en euros selon le catalogue de l’entrepôt. L’entrepôt confirme la disponibilité et le total.',
    page: 'Page {i} sur {n}',
    subject: 'Commande n° {n}, Magasin de l’Éparchie',
    mailPriest: 'Bonjour,\n\nVoici votre commande n° {n}, envoyée à l’entrepôt de l’Éparchie. Le détail est dans le PDF joint.\n\nTotal indicatif : {total}',
    mailWarehouse: 'Nouvelle commande n° {n} de {who}.\n\nTotal indicatif : {total}\n\nLe détail est dans le PDF joint. Répondre à ce message écrit directement à {email}.',
    file: 'commande-{n}.pdf',
    codeSubject: 'Votre code : {code}',
    codeMail: 'Bonjour,\n\nVoici votre code pour ouvrir votre compte sur le catalogue de l’entrepôt de l’Éparchie :\n\n{code}\n\nIl est valable une heure. Si vous n’avez rien demandé, ignorez ce message.',
  },
  en: {
    org: 'Warehouse of the Eparchy of Western Europe',
    sub: 'Serbian Orthodox Eparchy of Western Europe',
    order: 'Order no. {n}',
    date: 'Date',
    from: 'Ordered by',
    email: 'Email',
    parish: 'Parish',
    phone: 'Phone',
    address: 'Address',
    note: 'Note',
    code: 'Code',
    item: 'Item',
    qty: 'Qty',
    unit: 'Unit price',
    line: 'Total',
    total: 'Estimated total',
    kg: 'kg',
    perKg: '/ kg',
    foot: 'Prices in euros as in the warehouse catalogue. The warehouse confirms availability and the total.',
    page: 'Page {i} of {n}',
    subject: 'Order no. {n}, Eparchy warehouse',
    mailPriest: 'Hello,\n\nHere is your order no. {n}, sent to the Eparchy’s warehouse. The details are in the attached PDF.\n\nEstimated total: {total}',
    mailWarehouse: 'New order no. {n} from {who}.\n\nEstimated total: {total}\n\nThe details are in the attached PDF. Replying to this message writes to {email}.',
    file: 'order-{n}.pdf',
    codeSubject: 'Your code: {code}',
    codeMail: 'Hello,\n\nHere is your code to open your account on the Eparchy warehouse catalogue:\n\n{code}\n\nIt works for one hour. If you did not ask for it, ignore this message.',
  },
  sr: {
    org: 'Магацин Епархије западноевропске',
    sub: 'Епархија западноевропска, Српска православна црква',
    order: 'Поруџбина бр. {n}',
    date: 'Датум',
    from: 'Наручио',
    email: 'Е-пошта',
    parish: 'Парохија',
    phone: 'Телефон',
    address: 'Адреса',
    note: 'Напомена',
    code: 'Шифра',
    item: 'Артикал',
    qty: 'Кол.',
    unit: 'Цена',
    line: 'Укупно',
    total: 'Оквирни збир',
    kg: 'kg',
    perKg: '/ kg',
    foot: 'Цене у еврима према магацинском каталогу. Магацин потврђује расположивост и збир.',
    page: 'Страна {i} од {n}',
    subject: 'Поруџбина бр. {n}, Магацин Епархије',
    mailPriest: 'Добар дан,\n\nово је ваша поруџбина бр. {n}, послата магацину Епархије. Детаљи су у приложеном PDF-у.\n\nОквирни збир: {total}',
    mailWarehouse: 'Нова поруџбина бр. {n}: {who}.\n\nОквирни збир: {total}\n\nДетаљи су у приложеном PDF-у. Одговор на ову поруку иде директно на {email}.',
    file: 'porudzbina-{n}.pdf',
    codeSubject: 'Ваш код: {code}',
    codeMail: 'Добар дан,\n\nово је ваш код за улазак у налог на каталогу магацина Епархије:\n\n{code}\n\nВажи један сат. Ако нисте тражили код, занемарите ову поруку.',
  },
};

export const ADDRESS = '23, rue du Simplon, 75018 Paris';

export const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, String(x)), s);

// A member's name for the Serbian pages and PDF: the French title in Serbian, the name in Cyrillic.
// "P. Jovan Pavlović" → "о. Јован Павловић". A name with a word that is not Serbian Latin (Guilhem Bousquet, Paulo Brandão) stays as written.
const TITLES: [RegExp, string][] = [
  [/^mère higoumène(?=\s|$)/i, 'Игуманија'], [/^moine-prêtre(?=\s|$)/i, 'Јеромонах'], [/^archiprêtre(?=\s|$)/i, 'Протојереј'],
  [/^archimandrite(?=\s|$)/i, 'Архимандрит'], [/^hiéromoine(?=\s|$)/i, 'Јеромонах'], [/^hiérodiacre(?=\s|$)/i, 'Јерођакон'],
  [/^protodiacre(?=\s|$)/i, 'Протођакон'], [/^diacre(?=\s|$)/i, 'Ђакон'], [/^moniale(?=\s|$)/i, 'Монахиња'], [/^moine(?=\s|$)/i, 'Монах'],
  [/^(?:p\.|père)(?=\s|$)/i, 'о.'],
];
const LAT: Record<string, string> = { a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж' };
const DIGRAPH: Record<string, string> = { lj: 'љ', nj: 'њ', dž: 'џ' };
const serbian = (w: string) => /^[a-zčćđšž]+$/iu.test(w) && !/[qwxy]/i.test(w);
const word = (w: string) => {
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2), d = DIGRAPH[two.toLowerCase()];
    const up = (c: string, src: string) => (src !== src.toLowerCase() ? c.toUpperCase() : c);
    if (d) { out += up(d, two[0]); i++; continue; }
    out += up(LAT[w[i].toLowerCase()], w[i]);
  }
  return out;
};
export function toCyrillic(name: string | null | undefined): string {
  let s = String(name ?? '').trim();
  let title = '';
  for (const [re, t] of TITLES) if (re.test(s)) { title = t; s = s.replace(re, '').trim(); break; }
  const words = s.match(/\p{L}+/gu) || [];
  if (words.every(serbian)) s = s.replace(/\p{L}+/gu, word);
  return [title, s].filter(Boolean).join(' ');
}
