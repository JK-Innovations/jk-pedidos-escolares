// Utilidades compartidas (público y panel). Sin dependencias del entorno de diseño.
window.JK = (function () {
  // Safari bloquea localStorage dentro de un iframe de otro sitio (el de Systeme.io).
  // Si eso lanza, el formulario no debe quedarse en blanco.
  function memoryStore() {
    const mem = {};
    return {
      getItem: k => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; }
    };
  }
  function browserStore() {
    try {
      const probe = '__jk_store';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (e) {
      return memoryStore();
    }
  }
  const store = browserStore();
  let lang = store.getItem('jk_lang') || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es');
  let client = null;
  // supabase-js 2.65 pide un navigator.locks con tiempo de espera infinito.
  // En un iframe de iPhone esa espera no termina y la página se queda en "…".
  let lockTail = Promise.resolve();
  const authLock = (_name, _timeout, fn) => {
    const run = lockTail.then(fn, fn);
    lockTail = run.then(() => undefined, () => undefined);
    return run;
  };
  const T = (k, l) => { const e = window.JK_DICT[k]; return e ? e[(l || lang) === 'es' ? 0 : 1] : k; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n == null ? '—' : '$' + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
  const loc = (o, l) => o ? (o[l || lang] == null ? '' : o[l || lang]) : '';
  const loc2 = l => (l || lang) === 'es' ? 'es-US' : 'en-US';
  const fd = (d, l) => d ? new Date(String(d).length > 10 ? d : d + 'T12:00:00').toLocaleDateString(loc2(l), { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fdt = (d, l) => new Date(d).toLocaleString(loc2(l), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const szl = (l, lg) => l.age ? T(l.age === 'child' ? 'youth' : 'adultW', lg) + ' ' + l.size : l.size;
  const dsc = (l, lg) => loc(l.product_name, lg) + (l.code ? ' · ' + l.code : '') + (l.model_label ? ' · ' + loc(l.model_label, lg) : '');
  const price = (p, age, size) => (p.price_map && p.price_map[size] != null) ? p.price_map[size] : p.base_price;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const configured = () => { const c = window.APP_CONFIG || {}; return c.SUPABASE_URL && !/PEGAR_AQUI/.test(c.SUPABASE_URL) && c.SUPABASE_ANON_KEY && !/PEGAR_AQUI/.test(c.SUPABASE_ANON_KEY); };
  const sb = () => client || (client = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY, {
    auth: { storage: store, lock: authLock, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }));
  const img = p => p ? esc(p) : '';
  // Logo de una escuela: ruta del sitio (assets/img/school-harder.png) o URL
  // pública de Storage. Las rutas relativas se dejan igual para que Harder no cambie.
  const logoSrc = p => {
    const s = String(p == null ? '' : p).trim();
    if (!s || /[\u0000-\u001f]/.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
    if (s.indexOf('..') !== -1) return '';
    if (s.charAt(0) === '/' || s.indexOf('assets/') === 0 || s.indexOf('./') === 0) return s.replace(/^\.\//, '');
    const base = String((window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || '').replace(/\/$/, '');
    if (!/^https?:\/\//i.test(base)) return '';
    const key = s.replace(/^\/+/, '').replace(/^school-logos\//, '');
    if (!key) return '';
    return base + '/storage/v1/object/public/school-logos/' + key.split('/').map(part => encodeURIComponent(part)).join('/');
  };
  return { get lang() { return lang; }, setLang(l) { lang = l; try { store.setItem('jk_lang', l); } catch (e) {} document.documentElement.lang = l; }, T, esc, money, loc, fd, fdt, szl, dsc, price, uuid, configured, sb, img, logoSrc };
})();
