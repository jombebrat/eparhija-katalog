// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=bdf0fa49e0';
import { showGate, enter } from './admin/signin.js?v=bdf0fa49e0';
import './admin/data.js?v=bdf0fa49e0';
import './admin/events.js?v=bdf0fa49e0';
import './admin/forms.js?v=bdf0fa49e0';
import './admin/inquiries.js?v=bdf0fa49e0';
import './admin/lists.js?v=bdf0fa49e0';
import './admin/orders.js?v=bdf0fa49e0';
import './admin/overview.js?v=bdf0fa49e0';
import './admin/pdf.js?v=bdf0fa49e0';
import './admin/product-form.js?v=bdf0fa49e0';
import './admin/products.js?v=bdf0fa49e0';
import './admin/profile.js?v=bdf0fa49e0';
import './admin/sheet.js?v=bdf0fa49e0';
import './admin/search.js?v=bdf0fa49e0';
import './admin/shell.js?v=bdf0fa49e0';
import './admin/stats.js?v=bdf0fa49e0';
import './admin/stock.js?v=bdf0fa49e0';
import './admin/ui.js?v=bdf0fa49e0';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
