// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=5945b4a4e1';
import { showGate, enter } from './admin/signin.js?v=5945b4a4e1';
import './admin/data.js?v=5945b4a4e1';
import './admin/events.js?v=5945b4a4e1';
import './admin/forms.js?v=5945b4a4e1';
import './admin/inquiries.js?v=5945b4a4e1';
import './admin/lists.js?v=5945b4a4e1';
import './admin/orders.js?v=5945b4a4e1';
import './admin/overview.js?v=5945b4a4e1';
import './admin/pdf.js?v=5945b4a4e1';
import './admin/product-form.js?v=5945b4a4e1';
import './admin/products.js?v=5945b4a4e1';
import './admin/profile.js?v=5945b4a4e1';
import './admin/sheet.js?v=5945b4a4e1';
import './admin/search.js?v=5945b4a4e1';
import './admin/shell.js?v=5945b4a4e1';
import './admin/stats.js?v=5945b4a4e1';
import './admin/stock.js?v=5945b4a4e1';
import './admin/ui.js?v=5945b4a4e1';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
