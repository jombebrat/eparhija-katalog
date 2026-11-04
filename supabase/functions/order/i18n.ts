// Words for the order PDF and the emails, in the language the member chose on the site.
export type Lang = 'fr' | 'en' | 'sr';

export const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', sr: 'sr-Cyrl-RS' };

export const T: Record<Lang, Record<string, string>> = {
  fr: {
    org: 'Entrepôt du Diocèse d’Europe occidentale',
    sub: 'Diocèse orthodoxe serbe d’Europe occidentale',
    company: 'MAGACIN ZAPADNOEVROPSKI, SASU au capital de 1 000 €, RCS Paris 981 254 600, TVA FR52981254600',
    order: 'Confirmation de commande n°\u00a0{n}',
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
    perKg: '/\u00a0kg',
    foot: 'Ceci est une confirmation de commande, pas une facture. La facture est établie à part par l’entrepôt. Prix en euros selon le catalogue ; l’entrepôt confirme la disponibilité et le total.',
    page: 'Page {i} sur {n}',
    subject: 'Confirmation de commande n°\u00a0{n}, Entrepôt du Diocèse',
    mailPriest: 'Bonjour,\n\nVoici la confirmation de votre commande n°\u00a0{n}, envoyée à l’entrepôt du Diocèse. Le détail (articles, quantités, prix) est dans le PDF joint.\n\nTotal indicatif : {total}\n\nCe message n’est pas une facture. La facture vous sera envoyée à part, avec l’expédition.',
    mailWarehouse: 'Nouvelle commande n°\u00a0{n} de {who}.\n\nTotal indicatif : {total}\n\nLe détail est dans le PDF joint. Répondre à ce message écrit directement à {email}.',
    file: 'commande-{n}.pdf',
    codeSubject: 'Votre code : {code}',
    quote: 'Devis n°\u00a0{n}',
    quoteFor: 'Pour',
    quoteFoot: 'Prix en euros, valables 30 jours à partir de la date du devis. L’entrepôt confirme la disponibilité à la commande.',
    quoteLink: 'Commander selon ce devis :',
    quoteSubject: 'Devis n°\u00a0{n}, Entrepôt du Diocèse',
    quoteMail: 'Bonjour,\n\nVoici les prix des articles que vous avez demandés : devis n°\u00a0{n}, en PDF joint.\n\nTotal indicatif : {total}\n\nPour commander selon ce devis, ouvrez ce lien :\n{link}\n\nL’entrepôt du Diocèse d’Europe occidentale',
    quoteFile: 'devis-{n}.pdf',
    inqSubject: 'Demande de prix n°\u00a0{n}',
    inqMail: 'Nouvelle demande de prix n°\u00a0{n} de {who} ({email}) : {count} articles.\n\nRépondez depuis l’administration : {admin}',
    codeMail: 'Bonjour,\n\nVoici votre code pour ouvrir votre compte sur le catalogue de l’entrepôt du Diocèse :\n\n{code}\n\nIl est valable une heure. Si vous n’avez rien demandé, ignorez ce message.',
    mailManage: 'Vous pouvez annuler ou modifier cette commande tant qu’elle est « Reçue », avant le début de la préparation. Pour cela : ouvrez votre profil ({account}), connectez-vous avec votre e-mail (un code de connexion vous est envoyé), puis, sous « Vos commandes », cliquez sur « Modifier » ou « Annuler la commande ». L’entrepôt est prévenu automatiquement de tout changement. Une fois la préparation commencée, écrivez-nous à {contact}.',
    chCancelSubject: 'Commande n°\u00a0{n} annulée par le client',
    chCancelMail: 'Le client {who} ({email}) a annulé la commande n°\u00a0{n} depuis son profil.\n\nContenu annulé :\n{before}\n\nTotal : {total}\n\nStatut dans l’administration : annulée.',
    chEditSubject: 'Commande n°\u00a0{n} modifiée par le client',
    chEditMail: 'Le client {who} ({email}) a modifié la commande n°\u00a0{n} depuis son profil.\n\nAvant :\n{before}\nTotal : {totalBefore}\n\nMaintenant :\n{after}\nTotal : {total}\n\nCommande dans l’administration : {admin}',
    mailBtnAccount: 'Ouvrir mon profil',
    mailBtnAdmin: 'Ouvrir dans l’administration',
    mailBtnQuote: 'Commander selon ce devis',
    codeHeading: 'Votre code de connexion',
    factNumber: 'Commande',
  },
  en: {
    org: 'Warehouse of the Eparchy of Western Europe',
    sub: 'Serbian Orthodox Eparchy of Western Europe',
    company: 'MAGACIN ZAPADNOEVROPSKI, SASU, share capital €1,000, RCS Paris 981 254 600, VAT FR52981254600',
    order: 'Order confirmation no.\u00a0{n}',
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
    perKg: '/\u00a0kg',
    foot: 'This is an order confirmation, not an invoice. The invoice is issued separately by the warehouse. Prices in euros as in the catalogue; the warehouse confirms availability and the total.',
    page: 'Page {i} of {n}',
    subject: 'Order confirmation no.\u00a0{n}, Eparchy warehouse',
    mailPriest: 'Hello,\n\nHere is the confirmation of your order no.\u00a0{n}, sent to the Eparchy’s warehouse. The details (items, quantities, prices) are in the attached PDF.\n\nEstimated total: {total}\n\nThis message is not an invoice. The invoice will be sent to you separately, with the shipment.',
    mailWarehouse: 'New order no.\u00a0{n} from {who}.\n\nEstimated total: {total}\n\nThe details are in the attached PDF. Replying to this message writes to {email}.',
    file: 'order-{n}.pdf',
    codeSubject: 'Your code: {code}',
    quote: 'Quote no. {n}',
    quoteFor: 'For',
    quoteFoot: 'Prices in euros, valid for 30 days from the date of the quote. The warehouse confirms availability when you order.',
    quoteLink: 'Order as quoted:',
    quoteSubject: 'Quote no. {n}, Eparchy warehouse',
    quoteMail: 'Hello,\n\nHere are the prices of the items you asked about: quote no. {n}, attached as a PDF.\n\nEstimated total: {total}\n\nTo order as quoted, open this link:\n{link}\n\nThe warehouse of the Eparchy of Western Europe',
    quoteFile: 'quote-{n}.pdf',
    inqSubject: 'Price request no. {n}',
    inqMail: 'New price request no. {n} from {who} ({email}): {count} items.\n\nAnswer it in the admin: {admin}',
    codeMail: 'Hello,\n\nHere is your code to open your account on the Eparchy warehouse catalogue:\n\n{code}\n\nIt works for one hour. If you did not ask for it, ignore this message.',
    mailManage: 'You can cancel or edit this order while it is “Received”, before preparation starts. To do so: open your profile ({account}), sign in with your email (a sign-in code is sent to you), then under “Your orders” click “Edit order” or “Cancel order”. The warehouse is told automatically about any change. Once preparation has started, write to us at {contact}.',
    chCancelSubject: 'Order no.\u00a0{n} cancelled by the customer',
    chCancelMail: 'The customer {who} ({email}) cancelled order no.\u00a0{n} from their profile.\n\nCancelled contents:\n{before}\n\nTotal: {total}\n\nStatus in the admin: cancelled.',
    chEditSubject: 'Order no.\u00a0{n} edited by the customer',
    chEditMail: 'The customer {who} ({email}) edited order no.\u00a0{n} from their profile.\n\nBefore:\n{before}\nTotal: {totalBefore}\n\nNow:\n{after}\nTotal: {total}\n\nOrder in the admin: {admin}',
    mailBtnAccount: 'Open my profile',
    mailBtnAdmin: 'Open in the admin',
    mailBtnQuote: 'Order as quoted',
    codeHeading: 'Your sign-in code',
    factNumber: 'Order',
  },
  sr: {
    org: 'Магацин Епархије западноевропске',
    sub: 'Епархија западноевропска, Српска православна црква',
    company: 'MAGACIN ZAPADNOEVROPSKI, SASU, капитал 1.000 €, RCS Paris 981 254 600, ПДВ FR52981254600',
    order: 'Потврда поруџбине бр.\u00a0{n}',
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
    perKg: '/\u00a0kg',
    foot: 'Ово је потврда поруџбине, а не фактура. Фактуру магацин издаје посебно. Цене су у еврима према каталогу; магацин потврђује расположивост и збир.',
    page: 'Страна {i} од {n}',
    subject: 'Потврда поруџбине бр.\u00a0{n}, Магацин Епархије',
    mailPriest: 'Добар дан,\n\nово је потврда ваше поруџбине бр.\u00a0{n}, послате магацину Епархије. Детаљи (артикли, количине, цене) су у приложеном PDF-у.\n\nОквирни збир: {total}\n\nОва порука није фактура. Фактура ће вам бити послата посебно, уз пошиљку.',
    mailWarehouse: 'Нова поруџбина бр.\u00a0{n}: {who}.\n\nОквирни збир: {total}\n\nДетаљи су у приложеном PDF-у. Одговор на ову поруку иде директно на {email}.',
    file: 'porudzbina-{n}.pdf',
    codeSubject: 'Ваш код: {code}',
    quote: 'Понуда бр. {n}',
    quoteFor: 'За',
    quoteFoot: 'Цене у еврима, важе 30 дана од датума понуде. Магацин потврђује расположивост при поручивању.',
    quoteLink: 'Поручите по овој понуди:',
    quoteSubject: 'Понуда бр. {n}, Магацин Епархије',
    quoteMail: 'Добар дан,\n\nово су цене артикала које сте тражили: понуда бр. {n}, у приложеном PDF-у.\n\nОквирни збир: {total}\n\nДа поручите по овој понуди, отворите овај линк:\n{link}\n\nМагацин Епархије западноевропске',
    quoteFile: 'ponuda-{n}.pdf',
    inqSubject: 'Нови упит за цене бр. {n}',
    inqMail: 'Нови упит за цене бр. {n}: {who} ({email}), артикала: {count}.\n\nОдговорите у администрацији: {admin}',
    codeMail: 'Добар дан,\n\nово је ваш код за улазак у налог на каталогу магацина Епархије:\n\n{code}\n\nВажи један сат. Ако нисте тражили код, занемарите ову поруку.',
    mailManage: 'Ову поруџбину можете да откажете или измените док је „Примљена“, пре почетка обраде. Отворите свој профил ({account}), пријавите се својом е-поштом (стиже вам код за пријаву), па у делу „Ваше поруџбине“ кликните на „Измени поруџбину“ или „Откажи поруџбину“. Магацин се о свакој промени обавештава аутоматски. Када обрада почне, пишите нам на {contact}.',
    chCancelSubject: 'Поруџбина бр.\u00a0{n}: члан је отказао',
    chCancelMail: 'Члан {who} ({email}) је отказао поруџбину бр.\u00a0{n} из свог профила.\n\nОтказан садржај:\n{before}\n\nЗбир: {total}\n\nСтатус у администрацији: отказана.',
    chEditSubject: 'Поруџбина бр.\u00a0{n}: члан је изменио',
    chEditMail: 'Члан {who} ({email}) је изменио поруџбину бр.\u00a0{n} из свог профила.\n\nПре:\n{before}\nЗбир: {totalBefore}\n\nСада:\n{after}\nЗбир: {total}\n\nПоруџбина у администрацији: {admin}',
    mailBtnAccount: 'Отвори мој профил',
    mailBtnAdmin: 'Отвори у администрацији',
    mailBtnQuote: 'Поручи по овој понуди',
    codeHeading: 'Ваш код за пријаву',
    factNumber: 'Поруџбина',
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
