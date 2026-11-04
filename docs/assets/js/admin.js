// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=d45242a137';
import { showGate, enter } from './admin/signin.js?v=d45242a137';
import './admin/data.js?v=d45242a137';
import './admin/events.js?v=d45242a137';
import './admin/forms.js?v=d45242a137';
import './admin/inquiries.js?v=d45242a137';
import './admin/lists.js?v=d45242a137';
import './admin/orders.js?v=d45242a137';
import './admin/overview.js?v=d45242a137';
import './admin/pdf.js?v=d45242a137';
import './admin/product-form.js?v=d45242a137';
import './admin/products.js?v=d45242a137';
import './admin/profile.js?v=d45242a137';
import './admin/sheet.js?v=d45242a137';
import './admin/search.js?v=d45242a137';
import './admin/shell.js?v=d45242a137';
import './admin/stats.js?v=d45242a137';
import './admin/stock.js?v=d45242a137';
import './admin/ui.js?v=d45242a137';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
