// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { C, session } from './admin/api.js?v=df6c61df58';
import { showGate, enter } from './admin/signin.js?v=df6c61df58';
import './admin/data.js?v=df6c61df58';
import './admin/events.js?v=df6c61df58';
import './admin/forms.js?v=df6c61df58';
import './admin/inquiries.js?v=df6c61df58';
import './admin/lists.js?v=df6c61df58';
import './admin/orders.js?v=df6c61df58';
import './admin/overview.js?v=df6c61df58';
import './admin/pdf.js?v=df6c61df58';
import './admin/product-form.js?v=df6c61df58';
import './admin/products.js?v=df6c61df58';
import './admin/profile.js?v=df6c61df58';
import './admin/sheet.js?v=df6c61df58';
import './admin/search.js?v=df6c61df58';
import './admin/shell.js?v=df6c61df58';
import './admin/stats.js?v=df6c61df58';
import './admin/stock.js?v=df6c61df58';
import './admin/ui.js?v=df6c61df58';

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
