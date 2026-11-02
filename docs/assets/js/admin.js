// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=2ba7833fc5';
import { showGate, enter } from './admin/signin.js?v=2ba7833fc5';
import './admin/data.js?v=2ba7833fc5';
import './admin/events.js?v=2ba7833fc5';
import './admin/forms.js?v=2ba7833fc5';
import './admin/inquiries.js?v=2ba7833fc5';
import './admin/lists.js?v=2ba7833fc5';
import './admin/orders.js?v=2ba7833fc5';
import './admin/overview.js?v=2ba7833fc5';
import './admin/pdf.js?v=2ba7833fc5';
import './admin/product-form.js?v=2ba7833fc5';
import './admin/products.js?v=2ba7833fc5';
import './admin/profile.js?v=2ba7833fc5';
import './admin/sheet.js?v=2ba7833fc5';
import './admin/shell.js?v=2ba7833fc5';
import './admin/stats.js?v=2ba7833fc5';
import './admin/stock.js?v=2ba7833fc5';
import './admin/ui.js?v=2ba7833fc5';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
