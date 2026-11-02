// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=e72fe27b4f';
import { showGate, enter } from './admin/signin.js?v=e72fe27b4f';
import './admin/data.js?v=e72fe27b4f';
import './admin/events.js?v=e72fe27b4f';
import './admin/forms.js?v=e72fe27b4f';
import './admin/inquiries.js?v=e72fe27b4f';
import './admin/lists.js?v=e72fe27b4f';
import './admin/orders.js?v=e72fe27b4f';
import './admin/overview.js?v=e72fe27b4f';
import './admin/pdf.js?v=e72fe27b4f';
import './admin/product-form.js?v=e72fe27b4f';
import './admin/products.js?v=e72fe27b4f';
import './admin/profile.js?v=e72fe27b4f';
import './admin/sheet.js?v=e72fe27b4f';
import './admin/search.js?v=e72fe27b4f';
import './admin/shell.js?v=e72fe27b4f';
import './admin/stats.js?v=e72fe27b4f';
import './admin/stock.js?v=e72fe27b4f';
import './admin/ui.js?v=e72fe27b4f';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
