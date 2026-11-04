// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=5a8c3dbe0f';
import { showGate, enter } from './admin/signin.js?v=5a8c3dbe0f';
import './admin/data.js?v=5a8c3dbe0f';
import './admin/events.js?v=5a8c3dbe0f';
import './admin/forms.js?v=5a8c3dbe0f';
import './admin/inquiries.js?v=5a8c3dbe0f';
import './admin/lists.js?v=5a8c3dbe0f';
import './admin/orders.js?v=5a8c3dbe0f';
import './admin/overview.js?v=5a8c3dbe0f';
import './admin/pdf.js?v=5a8c3dbe0f';
import './admin/product-form.js?v=5a8c3dbe0f';
import './admin/products.js?v=5a8c3dbe0f';
import './admin/profile.js?v=5a8c3dbe0f';
import './admin/sheet.js?v=5a8c3dbe0f';
import './admin/search.js?v=5a8c3dbe0f';
import './admin/shell.js?v=5a8c3dbe0f';
import './admin/stats.js?v=5a8c3dbe0f';
import './admin/stock.js?v=5a8c3dbe0f';
import './admin/ui.js?v=5a8c3dbe0f';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
