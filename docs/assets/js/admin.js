// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=c9b2bf5879';
import { showGate, enter } from './admin/signin.js?v=c9b2bf5879';
import './admin/data.js?v=c9b2bf5879';
import './admin/events.js?v=c9b2bf5879';
import './admin/forms.js?v=c9b2bf5879';
import './admin/inquiries.js?v=c9b2bf5879';
import './admin/lists.js?v=c9b2bf5879';
import './admin/orders.js?v=c9b2bf5879';
import './admin/overview.js?v=c9b2bf5879';
import './admin/pdf.js?v=c9b2bf5879';
import './admin/product-form.js?v=c9b2bf5879';
import './admin/products.js?v=c9b2bf5879';
import './admin/profile.js?v=c9b2bf5879';
import './admin/sheet.js?v=c9b2bf5879';
import './admin/search.js?v=c9b2bf5879';
import './admin/shell.js?v=c9b2bf5879';
import './admin/stats.js?v=c9b2bf5879';
import './admin/stock.js?v=c9b2bf5879';
import './admin/ui.js?v=c9b2bf5879';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
