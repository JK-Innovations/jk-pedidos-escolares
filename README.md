# School pre-orders (pedidos escolares)

Public pre-order form and staff panel for JK Innovations school uniform orders. The public form is served at `/` (`index.html`), including `?p=SLUG` school links, and the admin panel is at `/admin.html`. When the form is embedded, it reports its height to the parent frame with a `jk-height` postMessage.

Sistema de preórdenes escolares de JKINnovations: el formulario público abre en `/` y el panel en `/admin.html`.

Supabase project: `https://oavhgokdtohrwifjjiqs.supabase.co`. The publishable key lives in `js/config.js`; row access is enforced by RLS. The Harder class-list patch is `sql/06_harder_confirmed_20261015.sql` (run in the SQL editor; it does not recreate tables or orders).

GitHub Pages should serve this repository from the root. `.nojekyll` is included so Pages does not rewrite asset paths.
