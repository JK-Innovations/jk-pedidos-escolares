// Panel privado de Norma. La protección real está en el servidor (Supabase Auth + RLS + funciones admin_*).
(function () {
  const { T, esc, money, loc, fd, fdt, szl, dsc, logoSrc } = JK;
  const root = document.getElementById('app');
  const A = { user: null, ok: false, msg: '', D: null, loading: false, view: 'schools', fSchool: 'all', fPeriod: 'all', orderSel: null, delSel: null, cfg: null, newFor: null, schoolForm: null, editProd: null,
    toast: '', rType: 'prodsum', rGroup: 'all', rLang: JK.lang, rPaper: 'letter', rStatus: 'all', rByGroup: false, gate: '', recovery: false, showPass: false, sending: false, authReady: false, f: {}, pq: {}, eq: {}, dq: {}, pf: {}, zoom: '', more: {}, g: null };
  const sb = () => JK.sb();
  const recoveryFromHash = () => { const raw = (location.hash || '').replace(/^#/, ''); return !!raw && new URLSearchParams(raw).get('type') === 'recovery'; };
  const markRecovery = () => { A.recovery = true; try { sessionStorage.setItem('jk_pw_recovery', '1'); } catch (e) {} };
  const clearRecovery = () => { A.recovery = false; try { sessionStorage.removeItem('jk_pw_recovery'); } catch (e) {} };
  const adminRedirect = () => { const u = new URL(location.href); u.hash = ''; return u.href; };
  const todayLA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const eff = p => { const d = todayLA(); return p.status === 'closed' || d > p.close_date ? 'closed' : (p.status === 'open' && d >= p.open_date ? 'open' : 'pending'); };
  const stl = p => T({ pending: 'stPending', open: 'stOpen', closed: 'stClosed' }[eff(p)]);
  const rng = (p, l) => fd(p.open_date, l) + ' – ' + fd(p.close_date, l);
  const opts = (arr, sel) => arr.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(sel) ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
  const toast = m => { A.toast = m; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { A.toast = ''; render(); }, 6000); };
  const errMsg = e => {
    const m = (e && e.message) || String(e);
    if (/schema cache|could not find the function|PGRST202/i.test(m)) return T('x_needSql');
    const code = (m.match(/[a-z_]+$/) || [''])[0]; const k = 'x_' + code; return window.JK_DICT[k] ? T(k) : m;
  };

  async function all(table, order = 'id') {
    let out = [], from = 0;
    for (;;) { const { data, error } = await sb().from(table).select('*').order(order).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
    return out;
  }
  async function loadAll() {
    A.loading = true; render();
    try {
      const [schools, periods, groups, products, orders, lines, deliveries, dlines, progress, logs, hist] = await Promise.all([all('schools'), all('periods'), all('groups'), all('products'), all('orders'), all('order_lines'), all('deliveries'), all('delivery_lines'), all('production_progress', 'variant_key'), all('period_date_log'), all('order_history')]);
      // Archive only the identified disposable test space from navigation and totals.
      // Keep its underlying records and audit history available in the database.
      const retired = periods.filter(p => p.slug === '1f1d0fe52f08c9394c' && schools.some(s => s.id === p.school_id && s.name === 'PRUEBAS JKIN — NO USAR PARA PEDIDOS REALES'));
      const visiblePeriods = periods.filter(p => !retired.some(r => r.id === p.id));
      const visibleSchools = schools.filter(s => !retired.some(r => r.school_id === s.id) || visiblePeriods.some(p => p.school_id === s.id));
      const D = { schools: visibleSchools, periods: visiblePeriods.sort((a, b) => b.open_date.localeCompare(a.open_date)), groups, products, orders, lines, deliveries, dlines, progress, logs, hist, ord: {}, del: {}, prog: {}, prod: {}, sch: {}, per: {}, grp: {} };
      orders.forEach(o => D.ord[o.id] = o); schools.forEach(s => D.sch[s.id] = s); periods.forEach(p => D.per[p.id] = p); groups.forEach(g => D.grp[g.id] = g); products.forEach(p => D.prod[p.id] = p);
      dlines.forEach(x => D.del[x.line_id] = (D.del[x.line_id] || 0) + x.qty);
      progress.forEach(p => D.prog[p.period_id + '|' + p.variant_key] = p);
      A.D = D;
    } catch (e) { A.toast = errMsg(e); }
    A.loading = false; render();
  }
  async function rpc(name, args) { const { data, error } = await sb().rpc(name, args); if (error) { toast(errMsg(error)); return { error }; } return { data }; }

  // ---- datos derivados ----
  const D = () => A.D;
  const act = pid => D().lines.filter(l => l.period_id === pid && D().ord[l.order_id] && D().ord[l.order_id].status === 'active');
  const delq = id => D().del[id] || 0;
  const gl = (g, l) => [g.teacher, g.grade, g.room ? T('room', l) + ' ' + g.room : ''].filter(Boolean).join(' · ');
  const pname = p => D().sch[p.school_id].name + ' · ' + rng(p);
  const fPeriods = () => D().periods.filter(p => (A.fSchool === 'all' || p.school_id === A.fSchool) && (A.fPeriod === 'all' || p.id === A.fPeriod));
  const sortKey = r => [r.design, loc(r.product_name, 'es'), loc(r.model_label, 'es'), loc(r.color_name, 'es'), r.age, String(r.size).padStart(3, '0')].join('~');
  function prodRows(pid, gid) {
    const m = {};
    act(pid).forEach(l => { if (gid && gid !== 'all' && l.group_id !== gid) return; (m[l.variant_key] = m[l.variant_key] || { key: l.variant_key, src: l, ordered: 0 }).ordered += l.qty; });
    if (!gid || gid === 'all') D().progress.filter(p => p.period_id === pid).forEach(p => { if (!m[p.variant_key]) m[p.variant_key] = { key: p.variant_key, src: p.meta, ordered: 0 }; });
    return Object.values(m).map(r => { const pr = D().prog[pid + '|' + r.key], prepared = pr ? pr.prepared : 0; return { ...r.src, key: r.key, ordered: r.ordered, prepared, pending: Math.max(0, r.ordered - prepared), flag: !!pr && pr.at_total !== r.ordered, was: pr ? pr.at_total : 0 }; })
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }
  function stat(p) {
    const ls = act(p.id); let ordered = 0, delivered = 0; ls.forEach(l => { ordered += l.qty; delivered += delq(l.id); });
    const rows = prodRows(p.id); let prep = 0, flag = false; rows.forEach(r => { prep += Math.min(r.prepared, r.ordered); if (r.flag) flag = true; });
    return { ordered, delivered, pending: ordered - delivered, prd: flag ? 'review' : !ordered || !prep ? 'none' : prep >= ordered ? 'done' : 'partial', del: !ordered || !delivered ? 'none' : delivered >= ordered ? 'done' : 'partial', orders: D().orders.filter(o => o.period_id === p.id && o.status === 'active').length };
  }
  const tone = k => ({ done: 'blue', partial: 'light', review: 'red', none: '' }[k]);
  const badge = (k) => `<span class="badge ${tone(k)}">${T('st_' + k)}</span>`;
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
  const csv = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const SWATCH = ['#1d1d1f', '#6b1f2e', '#274969', '#4a4f52', '#1c2a4a', '#8A5A00', '#2E6B4A', '#9A4A3C'];
  function pieceQty(pid, status) {
    return D().lines.reduce((a, l) => {
      if (l.period_id !== pid) return a;
      const o = D().ord[l.order_id];
      return o && o.status === status ? a + l.qty : a;
    }, 0);
  }
  function parseGroupLines(text) {
    return (text || '').split('\n').map(line => {
      const parts = line.split('|').map(s => s.trim());
      return parts[0] ? { teacher: parts[0], grade: parts[1] || '', room: parts[2] || '' } : null;
    }).filter(Boolean);
  }
  function parseColors(text, existing) {
    const prev = {};
    ((existing && existing.colors) || []).forEach(c => { prev[c.id] = c; });
    return csv(text).map((raw, i) => {
      const bits = raw.split('/').map(s => s.trim()).filter(Boolean);
      const esN = bits[0], enN = bits[1] || bits[0], id = slug(enN || esN), old = prev[id] || {};
      return { id, es: esN, en: enN, sw: old.sw || SWATCH[i % SWATCH.length], photo: old.photo || '', flag: !!old.flag };
    });
  }
  function parseModels(f) {
    const out = [];
    const push = (code, esN, enN) => {
      const c = (code || '').trim();
      if (!c) return;
      const id = slug(c);
      if (out.some(m => m.id === id)) return;
      out.push({ id, code: c, label: { es: (esN || c).trim(), en: (enN || esN || c).trim() } });
    };
    push(f.pr_code, f.pr_mes, f.pr_men);
    (f.pr_more || '').split('\n').forEach(line => { const p = line.split('|').map(s => s.trim()); if (p[0]) push(p[0], p[1], p[2]); });
    return out;
  }
  const publicUrl = p => new URL('index.html', location.href).href + '?p=' + p.slug;
  const LOGO_BUCKET = 'school-logos';
  const LOGO_MAX = 2 * 1024 * 1024;
  const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  const logoKind = file => {
    const t = (file && file.type || '').toLowerCase();
    if (LOGO_TYPES[t]) return { mime: t === 'image/jpg' ? 'image/jpeg' : t, ext: LOGO_TYPES[t] };
    const m = !t && String(file && file.name || '').toLowerCase().match(/\.(png|jpe?g|webp|svg)$/);
    const ext = m && (m[1] === 'jpeg' ? 'jpg' : m[1]);
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }[ext];
    return mime ? { mime, ext } : null;
  };
  const revokeLogoPreview = () => { if (A.logoPreview) { try { URL.revokeObjectURL(A.logoPreview); } catch (e) {} A.logoPreview = ''; } };
  const resetLogoPick = () => { revokeLogoPreview(); A.logoFile = null; A.logoErr = ''; A.logoBusy = false; A.logoOpen = false; };
  const storageErrText = error => !error ? '' : typeof error === 'string' ? error : [error.message, error.error, error.statusCode, error.status].filter(Boolean).join(' ');
  const storageKeyFromLogo = value => {
    const s = String(value || '');
    const marker = '/storage/v1/object/public/' + LOGO_BUCKET + '/';
    const at = s.indexOf(marker);
    let key = at >= 0 ? s.slice(at + marker.length).split('?')[0] : s;
    try { key = decodeURIComponent(key); } catch (e) { return ''; }
    return /^[0-9a-f-]{36}\.(png|jpg|webp|svg)$/i.test(key) ? key : '';
  };
  async function removeStoredLogo(value) {
    const key = storageKeyFromLogo(value);
    if (!key) return;
    try { await sb().storage.from(LOGO_BUCKET).remove([key]); } catch (e) {}
  }
  async function uploadSchoolLogo(file) {
    const kind = logoKind(file);
    if (!kind || !file.size) { A.logoErr = T('logoType'); toast(A.logoErr); return ''; }
    if (file.size > LOGO_MAX) { A.logoErr = T('logoSize'); toast(A.logoErr); return ''; }
    const path = JK.uuid() + '.' + kind.ext;
    const body = (file.type || '').toLowerCase() === kind.mime ? file : new Blob([await file.arrayBuffer()], { type: kind.mime });
    const { data, error } = await sb().storage.from(LOGO_BUCKET).upload(path, body, { contentType: kind.mime, cacheControl: '3600', upsert: false });
    if (error) {
      const raw = storageErrText(error);
      A.logoErr = /bucket|not found|row-level|policy|violates|42501|\b403\b/i.test(raw) ? T('logoNeedSql') : T('logoUpload');
      toast(A.logoErr);
      return '';
    }
    const pub = sb().storage.from(LOGO_BUCKET).getPublicUrl((data && data.path) || path);
    const url = pub && pub.data && pub.data.publicUrl;
    if (!url || url.length > 300) {
      try { await sb().storage.from(LOGO_BUCKET).remove([path]); } catch (e) {}
      A.logoErr = T('logoUpload'); toast(A.logoErr); return '';
    }
    return url;
  }  // ---- prendas: fotos, colores y tallas ----
  const PHOTO_BUCKET = 'product-photos';
  const PHOTO_MAX = 3 * 1024 * 1024;
  const PHOTO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
  const KID_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  const ADULT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
  const BIG_SIZES = ['2XL', '3XL', '4XL', '5XL'];
  const photoKind = file => {
    const t = (file && file.type || '').toLowerCase();
    if (PHOTO_TYPES[t]) return { mime: t === 'image/jpg' ? 'image/jpeg' : t, ext: PHOTO_TYPES[t] };
    const m = !t && String(file && file.name || '').toLowerCase().match(/\.(png|jpe?g|webp)$/);
    const ext = m && (m[1] === 'jpeg' ? 'jpg' : m[1]);
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext];
    return mime ? { mime, ext } : null;
  };
  const checkPhoto = file => { const k = photoKind(file); if (!k || !file.size) return T('photoType'); if (file.size > PHOTO_MAX) return T('photoSize'); return ''; };
  async function uploadGarmentPhoto(file) {
    const kind = photoKind(file);
    if (!kind) { A.g.err = T('photoType'); return ''; }
    const path = JK.uuid() + '.' + kind.ext;
    const body = (file.type || '').toLowerCase() === kind.mime ? file : new Blob([await file.arrayBuffer()], { type: kind.mime });
    const { data, error } = await sb().storage.from(PHOTO_BUCKET).upload(path, body, { contentType: kind.mime, cacheControl: '3600', upsert: false });
    if (error) { A.g.err = /bucket|not found|row-level|policy|violates|42501|\b403\b/i.test(storageErrText(error)) ? T('photoNeedSql') : T('photoUpload'); return ''; }
    const pub = sb().storage.from(PHOTO_BUCKET).getPublicUrl((data && data.path) || path);
    const url = pub && pub.data && pub.data.publicUrl;
    if (!url || url.length > 300) { try { await sb().storage.from(PHOTO_BUCKET).remove([path]); } catch (e) {} A.g.err = T('photoUpload'); return ''; }
    return url;
  }
  const colorLabel = c => c.es && c.en && c.es !== c.en ? c.es + ' / ' + c.en : (c.es || c.en || '');
  const newColor = (i, c) => ({ uid: JK.uuid(), id: (c && c.id) || '', name: c ? colorLabel(c) : '', sw: (c && c.sw) || SWATCH[i % SWATCH.length], photo: (c && c.photo) || '', flag: !!(c && c.flag), file: null, preview: '' });
  const revokeGarmentPreviews = () => { const G = A.g; if (!G) return; [G.photoPreview, ...G.colors.map(c => c.preview)].forEach(u => { if (u) { try { URL.revokeObjectURL(u); } catch (e) {} } }); };
  function blankGarment() {
    revokeGarmentPreviews();
    Object.assign(A.f, { pr_es: '', pr_en: '', pr_cat: 'school', pr_price: '', pr_extra: '', pr_design: '', pr_pers: 'none', pr_photo: '', pr_code: '', pr_mes: '', pr_men: '', pr_more: '', pr_map: '', pr_child_other: '', pr_adult_other: '' });
    A.g = { colors: [newColor(0)], child: [], adult: [], photoFile: null, photoPreview: '', busy: false, err: '' };
  }
  // Tallas: las casillas estándar en su orden y luego las «otras» escritas a mano, sin repetir.
  const pickSizes = (std, checked, other) => { const out = std.filter(z => checked.includes(z)); csv(other).forEach(z => { if (!out.includes(z)) out.push(z); }); return out; };
  // Si todas las tallas grandes cuestan precio + el mismo extra, se muestra ese extra; si no, el mapa queda en «Más opciones».
  function extraFromMap(price, map) {
    const ks = Object.keys(map || {}); if (!ks.length || price == null) return null;
    if (!ks.every(k => BIG_SIZES.includes(k))) return null;
    const d = ks.map(k => Number(map[k]) - Number(price)); return d.every(x => x === d[0] && x > 0) ? d[0] : null;
  }
  // Al editar, el modelo con el mismo código conserva su id: los pedidos ya guardados lo usan.
  const keepModelIds = (models, existing) => { const prev = (existing && existing.models) || []; const used = {};
    return models.map(m => { const o = prev.find(x => x.code === m.code && !used[x.id]); if (o) { used[o.id] = true; return { ...m, id: o.id }; } return m; }); };
  // Arma el objeto que recibe admin_save_product (misma forma que las prendas de Harder).
  function buildProduct(existing, uploaded) {
    const f = A.f, G = A.g, up = uploaded || {};
    const es = (f.pr_es || '').trim(), en = (f.pr_en || '').trim();
    if (!es && !en) return { err: T('msgGarmentName') };
    const used = {};
    const colors = [];
    for (const c of G.colors) {
      const bits = (c.name || '').split('/').map(x => x.trim()).filter(Boolean);
      if (!bits.length) continue;
      const cEs = bits[0], cEn = bits[1] || bits[0];
      let id = c.id || slug(cEn), n = 2; while (used[id]) id = (c.id || slug(cEn)) + '-' + n++;
      used[id] = true;
      const out = { id, es: cEs, en: cEn, sw: /^#[0-9a-f]{6}$/i.test(c.sw) ? c.sw : '#cccccc' };
      const ph = up[c.uid] !== undefined ? up[c.uid] : c.photo;
      if (ph) out.photo = ph;
      if (c.flag) out.flag = true;
      colors.push(out);
    }
    if (!colors.length) return { err: T('msgGarmentColor') };
    const child = pickSizes(KID_SIZES, G.child, f.pr_child_other), adult = pickSizes(ADULT_SIZES, G.adult, f.pr_adult_other);
    if (!child.length && !adult.length) return { err: T('msgGarmentSize') };
    if (child.length > 24 || adult.length > 24) return { err: T('msgProductInvalid') };
    const price = num(f.pr_price || ''); if (price === undefined || (price !== null && price < 0)) return { err: T('msgQty') };
    const map = {};
    if ((f.pr_map || '').trim()) {
      for (const pair of csv(f.pr_map)) { const [k, v] = pair.split(':'); const n2 = Number(v); if (!k || !k.trim() || v === undefined || isNaN(n2)) return { err: T('msgQty') }; map[k.trim()] = n2; }
    } else if ((f.pr_extra || '').trim()) {
      const x = num(f.pr_extra); if (x === undefined || x === null || x < 0) return { err: T('msgQty') };
      if (price !== null && x > 0) adult.filter(z => BIG_SIZES.includes(z)).forEach(z => { map[z] = Math.round((price + x) * 100) / 100; });
    }
    const mainPhoto = up.main !== undefined ? up.main : (f.pr_photo || '').trim();
    const photo = mainPhoto || (colors.find(c => c.photo) || {}).photo || '';
    let key = existing ? existing.key : slug(f.pr_code || en || es);
    if (!existing) { const taken = D().products.filter(x => x.period_id === A.cfg).map(x => x.key); const base = key; let n3 = 2; while (taken.includes(key)) key = base + '-' + n3++; }
    return { product: { key, category: f.pr_cat === 'staff' ? 'staff' : 'school', name: { es: es || en, en: en || es }, design: (f.pr_design || '').trim(), personalization: f.pr_pers || 'none', base_price: price, price_map: map,
      ages: [child.length ? 'child' : '', adult.length ? 'adult' : ''].filter(Boolean), sizes: { child, adult }, colors, models: keepModelIds(parseModels(f), existing), photo, enabled: existing ? existing.enabled : true, sort: existing ? existing.sort : 500 } };
  }


  // ---- validaciones previas a abrir (el servidor las repite) ----
  function validate(p) {
    const e = [], w = [], gs = D().groups.filter(g => g.period_id === p.id), ps = D().products.filter(x => x.period_id === p.id && x.enabled);
    if (!gs.length) e.push(T('vGroups')); if (!ps.some(x => !x.sizes_pending)) e.push(T('vProducts'));
    ps.forEach(x => { const n = loc(x.name); if (x.sizes_pending) w.push(T('wStaff').replace('{n}', n)); else if (x.pending_sizes.length) w.push(T('wSizes').replace('{n}', n + ' ' + x.pending_sizes.join('/'))); if (x.colors.some(c => c.flag)) w.push(T('wColor').replace('{n}', n)); });
    return { e, w };
  }

  // ---- vistas ----
  function filters() {
    const ps = D().periods.filter(p => A.fSchool === 'all' || p.school_id === A.fSchool);
    return `<div class="no-print card row" style="gap:14px;padding:14px 18px"><label style="flex:1 1 200px">${T('school')}<select data-s="fSchool" data-re data-clr="fPeriod">${opts([{ v: 'all', l: T('fAll') }, ...D().schools.map(s => ({ v: s.id, l: s.name }))], A.fSchool)}</select></label>
      <label style="flex:1 1 240px">${T('orderPeriod')}<select data-s="fPeriod" data-re>${opts([{ v: 'all', l: T('fAll') }, ...ps.map(p => ({ v: p.id, l: (A.fSchool === 'all' ? D().sch[p.school_id].name + ' · ' : '') + rng(p) }))], A.fPeriod)}</select></label></div>`;
  }
  function periodStats() {
    return fPeriods().map(p => ({ p, pre: pieceQty(p.id, 'preorder'), preN: D().orders.filter(o => o.period_id === p.id && o.status === 'preorder').length, x: stat(p) }));
  }
  function summaryHead() {
    const st = periodStats();
    const tot = { pre: 0, preN: 0, conf: 0, d: 0, p: 0 }; st.forEach(({ pre, preN, x }) => { tot.pre += pre; tot.preN += preN; tot.conf += x.ordered; tot.d += x.delivered; tot.p += x.pending; });
    const pendingCard = `<div class="card col callout" id="pending-review"><div class="row between" style="align-items:flex-end"><div><div class="eyebrow">${T('pendingReview')}</div><div class="row" style="align-items:flex-end;gap:28px"><div><div class="stat" data-pending-orders>${tot.preN}</div><div class="muted">${T('pendingReviewOrders')}</div></div><div><div class="stat" data-pending-pieces>${tot.pre}</div><div class="muted">${T('pendingReviewPieces')}</div></div></div></div><button class="btn" data-act="openPending">${T('reviewPending')}</button></div></div>`;
    const stats = [['prePieces', tot.pre], ['confPieces', tot.conf], ['delivered', tot.d], ['pending', tot.p]].map(([k, v]) => `<div class="card"><div class="stat">${v}</div><div class="muted">${T(k)}</div></div>`).join('');
    const bySchool = `<div class="card scroll"><h3 style="margin-bottom:10px">${T('bySchool')}</h3><table><thead><tr><th>${T('school')}</th><th class="num">${T('pendingPrePieces')}</th><th class="num">${T('confPieces')}</th><th class="num">${T('pendingShort')}</th></tr></thead><tbody>
      ${st.map(({ p, pre, x }) => `<tr><td><b>${esc(D().sch[p.school_id].name)}</b><div class="muted">${rng(p)}</div></td><td class="num"><b data-pre-pieces>${pre}</b></td><td class="num">${x.ordered}</td><td class="num">${x.pending}</td></tr>`).join('')}</tbody></table></div>`;
    return `${pendingCard}<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${stats}</div>
      <div class="row between"><div class="muted">${T('homeCountNote')}</div><button class="btn" data-act="openProdSum">${T('openProdSum')}</button></div>${bySchool}`;
  }
  function checksBlock() {
    const checks = periodStats().map(({ p, pre, x }) => { const a = x.ordered, b = prodRows(p.id).reduce((q, r) => q + r.ordered, 0), c = D().groups.filter(g => g.period_id === p.id).reduce((q, g) => q + act(p.id).filter(l => l.group_id === g.id).reduce((z, l) => z + l.qty, 0), 0), d = x.delivered + x.pending, ok = a === b && b === c && c === d, waiting = a === 0 && pre > 0;
      return `<tr><td>${esc(pname(p))}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num">${c}</td><td class="num">${d}</td><td><b style="color:${waiting ? '#8A5A00' : ok ? '#2E6B4A' : '#B3261E'}">${waiting ? T('preOnly') : ok ? T('okTxt') : T('badTxt')}</b></td></tr>`; }).join('');
    return `<div class="card scroll" id="checks"><h3>${T('checks')}</h3><div class="muted" style="margin-bottom:10px">${T('checksNote')}</div><table><thead><tr><th>${T('orderPeriod')}</th><th class="num">${T('cOrders')}</th><th class="num">${T('cProd')}</th><th class="num">${T('cPack')}</th><th class="num">${T('cDel')}</th><th></th></tr></thead><tbody>${checks}</tbody></table></div>`;
  }
  function vSchools() {
    const sf = A.schoolForm, f = A.f;
    const fresh = sf === 'new' ? `<h3>${T('schoolDates')}</h3><div class="grid"><label>${T('openFrom')}<input type="date" data-k="sc_open" value="${esc(f.sc_open)}"/></label><label>${T('openUntil')}<input type="date" data-k="sc_close" value="${esc(f.sc_close)}"/></label></div>
        <label>${T('groupLines')}<textarea data-k="sc_groups_text" rows="4" placeholder="Anciso | KN&#10;Bessolo | KN">${esc(f.sc_groups_text || '')}</textarea></label><div class="muted">${T('groupHint')}</div>
        <button type="button" class="lk" data-act="toggleMore" data-more="newSchool">${A.more.newSchool ? T('lessOpts') : T('moreOpts')}</button>
        ${A.more.newSchool ? `<label>${T('mode')}<select data-k="sc_mode">${opts([{ v: 'coord', l: T('mCoord') }, { v: 'each', l: T('mEach') }, { v: 'mixed', l: T('mMixed') }], f.sc_mode || 'mixed')}</select></label>` : ''}` : '';
    const savedLogo = logoSrc(f.sc_logo);
    const previewSrc = A.logoPreview || savedLogo;
    const hasLogo = !!(A.logoFile || (f.sc_logo || '').trim() || previewSrc);
    const logoOpen = `<div class="col" id="logo-editor" style="gap:8px"><span style="font-size:13px;font-weight:600">${T('logoFile')}</span>
      <div class="row" style="align-items:center">${previewSrc ? `<img class="logo-preview" src="${esc(previewSrc)}" alt="${esc(T('logoPreview'))}"/>` : ''}
        <label class="btn sec filebtn">${T('uploadLogo')}<input class="filepick" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" data-logo aria-label="${esc(T('uploadLogo'))}" ${A.logoBusy ? 'disabled' : ''}/></label>
        ${hasLogo ? `<button type="button" class="lk" data-act="clearLogo" ${A.logoBusy ? 'disabled' : ''}>${T('remove')}</button>` : ''}</div>
      <div class="muted">${T('logoSlot')}</div>${A.logoErr ? `<div class="err" role="alert">${esc(A.logoErr)}</div>` : ''}</div>`;
    const logoClosed = `<div class="row" id="logo-toggle" style="align-items:center">${savedLogo ? `<img class="logo-mini" src="${esc(savedLogo)}" alt="${esc(T('logoPreview'))}"/>` : ''}<button type="button" class="lk" data-act="toggleLogo" style="min-height:44px">${savedLogo ? T('changeLogo') : T('addLogo')}</button></div>`;
    const logoBox = A.logoOpen || A.logoBusy ? logoOpen : logoClosed;
    const form = sf ? `<div class="stack col"><h3>${sf === 'new' ? T('addSchool') : T('editSchool')}</h3><div class="muted">${sf === 'new' ? T('schoolSetup') : ''}</div>
      <div class="grid"><label>${T('name')}<input data-k="sc_name" value="${esc(f.sc_name)}"/></label><label>${T('collector')}<input data-k="sc_collector" value="${esc(f.sc_collector)}"/></label><label>${T('contactData')}<input data-k="sc_contact" value="${esc(f.sc_contact)}"/></label></div>
      ${logoBox}${fresh}<div class="row"><button class="btn" data-act="saveSchool" ${A.logoBusy ? 'disabled' : ''}>${A.logoBusy ? T('uploadingLogo') : T('save')}</button><button type="button" class="lk" data-act="cancelSchool" ${A.logoBusy ? 'disabled' : ''}>${T('cancel')}</button></div></div>` : '';
    const schools = `<div class="card col"><div class="row between"><h2>${T('nSchoolsOnly')}</h2><button class="btn" data-act="newSchool">+ ${T('addSchool')}</button></div>${form}<div class="scroll"><table><thead><tr><th>${T('name')}</th><th>${T('collector')}</th><th>${T('contactData')}</th><th></th></tr></thead><tbody>
      ${D().schools.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.collector)}</td><td>${esc(s.contact)}</td><td><div class="row" style="gap:4px 14px"><button type="button" class="btn sm" data-act="openGarments" data-id="${s.id}">${T('garmentsTeachers')}</button><button type="button" class="lk" data-act="editSchool" data-id="${s.id}">${T('edit')}</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
    const blocks = D().schools.filter(s => A.fSchool === 'all' || s.id === A.fSchool).map(s => {
      const nf = A.newFor === s.id ? `<div class="stack col"><h3>${T('newPeriod')}</h3><div class="grid"><label>${T('openFrom')}<input type="date" data-k="np_open" value="${esc(f.np_open)}"/></label><label>${T('openUntil')}<input type="date" data-k="np_close" value="${esc(f.np_close)}"/></label>
        <label>${T('mode')}<select data-k="np_mode">${opts([{ v: 'coord', l: T('mCoord') }, { v: 'each', l: T('mEach') }, { v: 'mixed', l: T('mMixed') }], f.np_mode || 'mixed')}</select></label></div><div class="muted">${T('copyNote')}</div>
        <div class="row"><button class="btn" data-act="createPeriod" data-id="${s.id}">${T('create')}</button><button class="btn ghost" data-act="cancelNew">${T('cancel')}</button></div></div>` : '';
      return `<div class="card col"><div class="row between"><h2>${esc(s.name)}</h2><button class="btn sm" data-act="newPeriod" data-id="${s.id}">+ ${T('newPeriod')}</button></div>${nf}<div class="scroll"><table><thead><tr><th>${T('dates')}</th><th>${T('mode')}</th><th>${T('status')}</th><th>${T('publicLink')}</th><th></th></tr></thead><tbody>
        ${D().periods.filter(p => p.school_id === s.id).map(p => `<tr><td><b>${rng(p)}</b></td><td>${T(p.mode === 'mixed' ? 'mMixed' : p.mode === 'coord' ? 'mCoord' : 'mEach')}</td>
        <td><div class="row" style="gap:8px"><select data-act="setStatus" data-id="${p.id}" style="width:200px">${opts([{ v: 'pending', l: T('stPending') }, { v: 'open', l: T('stOpen') }, { v: 'closed', l: T('stClosed') }], p.status)}</select><span class="muted">${stl(p)}</span></div></td>
        <td><button class="lk" data-act="copyLink" data-id="${p.id}">${T('copyLink')}</button><div class="muted">?p=${esc(p.slug)}</div></td><td><button type="button" class="lk" data-act="cfg" data-id="${p.id}">${T('garmentsTeachers')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
    return schools + blocks + cfgPanel();
  }
  function cfgPanel() {
    const p = A.cfg && D().per[A.cfg]; if (!p) return '';
    const s = D().sch[p.school_id] || {};
    const v = validate(p), f = A.f, gs = D().groups.filter(g => g.period_id === p.id), ps = D().products.filter(x => x.period_id === p.id).sort((a, b) => a.sort - b.sort), log = D().logs.filter(x => x.period_id === p.id);
    const done = [!!s.logo_path, ps.some(x => x.enabled && !x.sizes_pending), gs.length > 0, eff(p) === 'open'];
    const stepKeys = ['stepData', 'stepGarments', 'stepTeachers', 'stepOpen'];
    const pills = stepKeys.map((k, i) => `<button type="button" class="step-pill ${done[i] ? 'ok' : ''}" data-act="goStep" data-v="${i + 1}"><b>${i + 1}</b> ${T(k)}${done[i] ? ' ✓' : ''}</button>`).join('');
    const head = n => `<h3 class="step-h"><span>${n}</span> ${T(stepKeys[n - 1])}</h3>`;
    const sizesTxt = x => [['child', 'youth'], ['adult', 'adultW']].map(([k, l]) => (x.sizes && x.sizes[k] || []).length ? T(l) + ': ' + x.sizes[k].join(' ') : '').filter(Boolean).join(' · ');
    const prodList = ps.length ? `<div class="scroll"><table><thead><tr><th></th><th>${T('product')}</th><th>${T('catVariants')}</th><th class="num">${T('refPrice')}</th><th>${T('available')}</th></tr></thead><tbody>${ps.map(x => `<tr>
      <td style="width:60px">${x.photo ? `<img class="thumb" src="${esc(x.photo)}" alt=""/>` : `<span class="muted">${T('photoTbd')}</span>`}</td>
      <td><b>${esc(loc(x.name))}</b><div class="muted">${T(x.category === 'staff' ? 'catStaff' : 'catSchool')} ${esc((x.models || []).map(m => m.code).join(' / '))}</div><button type="button" class="lk" data-act="editGarment" data-id="${x.id}">${T('editGarment')}</button></td>
      <td><div class="row" style="gap:6px">${(x.colors || []).map(c => `<span class="sw-dot" title="${esc(loc(c))}" style="background:${esc(c.sw || '#ccc')}"></span>`).join('')}<span class="muted">${esc((x.colors || []).map(c => loc(c)).join(', '))}</span></div><div class="muted">${esc(sizesTxt(x))}</div></td>
      <td class="num">${x.base_price == null ? T('priceTbd') : money(x.base_price)}</td>
      <td><input type="checkbox" data-act="toggleProduct" data-id="${x.id}" ${x.enabled ? 'checked' : ''} aria-label="${esc(T('available'))}"/></td></tr>`).join('')}</tbody></table></div>` : `<div class="muted">${T('noGarmentsYet')}</div>`;
    const link = publicUrl(p);
    return `<div class="card col" id="cfg"><div class="row between"><div><div class="eyebrow">${T('garmentsTeachers')}</div><h2>${esc(T('garmentsOf').replace('{s}', s.name || ''))}</h2><div class="muted">${rng(p)}</div></div><button class="lk" data-act="closeCfg">${T('close2')} ✕</button></div>
      <div class="row step-pills">${pills}</div>
      <div class="col" id="cfg-1">${head(1)}<div class="row" style="align-items:center">${s.logo_path ? `<img class="logo-preview" src="${esc(logoSrc(s.logo_path))}" alt="${esc(s.name)}"/>` : `<span class="muted">${T('noLogoYet')}</span>`}<div><b>${esc(s.name || '')}</b><div class="muted">${esc([s.collector, s.contact].filter(Boolean).join(' · '))}</div></div></div>
        <button type="button" class="lk" data-act="editSchool" data-id="${s.id}">${T('editDataLogo')}</button></div>
      <div class="col" id="cfg-2">${head(2)}${prodList}${garmentForm(f)}</div>
      <div class="col" id="cfg-3">${head(3)}<div class="scroll"><table><thead><tr><th>${T('teacher')}</th><th>${T('grade')}</th><th>${T('room')}</th><th></th></tr></thead><tbody>${gs.map(g => `<tr><td>${esc(g.teacher)}</td><td>${esc(g.grade) || '—'}</td><td>${esc(g.room) || '—'}</td><td><button class="lk" data-act="delGroup" data-id="${g.id}">${T('remove')}</button></td></tr>`).join('')}</tbody></table></div>
        <div class="grid"><label>${T('teacher')}<input data-k="gr_teacher" value="${esc(f.gr_teacher || '')}"/></label><label>${T('grade')}<input data-k="gr_grade" value="${esc(f.gr_grade || '')}"/></label><label>${T('room')}<input data-k="gr_room" value="${esc(f.gr_room || '')}"/></label></div><div class="row"><button class="btn sec sm" data-act="addGroup">+ ${T('addGroup')}</button></div></div>
      <div class="col" id="cfg-4">${head(4)}
        <div class="note col"><b>${T('validation')}</b>${v.e.length ? '' : `<div class="ok">${T('validOk')}</div>`}${v.e.map(t => `<div class="err">• ${esc(t)}</div>`).join('')}${v.w.map(t => `<div class="warn">• ${esc(t)}</div>`).join('')}</div>
        <label>${T('status')}<select data-act="setStatus" data-id="${p.id}" style="max-width:260px">${opts([{ v: 'pending', l: T('stPending') }, { v: 'open', l: T('stOpen') }, { v: 'closed', l: T('stClosed') }], p.status)}</select></label>
        <div class="grid"><label>${T('openFrom')}<input type="date" data-k="ed_open" value="${esc(f.ed_open)}"/></label><label>${T('openUntil')}<input type="date" data-k="ed_close" value="${esc(f.ed_close)}"/></label></div>
        <div class="row"><button class="btn sec sm" data-act="saveDates">${T('saveDates')}</button></div>${log.length ? `<div class="muted"><b>${T('dateLog')}</b>${log.map(h => `<div>${fdt(h.at)} · ${esc(h.by_email || '')} · ${esc(h.detail)}</div>`).join('')}</div>` : ''}
        <div class="col" style="gap:6px"><b>${T('publicLink')}</b><input readonly value="${esc(link)}" onclick="this.select()"/>
          <div class="row"><button class="btn sm" data-act="copyLink" data-id="${p.id}">${T('copyLink')}</button><a class="btn sec sm" href="${esc(link)}" target="_blank" rel="noopener">${T('previewParents')}</a></div></div>
        <div class="col" style="gap:6px"><b>${T('iframeTitle')}</b><div class="muted">${T('iframeHint')}</div><textarea readonly rows="3" id="iframe-snippet" onclick="this.select()">${esc(iframeSnippet(p))}</textarea>
          <div class="row"><button class="btn sec sm" data-act="copyIframe" data-id="${p.id}">${T('copyIframe')}</button></div></div></div></div>`;
  }
  const iframeSnippet = p => `<iframe src="${publicUrl(p)}" title="Preórdenes escolares" style="width:100%;height:1400px;border:0;display:block;"></iframe>`;
  function garmentForm(f) {
    const editing = !!A.editProd, G = A.g, busy = G.busy;
    const mainSrc = G.photoPreview || (f.pr_photo || '').trim();
    const sizeBoxes = (age, list) => list.map(z => `<label class="szbox"><input type="checkbox" data-act="toggleSize" data-v="${age}:${esc(z)}" ${G[age].includes(z) ? 'checked' : ''}/> ${esc(z)}</label>`).join('');
    const colorRows = G.colors.map(c => {
      const ph = c.preview || c.photo;
      return `<div class="row color-row" style="align-items:center">
        <input type="color" class="swatch-pick" data-gc="${c.uid}:sw" value="${esc(/^#[0-9a-f]{6}$/i.test(c.sw) ? c.sw : '#cccccc')}" aria-label="${esc(T('colorPick'))}"/>
        <input data-gc="${c.uid}:name" value="${esc(c.name)}" placeholder="${esc(T('colorNamePh'))}" style="flex:1 1 180px;max-width:280px" aria-label="${esc(T('colorName'))}"/>
        ${ph ? `<img class="thumb" src="${esc(ph)}" alt=""/>` : ''}
        <label class="lk filebtn-lk">${ph ? T('changeColorPhoto') : T('colorPhoto')}<input class="filepick" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-gcphoto="${c.uid}" ${busy ? 'disabled' : ''}/></label>
        ${ph ? `<button type="button" class="lk" data-act="clearColorPhoto" data-id="${c.uid}">${T('remove')}</button>` : ''}
        ${G.colors.length > 1 ? `<button type="button" class="lk" data-act="delColor" data-id="${c.uid}" aria-label="${esc(T('removeColor'))}">✕</button>` : ''}</div>`;
    }).join('');
    const extra = A.more.garment ? `<div class="grid">
        <label>${T('nameEn')}<input data-k="pr_en" value="${esc(f.pr_en || '')}"/></label>
        <label>${T('modelCode')}<input data-k="pr_code" value="${esc(f.pr_code || '')}" placeholder="ST941"/></label>
        <label>${T('modelEs')}<input data-k="pr_mes" value="${esc(f.pr_mes || '')}"/></label><label>${T('modelEn')}<input data-k="pr_men" value="${esc(f.pr_men || '')}"/></label>
        <label>${T('design')}<input data-k="pr_design" value="${esc(f.pr_design || '')}"/></label>
        <label>${T('pers')}<select data-k="pr_pers">${opts([{ v: 'none', l: T('pNone') }, { v: 'name', l: T('pName') }, { v: 'nameNumber', l: T('pNameNum') }], f.pr_pers || 'none')}</select></label>
        <label>${T('priceMapLbl')}<input data-k="pr_map" value="${esc(f.pr_map || '')}" placeholder="2XL:14, 3XL:16"/></label>
        <label>${T('photoPath')}<input data-k="pr_photo" value="${esc(f.pr_photo || '')}" placeholder="assets/img/sleeve-black.jpg"/></label></div>
        <label>${T('moreModels')}<textarea data-k="pr_more" rows="3" placeholder="ST941 | Hombre | Men">${esc(f.pr_more || '')}</textarea></label>
        <div class="muted">${T('priceMapHint')}</div>` : '';
    return `<div id="garment-form" class="stack col garment-form"><h3>${editing ? T('editGarment') : '+ ' + T('addProduct')}</h3>
      <div class="grid"><label>${T('garmentName')}<input data-k="pr_es" value="${esc(f.pr_es || '')}" placeholder="${esc(T('garmentNamePh'))}"/></label>
        <label>${T('garmentFor')}<select data-k="pr_cat">${opts([{ v: 'school', l: T('catSchool') }, { v: 'staff', l: T('catStaff') }], f.pr_cat || 'school')}</select></label></div>
      <div class="col" style="gap:8px"><span class="flabel">${T('garmentPhoto')}</span><div class="row" style="align-items:center">
        ${mainSrc ? `<img class="photo-preview" src="${esc(mainSrc)}" alt="${esc(T('garmentPhoto'))}"/>` : `<div class="photo-empty muted">${T('photoTbd')}</div>`}
        <label class="filebtn upload-big">${T('uploadPhoto')}<input class="filepick" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-gphoto aria-label="${esc(T('uploadPhoto'))}" ${busy ? 'disabled' : ''}/></label>
        ${mainSrc ? `<button type="button" class="lk" data-act="clearGarmentPhoto">${T('remove')}</button>` : ''}</div><div class="muted">${T('photoHint')}</div></div>
      <div class="col" style="gap:8px"><span class="flabel">${T('colorsTitle')}</span>${colorRows}<button type="button" class="lk" data-act="addColor">+ ${T('addColor')}</button><div class="muted">${T('colorsHint2')}</div></div>
      <div class="col" style="gap:8px"><span class="flabel">${T('sizesTitle')}</span>
        <div class="row szrow"><b class="szlbl">${T('kidSizes')}</b>${sizeBoxes('child', KID_SIZES)}<input data-k="pr_child_other" value="${esc(f.pr_child_other || '')}" placeholder="${esc(T('otherSizesPh'))}" aria-label="${esc(T('otherSizes'))}" style="max-width:200px"/></div>
        <div class="row szrow"><b class="szlbl">${T('adultSizes')}</b>${sizeBoxes('adult', ADULT_SIZES)}<input data-k="pr_adult_other" value="${esc(f.pr_adult_other || '')}" placeholder="${esc(T('otherSizesPh'))}" aria-label="${esc(T('otherSizes'))}" style="max-width:200px"/></div></div>
      <div class="grid"><label>${T('priceLbl')}<input data-k="pr_price" value="${esc(f.pr_price || '')}" inputmode="decimal" placeholder="13"/></label>
        <label>${T('bigExtra')}<input data-k="pr_extra" value="${esc(f.pr_extra || '')}" inputmode="decimal" placeholder="2"/></label></div>
      ${G.err ? `<div class="err" role="alert">${esc(G.err)}</div>` : ''}
      <button type="button" class="lk" data-act="toggleMore" data-more="garment">${A.more.garment ? T('lessOpts') : T('moreOpts')}</button>${extra}
      <div class="row"><button class="btn" data-act="addProduct" ${busy ? 'disabled' : ''}>${busy ? T('uploadingPhoto') : editing ? T('save') : '+ ' + T('addProduct')}</button>${editing ? `<button type="button" class="lk" data-act="cancelGarment">${T('cancel')}</button>` : ''}</div></div>`;
  }

  function vOrders() {
    const ids = fPeriods().map(p => p.id), g = A.f.o_group || 'all', status = A.f.o_status || 'all';
    const sig = o => o.period_id + '|' + o.registrant_name.toLowerCase() + '|' + D().lines.filter(l => l.order_id === o.id).map(l => [l.group_id, l.variant_key, l.qty, l.personalization].join(':')).sort().join(',');
    const sigs = {}; D().orders.filter(o => o.status === 'active').forEach(o => { const k = sig(o); sigs[k] = (sigs[k] || 0) + 1; });
    const rows = D().orders.filter(o => ids.includes(o.period_id) && (status === 'all' || o.status === status) && (g === 'all' || D().lines.some(l => l.order_id === o.id && l.group_id === g))).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const gopts = [{ v: 'all', l: T('fAll') }, ...fPeriods().flatMap(p => D().groups.filter(x => x.period_id === p.id).map(x => ({ v: x.id, l: (fPeriods().length > 1 ? rng(p) + ' · ' : '') + gl(x) })))];
    return `<div class="card col"><div class="row between" style="align-items:flex-end"><h3>${T('tabOrders')} (${rows.length})</h3><label style="flex:0 1 260px;min-width:180px">${T('teacher')}<select data-k="o_group" data-re>${opts(gopts, g)}</select></label></div><div class="scroll"><table><thead><tr><th>#</th><th>${T('registeredAt')}</th><th>${T('registeredBy')}</th><th>${T('orderPeriod')}</th><th class="num">${T('ordered')}</th><th>${T('status')}</th><th></th></tr></thead><tbody>
      ${rows.map(o => `<tr><td><b>${esc(o.number)}</b></td><td>${fdt(o.created_at)}</td><td>${esc(o.registrant_name)}<div class="muted">${esc(o.registrant_contact)}</div></td><td>${esc(pname(D().per[o.period_id]))}</td><td class="num">${D().lines.filter(l => l.order_id === o.id).reduce((a, l) => a + l.qty, 0)}</td><td>${T(o.status === 'preorder' ? 'stPreorder' : o.status === 'active' ? 'stActive' : 'stCancelled')}${o.status === 'active' && sigs[sig(o)] > 1 ? `<div class="err">${T('dupFlag')}</div>` : ''}</td><td><button class="btn sec" data-act="openOrder" data-id="${o.id}">${T('viewOrder')}</button></td></tr>`).join('')}</tbody></table></div></div>${orderDetail()}`;
  }
  function vPedidos() {
    const status = A.f.o_status || 'all';
    const filters = [['preorder', 'filterPreorder'], ['active', 'filterConfirmed'], ['delivered', 'filterDelivered'], ['all', 'filterAllOrders']].map(([v, k]) => `<button type="button" class="btn ${status === v ? '' : 'sec'}" data-act="setOrderFilter" data-v="${v}">${T(k)}</button>`).join('');
    return summaryHead() + `<div class="row" id="order-filters">${filters}</div><div id="order-list">${status === 'delivered' ? vDeliveries() : vOrders()}</div>`;
  }
  function orderDetail() {
    const o = A.orderSel && D().ord[A.orderSel]; if (!o) return '';
    const p = D().per[o.period_id], ls = D().lines.filter(l => l.order_id === o.id), gs = D().groups.filter(g => g.period_id === p.id), editable = o.status !== 'cancelled';
    const ev = (l, k, d) => (A.eq[l.id + ':' + k] !== undefined ? A.eq[l.id + ':' + k] : d);
    const corr = editable ? `<h3>${T('correction')}</h3><div class="muted">${T('corrNote')}</div>` + ls.map(l => { const pr = D().prod[l.product_id];
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px" class="col"><div style="font-weight:700">${esc(dsc(l))} · ${esc(szl(l))} · ${esc(loc(l.color_name))}</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <label>${T('group')}<select data-m="eq" data-k="${l.id}:g">${opts(gs.map(g => ({ v: g.id, l: gl(g) })), ev(l, 'g', l.group_id))}</select></label>
        <label>${T('color')}<select data-m="eq" data-k="${l.id}:c">${opts(pr.colors.map(c => ({ v: c.id, l: loc(c) })), ev(l, 'c', l.color_id))}</select></label>
        <label>${T('size')}<select data-m="eq" data-k="${l.id}:s">${opts(((pr.sizes || {})[l.age] || [l.size]).map(z => ({ v: z, l: z })), ev(l, 's', l.size))}</select></label>
        <label>${T('qty')}<input data-m="eq" data-k="${l.id}:q" value="${esc(ev(l, 'q', l.qty))}" ${l.personalization ? 'disabled' : ''}/></label>
        ${l.personalization ? `<label>${T('pers')}<input data-m="eq" data-k="${l.id}:t" value="${esc(ev(l, 't', l.personalization))}"/></label>` : ''}</div>
        <div class="row"><button class="btn sm" data-act="saveLine" data-id="${l.id}">${T('saveCorr')}</button></div></div>`; }).join('') +
      `<div class="row" style="align-items:flex-end"><label style="flex:1 1 260px">${T('cancelReason')}<input data-k="cancel" value="${esc(A.f.cancel)}"/></label><button class="btn sec" data-act="cancelOrder" data-id="${o.id}">${T('cancelOrder')}</button></div>` : '';
    return `<div class="card col"><div class="row between"><div><div class="eyebrow">${T('detail')}</div><h2>${esc(o.number)}</h2></div><button class="lk" data-act="closeOrder">${T('close2')} ✕</button></div>
      <div class="grid"><div><div class="muted">${T('registeredBy')}</div><b>${esc(o.registrant_name)}</b> · ${T({ coord: 'roleCoord', teacher: 'roleTeacher', rep: 'roleRep' }[o.registrant_role])}<div class="muted">${esc(o.registrant_contact)}</div></div><div><div class="muted">${T('registeredAt')}</div><b>${fdt(o.created_at)}</b></div><div><div class="muted">${T('orderPeriod')}</div><b>${esc(pname(p))}</b></div><div><div class="muted">${T('status')}</div><b>${T(o.status === 'preorder' ? 'stPreorder' : o.status === 'active' ? 'stActive' : 'stCancelled')}</b>${editable ? '' : `<div class="err">${T('cancelledInfo')} ${esc(o.cancel_reason)}</div>`}</div></div>
      <div class="scroll"><table><thead><tr><th>${T('teacher')}</th><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('qty')}</th><th class="num">${T('delivered2')}</th><th>${T('pers')}</th></tr></thead><tbody>
      ${ls.map(l => `<tr><td>${esc(D().grp[l.group_id] ? D().grp[l.group_id].teacher : '')}</td><td>${esc(dsc(l))}</td><td>${esc(loc(l.color_name))}</td><td>${esc(szl(l))}</td><td class="num">${l.qty}</td><td class="num">${delq(l.id)}</td><td><b>${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</b></td></tr>`).join('')}</tbody></table></div>${corr}${o.status === 'preorder' ? `<button class="btn" data-act="confirmPreorder" data-id="${o.id}">${T('confirmPreorder')}</button>` : ''}
      <h3>${T('history')}</h3><table><thead><tr><th>${T('registeredAt')}</th><th>${T('by')}</th><th>${T('action')}</th><th>${T('detail')}</th></tr></thead><tbody>${D().hist.filter(h => h.order_id === o.id).sort((a, b) => a.at.localeCompare(b.at)).map(h => `<tr><td>${fdt(h.at)}</td><td>${esc(h.by_email || '')}</td><td>${T('a_' + h.action)}</td><td>${esc(h.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function vProduction() {
    return fPeriods().map(p => {
      const rows = prodRows(p.id), ds = {}; rows.forEach(r => (ds[r.design] = ds[r.design] || []).push(r));
      const blocks = Object.keys(ds).map(d => `<div class="scroll"><div style="font-weight:700;color:var(--terracotta);margin:6px 0">${T('design')}: ${esc(d)} · ${ds[d].reduce((a, r) => a + r.ordered, 0)} ${T('pcs')}</div>
        <table><thead><tr><th></th><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('ordered2')}</th><th class="num">${T('prepared')}</th><th class="num">${T('pendingShort')}</th><th>${T('setPrepared')}</th><th></th></tr></thead><tbody>
        ${ds[d].map(r => `<tr><td style="width:60px">${r.photo ? `<img class="thumb" src="${esc(r.photo)}" alt=""/>` : ''}</td><td>${esc(dsc(r))}</td><td>${esc(loc(r.color_name))}</td><td>${esc(szl(r))}</td><td class="num">${r.ordered}</td><td class="num">${r.prepared}</td><td class="num">${r.pending}</td>
        <td><div class="row" style="gap:6px"><input class="sm" data-m="pq" data-k="${esc(p.id + '#' + r.key)}" value="${esc(A.pq[p.id + '#' + r.key] !== undefined ? A.pq[p.id + '#' + r.key] : r.prepared)}" inputmode="numeric"/><button class="lk" data-act="savePrep" data-p="${p.id}" data-key="${esc(r.key)}">${T('save')}</button><button class="lk" style="color:var(--deep-blue)" data-act="allPrep" data-p="${p.id}" data-key="${esc(r.key)}" data-n="${r.ordered}">${T('allPrepared')}</button></div></td>
        <td>${r.flag ? `<div class="err">${T('flagTxt').replace('{a}', r.was).replace('{b}', r.ordered)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('');
      const pre = pieceQty(p.id, 'preorder');
      const empty = pre ? `<div class="col"><div class="warn">${T('prodEmptyPre').replace('{n}', pre)}</div><div class="row"><button class="btn sm" data-act="openProdSum">${T('openProdSum')}</button></div></div>` : `<div class="muted">${T('noItems')}</div>`;
      return `<div class="card col"><div><div class="eyebrow">${esc(D().sch[p.school_id].name)}</div><h2>${rng(p)}</h2></div>${blocks || empty}</div>`;
    }).join('') + `<div class="muted">${T('prodNote')}</div>`;
  }
  function vDeliveries() {
    return fPeriods().map(p => { const ls = act(p.id);
      const packs = D().groups.filter(g => g.period_id === p.id).map(g => { const gl2 = ls.filter(l => l.group_id === g.id); if (!gl2.length) return ''; const key = p.id + '|' + g.id, open = A.delSel === key;
        let q = 0, d = 0; gl2.forEach(l => { q += l.qty; d += delq(l.id); }); const sk = d === 0 ? 'none' : d >= q ? 'done' : 'partial';
        const hist = D().deliveries.filter(x => x.period_id === p.id && x.group_id === g.id).map(x => { const n = D().dlines.filter(z => z.delivery_id === x.id).reduce((a, z) => a + z.qty, 0); return `<div class="muted">${fd(x.delivered_on)} · ${esc(x.received_by)} · ${n} ${T('pcs')}${x.notes ? ' · ' + esc(x.notes) : ''}</div>`; }).join('');
        return `<div class="card col"><div class="row between"><div><h3 style="color:var(--terracotta)">${esc(gl(g))}</h3><div class="muted">${T('ordered2')} ${q} · ${T('delivered2')} ${d} · ${T('pendingShort')} ${q - d}</div></div><div class="row">${badge(sk)}<button class="btn sec sm" data-act="toggleDel" data-key="${key}" ${q - d === 0 ? 'disabled' : ''}>${open ? T('closeDelivery') : T('openDelivery')}</button></div></div>
        ${open ? `<div class="grid" style="background:var(--paper);padding:14px;border-radius:12px"><label>${T('date')}<input type="date" data-k="dl_date" value="${esc(A.f.dl_date || todayLA())}"/></label><label>${T('receivedBy')}<input data-k="dl_by" value="${esc(A.f.dl_by)}"/></label><label>${T('notes')}<input data-k="dl_notes" value="${esc(A.f.dl_notes)}"/></label></div>` : ''}
        <div class="scroll"><table><thead><tr><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('ordered2')}</th><th class="num">${T('delivered2')}</th><th class="num">${T('pendingShort')}</th>${open ? `<th>${T('deliverNow')}</th>` : ''}</tr></thead><tbody>
        ${gl2.map(l => `<tr><td>${esc(dsc(l))}<div class="muted">${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</div></td><td>${esc(loc(l.color_name))}</td><td>${esc(szl(l))}</td><td class="num">${l.qty}</td><td class="num">${delq(l.id)}</td><td class="num">${l.qty - delq(l.id)}</td>${open ? `<td><input class="sm" data-m="dq" data-k="${l.id}" value="${esc(A.dq[l.id] || '')}" inputmode="numeric"/></td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${open ? `<div class="row"><button class="btn" data-act="regDelivery" data-p="${p.id}" data-g="${g.id}">${T('registerDelivery')}</button></div>` : ''}${hist ? `<div><b style="font-size:13px">${T('deliveryHistory')}</b>${hist}</div>` : ''}</div>`; }).join('');
      return `<div class="col"><div><div class="eyebrow">${esc(D().sch[p.school_id].name)}</div><h2>${rng(p)}</h2></div>${packs}</div>`; }).join('');
  }

  // ---- reportes imprimibles ----
  function sheets() {
    const rl = A.rLang, R = k => T(k, rl), ps = fPeriods(), out = [], now = new Date(), ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const code = { preorders: 'SOL', production: 'PRD', prodsum: 'SUM', prep: rl === 'es' ? 'PRE' : 'PREP', individual: 'IND', delivery: rl === 'es' ? 'ENT' : 'DEL' }[A.rType] || 'RPT';
    const rowT = (l, extra = '') => `<tr>${extra}<td>${esc(dsc(l, rl))}<div>${esc(l.design || '')}</div></td><td>${esc(loc(l.color_name, rl))}</td><td>${esc(szl(l, rl))}</td>`;
    const rg = ps.length === 1 && D().groups.some(g => g.id === A.rGroup && g.period_id === ps[0].id) ? A.rGroup : 'all';
    ps.forEach(p => {
      const s = D().sch[p.school_id], gsel = rg === 'all' ? null : D().grp[rg], schoolLogo = logoSrc(s.logo_path);
      const head = (title, g) => `<div class="${A.rType === 'prodsum' ? 'sheet prodsum' : 'sheet'}"><div class="row between" style="align-items:flex-start;border-bottom:2px solid var(--deep-blue);padding-bottom:12px;margin-bottom:14px"><div><h1>${title}</h1><div style="font-size:15px;font-weight:700;margin-top:4px">${esc(s.name)} · ${rng(p, rl)}</div><div style="font-size:13px">${g ? esc(gl(g, rl)) : ''}</div></div><div class="row" style="gap:14px">${schoolLogo ? `<img src="${esc(schoolLogo)}" alt="" style="height:64px;width:auto"/>` : ''}<img src="assets/logo-color.svg" alt="" style="height:52px;width:auto"/></div></div>
        <div style="font-size:12px;color:#555;margin-bottom:14px">${R('filters')}: ${R('school')}: ${esc(s.name)} · ${R('orderPeriod')}: ${rng(p, rl)} · ${R('teacher')}: ${gsel ? esc(gsel.teacher) : R('fAll')} · ${R('generated')}: ${now.toLocaleString(rl === 'es' ? 'es-US' : 'en-US')} · ID: <b>RPT-${code}-${p.id.slice(0, 4).toUpperCase()}${g ? '-' + g.id.slice(0, 4).toUpperCase() : ''}-${ymd}</b></div>`;
      const gs = D().groups.filter(g => g.period_id === p.id && (rg === 'all' || g.id === rg));
      if (A.rType === 'prodsum') { out.push(prodSummarySheet(p, s, rg, gsel, rl, R, head)); } else if (A.rType === 'preorders') { const ls = D().lines.filter(l => l.period_id === p.id && (rg === 'all' || l.group_id === rg) && D().ord[l.order_id].status !== 'cancelled'); out.push(head(R('r_preorders'), gsel) + `<table><thead><tr><th># / ${R('status')}</th><th>${R('registeredBy')}</th><th>${R('teacher')}</th><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th>${R('qty')}</th><th>${R('pers')}</th></tr></thead><tbody>${ls.map(l => { const o=D().ord[l.order_id]; return rowT(l, `<td>${esc(o.number)}<div>${R(o.status === 'preorder' ? 'stPreorder' : 'stActive')}</div></td><td>${esc(o.registrant_name)}</td><td>${esc(D().grp[l.group_id].teacher)}</td>`) + `<td>${l.qty}</td><td>${esc(l.personalization)}</td></tr>`; }).join('')}</tbody></table></div>`); } else if (A.rType === 'production') {
        const rows = prodRows(p.id, rg).filter(r => r.ordered > 0), ds = {}; rows.forEach(r => (ds[r.design] = ds[r.design] || []).push(r));
        out.push(head(R('r_production'), null) + (rg !== 'all' ? `<p>${R('groupProgressNote')}</p>` : '') + Object.keys(ds).map(d => `<div style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:4px">${R('design')}: ${esc(d)}</div><table><thead><tr><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('ordered2')}</th><th class="num">${R('prepared')}</th><th class="num">${R('pendingShort')}</th></tr></thead><tbody>
          ${ds[d].map(r => rowT(r) + `<td class="num">${r.ordered}</td><td class="num">${rg === 'all' ? r.prepared : '—'}</td><td class="num">${rg === 'all' ? r.pending : '—'}</td></tr>`).join('')}<tr><td colspan="3"><b>${R('subtotal')}</b></td><td class="num"><b>${ds[d].reduce((a, r) => a + r.ordered, 0)}</b></td><td class="num"><b>${rg === 'all' ? ds[d].reduce((a, r) => a + r.prepared, 0) : '—'}</b></td><td class="num"><b>${rg === 'all' ? ds[d].reduce((a, r) => a + r.pending, 0) : '—'}</b></td></tr></tbody></table></div>`).join('') + `<div style="font-weight:800;font-size:16px">${R('total')}: ${rows.reduce((a, r) => a + r.ordered, 0)}</div></div>`);
      } else if (A.rType === 'prep') {
        gs.forEach(g => { const ls = act(p.id).filter(l => l.group_id === g.id); if (!ls.length) return;
          out.push(head(R('r_prep'), g) + `<table><thead><tr><th style="width:30px"></th><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('qty')}</th><th>${R('pers')}</th></tr></thead><tbody>${ls.map(l => rowT(l, '<td><span class="box"></span></td>') + `<td class="num">${l.qty}</td><td>${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</td></tr>`).join('')}</tbody></table><div style="font-weight:800;font-size:16px;margin-top:12px">${R('packTotal')}: ${ls.reduce((a, l) => a + l.qty, 0)}</div><div style="font-size:12px;color:#555;margin-top:10px">${R('paperNote')}</div></div>`); });
      } else if (A.rType === 'delivery') {
        out.push(...deliverySheets(p, s, rg, rl, R));
      } else {
        const rows = []; gs.forEach(g => act(p.id).filter(l => l.group_id === g.id && l.personalization).forEach(l => rows.push({ g, l })));
        out.push(head(R('r_individual'), gsel) + (rows.length ? `<table><thead><tr><th>${R('teacher')}</th><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th>${R('exactText')}</th></tr></thead><tbody>${rows.map(({ g, l }) => rowT(l, `<td>${esc(g.teacher)}</td>`) + `<td><b>“${esc(l.personalization)}”</b></td></tr>`).join('')}</tbody></table>` : `<div>${R('noInd')}</div>`) + '</div>');
      }
    });
    return out.join('') || `<div class="muted">${T('noItems')}</div>`;
  }
  function sizeRank(age, size) {
    const order = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'Y2XL', 'Y3XL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];
    let token = String(size || '').trim().toUpperCase();
    if (age === 'child' && token && token.charAt(0) !== 'Y') {
      if (token === 'XS') token = 'YXS';
      else if (token === 'S' || token === 'M' || token === 'L' || token === 'XL') token = 'Y' + token;
      else if (/^\d+XL$/.test(token)) token = 'Y' + token;
    }
    const i = order.indexOf(token);
    return i < 0 ? 80 : i;
  }
  function deliverySheets(p, s, rg, rl, R) {
    const includePre = A.packPre !== false;
    const groups = D().groups.filter(g => g.period_id === p.id && (rg === 'all' || g.id === rg)).slice()
      .sort((a, b) => (a.teacher || '').localeCompare(b.teacher || '', rl === 'es' ? 'es' : 'en') || (a.grade || '').localeCompare(b.grade || '', rl === 'es' ? 'es' : 'en') || (a.room || '').localeCompare(b.room || ''));
    const note = includePre ? R('packNoteIn') : R('packNoteOut');
    const logo = logoSrc(s.logo_path);
    const out = [];
    groups.forEach(g => {
      const raw = D().lines.filter(l => {
        if (l.period_id !== p.id || l.group_id !== g.id) return false;
        const o = D().ord[l.order_id];
        if (!o || o.status === 'cancelled' || (o.status !== 'active' && o.status !== 'preorder')) return false;
        return includePre || o.status === 'active';
      });
      if (!raw.length) return;
      const map = new Map();
      raw.forEach(l => {
        const name = loc(l.product_name, rl) || '';
        const pers = (l.personalization || '').trim();
        const key = [name, l.code || '', l.color_id || '', l.age || '', l.size || '', pers].join('\u0001');
        const row = map.get(key) || { name, code: l.code || '', color: loc(l.color_name, rl), age: l.age || '', size: l.size || '', pers, qty: 0 };
        row.qty += Number(l.qty) || 0;
        map.set(key, row);
      });
      const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, rl === 'es' ? 'es' : 'en') || sizeRank(a.age, a.size) - sizeRank(b.age, b.size) || a.color.localeCompare(b.color, rl === 'es' ? 'es' : 'en') || a.pers.localeCompare(b.pers, rl === 'es' ? 'es' : 'en'));
      const total = rows.reduce((n, r) => n + r.qty, 0);
      const who = [g.teacher, g.grade, g.room ? R('room') + ' ' + g.room : ''].filter(Boolean).join(' · ');
      out.push(`<div class="sheet pack" data-teacher="${esc(g.teacher)}"><div class="row between" style="align-items:flex-start;border-bottom:2px solid var(--deep-blue);padding-bottom:12px;margin-bottom:14px"><div><div class="eyebrow">${esc(s.name)}</div><h1>${R('r_delivery')}</h1><h2>${esc(who)}</h2><div style="font-size:14px">${rng(p, rl)}</div></div><div class="row" style="gap:14px">${logo ? `<img src="${esc(logo)}" alt="" style="height:64px;width:auto"/>` : ''}<img src="assets/logo-color.svg" alt="" style="height:52px;width:auto"/></div></div><p style="font-size:13px;margin:0 0 12px">${esc(note)}</p><table><thead><tr><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('qty')}</th><th>${R('pers')}</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b>${r.code ? `<div>${esc(r.code)}</div>` : ''}</td><td>${esc(r.color)}</td><td>${esc(szl(r, rl))}</td><td class="num">${r.qty}</td><td>${r.pers ? '“' + esc(r.pers) + '”' : ''}</td></tr>`).join('')}</tbody></table><div style="font-weight:800;font-size:16px;margin-top:12px">${R('packTotal')}: ${total}</div></div>`);
    });
    return out;
  }
  function reportGroupId() {
    const ps = fPeriods();
    return ps.length === 1 && D().groups.some(g => g.id === A.rGroup && g.period_id === ps[0].id) ? A.rGroup : 'all';
  }
  function summaryLines(p, groupId) {
    const rl = A.rLang;
    return D().lines.filter(l => {
      if (l.period_id !== p.id) return false;
      const o = D().ord[l.order_id];
      if (!o || !JKProd.statusOk(o.status, A.rStatus || 'all')) return false;
      if (groupId && groupId !== 'all' && l.group_id !== groupId) return false;
      return true;
    }).map(l => {
      const g = D().grp[l.group_id] || {}, o = D().ord[l.order_id];
      return {
        code: l.code || '', name: loc(l.product_name, rl), modelId: l.model_id || '', model: l.model_label ? loc(l.model_label, rl) : '',
        colorId: l.color_id || '', color: loc(l.color_name, rl), design: l.design || '', groupId: l.group_id || '',
        groupLabel: g.teacher ? gl(g, rl) : '', teacher: g.teacher || '', grade: g.grade || '', room: g.room || '',
        age: l.age || '', size: l.size || '', qty: l.qty || 0, personalization: (l.personalization || '').trim(), orderNumber: o.number || ''
      };
    });
  }
  function prodStatusLabel(R) {
    return A.rStatus === 'preorder' ? R('sumPreorder') : A.rStatus === 'active' ? R('sumActive') : R('sumAll');
  }
  function matrixTable(sum, R) {
    const byGroup = !!A.rByGroup, youth = sum.columns.filter(JKProd.isYouth), adult = sum.columns.filter(c => !JKProd.isYouth(c));
    const lead = 4 + (byGroup ? 1 : 0);
    const groupHead = (cols, label) => cols.length ? `<th class="grp" colspan="${cols.length}">${label}</th>` : '';
    const sizeHeads = sum.columns.map(c => `<th class="sz" scope="col">${esc(c)}</th>`).join('');
    const cells = r => sum.columns.map(c => `<td class="sz">${r.qty[c] ? r.qty[c] : ''}</td>`).join('');
    const body = sum.rows.map(r => `<tr><td><b>${esc(r.code ? r.code + ' · ' : '')}${esc(r.name)}</b></td><td>${esc(r.model) || '—'}</td><td>${esc(r.color) || '—'}</td><td>${esc(r.design) || '—'}</td>${byGroup ? `<td>${esc(r.groupLabel) || '—'}</td>` : ''}${cells(r)}<td class="num"><b>${r.total}</b></td></tr>`).join('');
    const grand = `<tr class="grand"><td colspan="${lead}">${R('grandTotal')}</td>${sum.columns.map(c => `<td class="sz">${sum.grand.qty[c] || 0}</td>`).join('')}<td class="num">${sum.grand.total}</td></tr>`;
    return `<div class="scroll"><table class="matrix"><thead><tr><th rowspan="2" scope="col">${R('product')}</th><th rowspan="2" scope="col">${R('model')}</th><th rowspan="2" scope="col">${R('color')}</th><th rowspan="2" scope="col">${R('design')}</th>${byGroup ? `<th rowspan="2" scope="col">${R('group')}</th>` : ''}${groupHead(youth, R('youthSizes'))}${groupHead(adult, R('adultSizes'))}<th rowspan="2" class="num" scope="col">${R('total')}</th></tr><tr>${sizeHeads}</tr></thead><tbody>${body}${grand}</tbody></table></div>`;
  }
  function persTable(sum, R) {
    const title = `<h2>${R('persList')}</h2>`;
    if (!sum.pers.length) return title + `<div>${R('noPers')}</div>`;
    return title + `<div class="scroll"><table><thead><tr><th>${R('orderNo')}</th><th>${R('group')}</th><th>${R('product')}</th><th>${R('model')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('qty')}</th><th>${R('exactText')}</th></tr></thead><tbody>${sum.pers.map(l => `<tr><td><b>${esc(l.orderNumber)}</b></td><td>${esc(l.groupLabel)}</td><td>${esc((l.code ? l.code + ' · ' : '') + l.name)}</td><td>${esc(l.model) || '—'}</td><td>${esc(l.color)}</td><td>${esc(l.sizeLabel)}</td><td class="num">${l.qty}</td><td><b>“${esc(l.personalization)}”</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function prodSummarySheet(p, s, rg, gsel, rl, R, head) {
    const sum = JKProd.summarize(summaryLines(p, rg), { byGroup: !!A.rByGroup });
    const meta = `<div class="note">${R('prodStatus')}: <b>${esc(prodStatusLabel(R))}</b>${A.rByGroup ? ' · ' + esc(R('byGroup')) : ''}</div><p class="note">${R('prodSumNote')}</p>`;
    const body = sum.rows.length ? matrixTable(sum, R) + `<p class="note">${R('sizeHint')}</p>` : `<div>${R('noItems')}</div>`;
    return head(R('r_prodsum'), gsel) + meta + body + persTable(sum, R) + '</div>';
  }
  function prodCsv() {
    const rl = A.rLang, R = k => T(k, rl), rg = reportGroupId(), now = new Date();
    const lines = [];
    const push = row => lines.push(row.map(JKProd.csvEscape).join(','));
    fPeriods().forEach(p => {
      const s = D().sch[p.school_id], gsel = rg === 'all' ? null : D().grp[rg];
      const sum = JKProd.summarize(summaryLines(p, rg), { byGroup: !!A.rByGroup });
      push([R('r_prodsum')]);
      push([R('school'), s.name]);
      push([R('orderPeriod'), rng(p, rl)]);
      push([R('prodStatus'), prodStatusLabel(R)]);
      push([R('teacher'), gsel ? gsel.teacher : R('fAll')]);
      push([R('byGroup'), A.rByGroup ? 'yes' : 'no']);
      push([R('generated'), now.toLocaleString(rl === 'es' ? 'es-US' : 'en-US')]);
      push([]);
      const head = [R('code'), R('product'), R('model'), R('color'), R('design')];
      if (A.rByGroup) head.push(R('group'));
      push(head.concat(sum.columns, [R('total')]));
      sum.rows.forEach(r => {
        const row = [r.code, r.name, r.model, r.color, r.design];
        if (A.rByGroup) row.push(r.groupLabel);
        sum.columns.forEach(c => row.push(r.qty[c] || 0));
        row.push(r.total);
        push(row);
      });
      const grand = [R('grandTotal'), '', '', '', ''];
      if (A.rByGroup) grand.push('');
      sum.columns.forEach(c => grand.push(sum.grand.qty[c] || 0));
      grand.push(sum.grand.total);
      push(grand);
      push([]);
      push([R('persList')]);
      push([R('orderNo'), R('group'), R('code'), R('product'), R('model'), R('color'), R('size'), R('qty'), R('exactText')]);
      sum.pers.forEach(l => push([l.orderNumber, l.groupLabel, l.code, l.name, l.model, l.color, l.sizeLabel, l.qty, l.personalization]));
      push([]);
    });
    return lines.join('\r\n');
  }
  function vReports() {
    const ps = fPeriods(), gopts = [{ v: 'all', l: T('fAll') }, ...(ps.length === 1 ? D().groups.filter(g => g.period_id === ps[0].id).map(g => ({ v: g.id, l: gl(g) })) : [])];
    const preparing = A.rType === 'prepare';
    const extra = A.more.report ? `<div class="grid"><label>${T('reportLang')}<select data-s="rLang" data-re>${opts([{ v: 'es', l: 'Español' }, { v: 'en', l: 'English' }], A.rLang)}</select></label>
      <label>${T('paper')}<select data-s="rPaper" data-re>${opts([{ v: 'letter', l: T('letterOpt') }, { v: 'a4', l: 'A4' }], A.rPaper)}</select></label>
      ${A.rType === 'prodsum' ? `<label>${T('prodStatus')}<select data-s="rStatus" data-re>${opts([{ v: 'all', l: T('sumAll') }, { v: 'preorder', l: T('sumPreorder') }, { v: 'active', l: T('sumActive') }], A.rStatus || 'all')}</select></label>
      <label style="flex-direction:row;align-items:center;gap:10px;min-height:44px"><input type="checkbox" data-s="rByGroup" data-re ${A.rByGroup ? 'checked' : ''}/> <span>${T('byGroup')}</span></label>` : ''}</div>` : '';
    const packBar = `<div class="row" id="pack-bar"><button type="button" class="btn ${A.packPre === false ? 'sec' : ''}" data-act="setPack" data-v="pre">${T('packInclude')}</button><button type="button" class="btn ${A.packPre === false ? '' : 'sec'}" data-act="setPack" data-v="confirmed">${T('packOnly')}</button><button class="btn" data-act="print" id="pack-print">${T('printPdf')}</button></div>`;
    const tools = A.rType === 'delivery' ? packBar : preparing ? `<p class="muted" style="margin:0">${T('prepareHint')}</p>` : `<div class="row"><button class="btn" data-act="print">${T('print')}</button>${A.rType === 'prodsum' ? `<button type="button" class="lk" data-act="csvProd">${T('downloadCsv')}</button>` : ''}<span class="muted">${A.rType === 'prodsum' ? T('prodSumPrint') : T('printNote')}</span></div>`;
    return `<div class="no-print card col"><div class="row"><button class="btn" data-act="openPack">${T('r_delivery')}</button></div><div class="grid"><label>${T('reportType')}<select data-s="rType" data-re>${opts(['prodsum', 'delivery', 'prepare', 'preorders', 'prep', 'individual', 'production'].map(k => ({ v: k, l: T('r_' + k) })), A.rType)}</select></label>
      <label>${T('teacher')}<select data-s="rGroup" data-re>${opts(gopts, A.rGroup)}</select></label></div>
      <button type="button" class="lk" data-act="toggleMore" data-more="report">${A.more.report ? T('lessOpts') : T('moreOpts')}</button>${extra}
      ${A.rType === 'prodsum' ? `<p class="muted" style="margin:0">${T('reportLand')}</p>` : ''}${A.rType === 'production' ? `<p class="warn" style="margin:0">${T('prepOnly')}</p>` : ''}
      ${tools}</div>${preparing ? vProduction() : sheets()}<div class="no-print">${checksBlock()}</div>`;
  }

  // ---- armado ----
  const VIEWS = [['schools', 'tabSchools', vSchools], ['orders', 'tabOrders', vPedidos], ['reports', 'tabReports', vReports]];
  const langBtns = () => ['es', 'en'].map(l => `<button class="lang ${JK.lang === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('');
  function render() {
    document.documentElement.lang = JK.lang;
    const pg = document.getElementById('pgsize') || Object.assign(document.head.appendChild(document.createElement('style')), { id: 'pgsize' });
    pg.textContent = '@page{size:' + (A.rPaper === 'a4' ? 'A4' : 'letter') + (A.view === 'reports' && A.rType === 'prodsum' ? ' landscape' : '') + ';margin:12mm}';
    if (!JK.configured()) { root.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto"><b class="err">${T('eConfig')}</b></div>`; return; }
    const authShell = inner => `<div class="col" style="max-width:420px;margin:40px auto;padding:0 16px"><div class="row between"><img src="assets/logo-color.svg" alt="JKINnovations" style="height:60px;width:auto"/><div class="row" style="gap:6px">${langBtns()}</div></div>${inner}</div>`;
    if (A.recovery) {
      if (A.authReady && !A.user) {
        root.innerHTML = authShell(`<div class="card auth-card col"><h2>${T('setPassword')}</h2><div class="err" role="alert">${T('ePassLink')}</div><button class="btn sec" data-act="cancelRecovery">${T('backLogin')}</button></div>`);
        return;
      }
      const typ = A.showPass ? 'text' : 'password';
      root.innerHTML = authShell(`<div class="card auth-card col"><h2>${T('setPassword')}</h2><p class="muted" style="margin:0">${T('setPasswordHelp')}</p>
        <label>${T('newPassword')}<input type="${typ}" data-k="np_pass" value="${esc(A.f.np_pass || '')}" autocomplete="new-password" ${A.user ? '' : 'disabled'}/></label>
        <label>${T('confirmPassword')}<input type="${typ}" data-k="np_pass2" value="${esc(A.f.np_pass2 || '')}" autocomplete="new-password" ${A.user ? '' : 'disabled'}/></label>
        <button type="button" class="lk" data-act="togglePass" style="align-self:flex-start">${A.showPass ? T('hidePassword') : T('showPassword')}</button>
        ${A.msg ? `<div class="err" role="alert">${esc(A.msg)}</div>` : ''}${A.user ? '' : `<div class="muted">…</div>`}
        <button class="btn" data-act="savePassword" ${A.sending || !A.user ? 'disabled' : ''}>${A.sending ? T('sending') : T('savePassword')}</button>
        <button type="button" class="lk" data-act="cancelRecovery" style="align-self:flex-start">${T('backLogin')}</button></div>`);
      return;
    }
    if (!A.user) {
      if (A.gate === 'sent') {
        root.innerHTML = authShell(`<div class="card auth-card col"><h2>${T('forgot')}</h2><div class="ok" role="status">${T('resetSent')}</div><button class="btn sec" data-act="backLogin">${T('backLogin')}</button></div>`);
        return;
      }
      if (A.gate === 'forgot') {
        root.innerHTML = authShell(`<div class="card auth-card col"><h2>${T('forgot')}</h2><p class="muted" style="margin:0">${T('forgotHelp')}</p>
          <label>${T('email')}<input type="email" data-k="li_email" value="${esc(A.f.li_email || '')}" autocomplete="username"/></label>
          ${A.msg ? `<div class="err" role="alert">${esc(A.msg)}</div>` : ''}
          <button class="btn" data-act="sendReset" ${A.sending ? 'disabled' : ''}>${A.sending ? T('sending') : T('sendReset')}</button>
          <button type="button" class="lk" data-act="backLogin" style="align-self:flex-start">${T('backLogin')}</button></div>`);
        return;
      }
      root.innerHTML = authShell(`<div class="card auth-card col"><h2>${T('login')}</h2><label>${T('email')}<input type="email" data-k="li_email" value="${esc(A.f.li_email || '')}" autocomplete="username"/></label><label>${T('password')}<input type="password" data-k="li_pass" autocomplete="current-password"/></label>
        <button type="button" class="lk" data-act="forgot" style="align-self:flex-start">${T('forgot')}</button>
        ${A.msg ? `<div class="err" role="alert">${esc(A.msg)}</div>` : ''}<button class="btn" data-act="login">${T('login')}</button></div>`); return;
    }
    if (!A.ok) { root.innerHTML = `<div class="card col" style="max-width:520px;margin:40px auto"><b class="err">${T('noAccess')}</b><div class="muted">${esc(A.user.email)}</div><button class="btn sec" data-act="logout">${T('logout')}</button></div>`; return; }
    if (!A.D) { root.innerHTML = `<div style="padding:40px;text-align:center" class="muted">${A.toast ? esc(A.toast) : '…'}</div>`; return; }
    const cur = VIEWS.find(v => v[0] === A.view);
    root.innerHTML = `<div class="shell"><aside class="side no-print"><img src="assets/logo-white.svg" alt="JKINnovations" style="height:48px;width:auto;align-self:flex-start"/><nav>${VIEWS.map(v => `<button class="${A.view === v[0] ? 'on' : ''}" data-act="nav" data-v="${v[0]}">${T(v[1])}</button>`).join('')}</nav><button data-act="logout">${T('logout')}</button></aside>
      <main class="main"><div class="no-print row between" style="align-items:flex-end"><div><div class="eyebrow">${T('app')}</div><h1>${T(cur[1])}</h1></div><div class="row" style="gap:6px">${langBtns()}<button class="btn sec sm" data-act="reload">${A.loading ? '…' : T('refresh')}</button></div></div>
      ${filters()}${A.toast ? `<div class="no-print toast">${esc(A.toast)}</div>` : ''}${cur[2]()}</main></div>`;
  }

  // ---- acciones ----
  const focusSchoolForm = () => { const i = document.querySelector('[data-k="sc_name"]'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus({ preventScroll: true }); } };
  const num = s => { const n = String(s).trim() === '' ? null : Number(s); return n !== null && isNaN(n) ? undefined : n; };
  const acts = {
    lang: el => { JK.setLang(el.dataset.v); A.rLang = el.dataset.v; render(); },
    nav: el => { A.view = el.dataset.v; render(); },
    openProdSum: () => { A.view = 'reports'; A.rType = 'prodsum'; A.rStatus = A.rStatus || 'all'; render(); },
    openPack: () => { A.view = 'reports'; A.rType = 'delivery'; A.rPaper = A.rPaper || 'letter'; render(); const bar = document.getElementById('pack-print'); if (bar) bar.scrollIntoView({ block: 'center' }); },
    setPack: el => { A.packPre = el.dataset.v !== 'confirmed'; render(); },
    openPending: () => { A.view = 'orders'; A.f.o_status = 'preorder'; A.orderSel = null; render(); const el = document.getElementById('order-list'); if (el) el.scrollIntoView({ block: 'start' }); },
    toggleMore: el => { A.more[el.dataset.more] = !A.more[el.dataset.more]; render(); },
    setOrderFilter: el => { A.f.o_status = el.dataset.v; A.orderSel = null; render(); const box = document.getElementById('order-list'); if (box) box.scrollIntoView({ block: 'start' }); },
    reload: () => loadAll(), print: () => window.print(),
    csvProd: () => {
      const blob = new Blob(['\uFEFF' + prodCsv()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'resumen-produccion-' + todayLA() + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    login: async () => { A.msg = ''; const { data, error } = await sb().auth.signInWithPassword({ email: (A.f.li_email || '').trim(), password: document.querySelector('[data-k=li_pass]').value }); if (error) { A.msg = T('eLogin'); return render(); } await afterAuth(data.user); },
    forgot: () => { A.gate = 'forgot'; A.msg = ''; render(); },
    backLogin: () => { A.gate = ''; A.msg = ''; A.sending = false; render(); },
    togglePass: () => {
      const p1 = document.querySelector('[data-k=np_pass]'), p2 = document.querySelector('[data-k=np_pass2]');
      if (p1) A.f.np_pass = p1.value; if (p2) A.f.np_pass2 = p2.value;
      A.showPass = !A.showPass; render();
    },
    sendReset: async () => {
      if (A.sending) return;
      const email = (document.querySelector('[data-k=li_email]') ? document.querySelector('[data-k=li_email]').value : A.f.li_email || '').trim();
      A.f.li_email = email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { A.msg = T('eEmail'); return render(); }
      A.sending = true; A.msg = ''; render();
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: adminRedirect() });
      A.sending = false;
      if (error) { A.msg = T('eReset'); return render(); }
      A.gate = 'sent'; A.msg = ''; render();
    },
    savePassword: async () => {
      if (A.sending) return;
      const p1 = document.querySelector('[data-k=np_pass]') ? document.querySelector('[data-k=np_pass]').value : '';
      const p2 = document.querySelector('[data-k=np_pass2]') ? document.querySelector('[data-k=np_pass2]').value : '';
      A.f.np_pass = p1; A.f.np_pass2 = p2;
      if (p1.length < 8) { A.msg = T('ePassShort'); return render(); }
      if (p1 !== p2) { A.msg = T('ePassMatch'); return render(); }
      A.sending = true; A.msg = ''; render();
      const { data, error } = await sb().auth.updateUser({ password: p1 });
      A.sending = false;
      if (error) { A.msg = T('ePassSave'); return render(); }
      A.f.np_pass = ''; A.f.np_pass2 = ''; A.showPass = false; clearRecovery();
      const clean = new URL(location.href); clean.hash = '';
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
      await afterAuth((data && data.user) || A.user);
    },
    cancelRecovery: async () => {
      clearRecovery(); A.f.np_pass = ''; A.f.np_pass2 = ''; A.showPass = false; A.msg = ''; A.sending = false; A.gate = '';
      try { await sb().auth.signOut(); } catch (e) {}
      A.user = null; A.ok = false; A.D = null;
      const clean = new URL(location.href); clean.hash = '';
      history.replaceState(null, '', clean.pathname + clean.search);
      render();
    },
    logout: async () => { clearRecovery(); A.gate = ''; await sb().auth.signOut(); A.user = null; A.ok = false; A.D = null; render(); },
    newSchool: () => { A.schoolForm = 'new'; A.editProd = null; resetLogoPick(); Object.assign(A.f, { sc_name: '', sc_collector: '', sc_contact: '', sc_logo: '', sc_open: todayLA(), sc_close: '', sc_mode: 'mixed', sc_groups_text: '' }); render(); focusSchoolForm(); },
    editSchool: el => { const s = D().sch[el.dataset.id]; A.view = 'schools'; A.schoolForm = s.id; resetLogoPick(); Object.assign(A.f, { sc_name: s.name, sc_collector: s.collector, sc_contact: s.contact, sc_logo: s.logo_path || '' }); render(); focusSchoolForm(); },
    cancelSchool: () => { A.schoolForm = null; resetLogoPick(); render(); },
    toggleLogo: () => { if (A.logoBusy) return; A.logoOpen = true; render(); const box = document.getElementById('logo-editor'); if (box) box.scrollIntoView({ block: 'nearest' }); },
    clearLogo: () => { if (A.logoBusy) return; revokeLogoPreview(); A.logoFile = null; A.f.sc_logo = ''; A.logoErr = ''; A.logoOpen = true; render(); },
    saveSchool: async () => {
      if (A.logoBusy) return;
      const f = A.f; if (!(f.sc_name || '').trim()) return toast(T('msgSchoolInvalid'));
      if (A.schoolForm === 'new') {
        if (!f.sc_open || !f.sc_close || f.sc_close < f.sc_open) return toast(T('msgPeriodInvalid'));
        if (!parseGroupLines(f.sc_groups_text).length) return toast(T('vGroups'));
      }
      const previous = (f.sc_logo || '').trim();
      let logo = previous;
      if (A.logoFile) {
        A.logoBusy = true; render();
        logo = await uploadSchoolLogo(A.logoFile);
        A.logoBusy = false;
        if (!logo) return render();
      }
      if (A.schoolForm === 'new') {
        const groups = parseGroupLines(f.sc_groups_text);
        const r = await rpc('admin_create_school', { p_name: f.sc_name.trim(), p_collector: f.sc_collector || '', p_contact: f.sc_contact || '', p_logo: logo, p_open: f.sc_open, p_close: f.sc_close, p_mode: f.sc_mode || 'mixed', p_groups: groups });
        if (r.error) { if (logo !== previous) await removeStoredLogo(logo); return; }
        resetLogoPick(); A.schoolForm = null; await loadAll();
        if (r.data && r.data.period_id) { A.fSchool = r.data.school_id; acts.cfg({ dataset: { id: r.data.period_id } }); }
        return toast(T('schoolReady'));
      }
      const r = await rpc('admin_update_school', { p_school: A.schoolForm, p_name: f.sc_name.trim(), p_collector: f.sc_collector || '', p_contact: f.sc_contact || '', p_logo: logo });
      if (r.error) { if (logo !== previous) await removeStoredLogo(logo); return; }
      if (previous !== logo) await removeStoredLogo(previous);
      resetLogoPick(); A.schoolForm = null; await loadAll(); toast(T('msgSaved'));
    },
    newPeriod: el => { A.newFor = el.dataset.id; Object.assign(A.f, { np_open: todayLA(), np_close: '', np_mode: 'mixed' }); render(); }, cancelNew: () => { A.newFor = null; render(); },
    createPeriod: async el => { const f = A.f; if (!f.np_open || !f.np_close || f.np_close < f.np_open) return toast(T('msgPeriodInvalid'));
      const r = await rpc('admin_create_period', { p_school: el.dataset.id, p_open: f.np_open, p_close: f.np_close, p_mode: f.np_mode || 'mixed' }); if (r.error) return; A.newFor = null; await loadAll(); acts.cfg({ dataset: { id: r.data } }); toast(T('msgCreated')); },
    setStatus: async el => { const r = await rpc('admin_set_period_status', { p_period: el.dataset.id, p_status: el.value }); await loadAll(); if (!r.error) toast(T('msgSaved')); },
    copyLink: async el => { const u = publicUrl(D().per[el.dataset.id]); try { await navigator.clipboard.writeText(u); toast(T('copied')); } catch (e) { prompt(T('publicLink'), u); } },
    cfg: el => { const p = D().per[el.dataset.id]; if (A.cfg !== p.id) { A.editProd = null; blankGarment(); } A.cfg = p.id; A.f.ed_open = p.open_date; A.f.ed_close = p.close_date; render(); const b = document.getElementById('cfg'); if (b) b.scrollIntoView({ block: 'start' }); }, closeCfg: () => { A.cfg = null; render(); },
    saveDates: async () => { if (!A.f.ed_open || !A.f.ed_close || A.f.ed_close < A.f.ed_open) return toast(T('dateErr')); const r = await rpc('admin_update_dates', { p_period: A.cfg, p_open: A.f.ed_open, p_close: A.f.ed_close }); await loadAll(); if (!r.error) toast(T('msgSaved')); },
    addGroup: async () => { const f = A.f; if (!(f.gr_teacher || '').trim()) return; const { error } = await sb().from('groups').insert({ period_id: A.cfg, teacher: f.gr_teacher.trim(), grade: f.gr_grade || '', room: f.gr_room || '', sort: 999 }); if (error) return toast(errMsg(error)); Object.assign(f, { gr_teacher: '', gr_grade: '', gr_room: '' }); await loadAll(); },
    delGroup: async el => { const { error } = await sb().from('groups').delete().eq('id', el.dataset.id); if (error) return toast(T('msgGroupUsed')); await loadAll(); },
    toggleProduct: async el => { const r = await rpc('admin_set_product_enabled', { p_id: el.dataset.id, p_enabled: el.checked }); await loadAll(); if (!r.error) toast(T('msgSaved')); },
    saveProduct: async el => { const x = D().prod[el.dataset.id], g = k => A.pf[x.id] && A.pf[x.id][k]; const price = g('price') !== undefined ? num(g('price')) : x.base_price; if (price === undefined) return toast(T('msgQty'));
      const map = {}; if (g('map') !== undefined) { for (const pair of csv(g('map'))) { const [k, v] = pair.split(':'); const n = Number(v); if (!k || isNaN(n)) return toast(T('msgQty')); map[k.trim()] = n; } } else Object.assign(map, x.price_map);
      const child = g('child') !== undefined ? csv(g('child')) : (x.sizes.child || []), adult = g('adult') !== undefined ? csv(g('adult')) : (x.sizes.adult || []);
      if (!child.length && !adult.length) return toast(T('msgProductInvalid'));
      const ages = [child.length ? 'child' : '', adult.length ? 'adult' : ''].filter(Boolean);
      const product = { key: x.key, category: x.category, name: x.name, design: x.design || '', personalization: x.personalization || 'none', base_price: price, price_map: map, ages, sizes: { child, adult }, colors: x.colors || [], models: x.models || [], photo: x.photo || '', enabled: x.enabled, sort: x.sort };
      const r = await rpc('admin_save_product', { p_period: x.period_id, p_id: x.id, p_product: product }); if (r.error) return; delete A.pf[x.id]; await loadAll(); toast(T('msgSaved')); },
    editGarment: el => {
      const x = D().prod[el.dataset.id], models = x.models || [], first = models[0] || {};
      blankGarment();
      A.editProd = x.id;
      const ch = (x.sizes && x.sizes.child) || [], ad = (x.sizes && x.sizes.adult) || [];
      const ex = extraFromMap(x.base_price == null ? null : Number(x.base_price), x.price_map);
      Object.assign(A.f, {
        pr_es: (x.name && x.name.es) || '', pr_en: (x.name && x.name.en) || '', pr_cat: x.category || 'school',
        pr_child_other: ch.filter(z => !KID_SIZES.includes(z)).join(', '), pr_adult_other: ad.filter(z => !ADULT_SIZES.includes(z)).join(', '),
        pr_price: x.base_price == null ? '' : String(x.base_price), pr_design: x.design || '', pr_pers: x.personalization || 'none', pr_photo: x.photo || '',
        pr_code: first.code || '', pr_mes: (first.label && first.label.es) || '', pr_men: (first.label && first.label.en) || '',
        pr_more: models.slice(1).map(m => [m.code, (m.label && m.label.es) || '', (m.label && m.label.en) || ''].filter(Boolean).join(' | ')).join('\n'),
        pr_extra: ex == null ? '' : String(ex),
        pr_map: ex == null ? Object.entries(x.price_map || {}).map(([k, v]) => k + ':' + v).join(', ') : ''
      });
      A.g.child = ch.filter(z => KID_SIZES.includes(z)); A.g.adult = ad.filter(z => ADULT_SIZES.includes(z));
      A.g.colors = (x.colors || []).length ? x.colors.map((c, i) => newColor(i, c)) : [newColor(0)];
      if (A.f.pr_map) A.more.garment = true;
      render();
      const box = document.getElementById('garment-form'); if (box) box.scrollIntoView({ block: 'start' });
    },
    cancelGarment: () => { A.editProd = null; blankGarment(); render(); },
    addColor: () => { A.g.colors.push(newColor(A.g.colors.length)); render(); },
    delColor: el => { const c = A.g.colors.find(x => x.uid === el.dataset.id); if (c && c.preview) { try { URL.revokeObjectURL(c.preview); } catch (e) {} } A.g.colors = A.g.colors.filter(x => x.uid !== el.dataset.id); if (!A.g.colors.length) A.g.colors.push(newColor(0)); render(); },
    clearColorPhoto: el => { const c = A.g.colors.find(x => x.uid === el.dataset.id); if (!c) return; if (c.preview) { try { URL.revokeObjectURL(c.preview); } catch (e) {} } c.preview = ''; c.file = null; c.photo = ''; render(); },
    clearGarmentPhoto: () => { if (A.g.photoPreview) { try { URL.revokeObjectURL(A.g.photoPreview); } catch (e) {} } A.g.photoPreview = ''; A.g.photoFile = null; A.f.pr_photo = ''; render(); },
    toggleSize: el => { const [age, z] = el.dataset.v.split(':'); const list = A.g[age]; A.g[age] = el.checked ? (list.includes(z) ? list : list.concat(z)) : list.filter(x => x !== z); },
    goStep: el => { const b = document.getElementById('cfg-' + el.dataset.v); if (b) b.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    openGarments: el => { const p = D().periods.filter(x => x.school_id === el.dataset.id).sort((a, b) => b.open_date.localeCompare(a.open_date))[0]; if (!p) return toast(T('noPeriodYet')); A.fSchool = 'all'; acts.cfg({ dataset: { id: p.id } }); },
    copyIframe: async el => { const u = iframeSnippet(D().per[el.dataset.id]); try { await navigator.clipboard.writeText(u); toast(T('iframeCopied')); } catch (e) { const t = document.getElementById('iframe-snippet'); if (t) t.select(); } },
    addProduct: async () => {
      if (A.g.busy) return;
      const existing = A.editProd ? D().prod[A.editProd] : null;
      const check = buildProduct(existing, {});
      if (check.err) { A.g.err = check.err; toast(check.err); return; }
      A.g.err = '';
      const uploaded = {};
      const jobs = [];
      if (A.g.photoFile) jobs.push(['main', A.g.photoFile]);
      A.g.colors.forEach(c => { if (c.file) jobs.push([c.uid, c.file]); });
      if (jobs.length) {
        A.g.busy = true; render();
        for (const [k, file] of jobs) { const url = await uploadGarmentPhoto(file); if (!url) { A.g.busy = false; toast(A.g.err); return render(); } uploaded[k] = url; }
        A.g.busy = false;
      }
      const built = buildProduct(existing, uploaded);
      if (built.err) { A.g.err = built.err; toast(built.err); return render(); }
      const r = await rpc('admin_save_product', { p_period: A.cfg, p_id: existing ? existing.id : null, p_product: built.product });
      if (r.error) return render();
      A.editProd = null; blankGarment(); await loadAll(); toast(T('msgSaved')); },
    confirmPreorder: async el => { if (!window.confirm(T('confirmQuestion'))) return; const r = await rpc('admin_confirm_preorder', { p_order: el.dataset.id }); if (!r.error) { await loadAll(); toast(T('msgSaved')); } },
    openOrder: el => { A.orderSel = el.dataset.id; render(); }, closeOrder: () => { A.orderSel = null; render(); },
    saveLine: async el => { const l = D().lines.find(x => x.id === el.dataset.id), g = (k, d) => A.eq[l.id + ':' + k] !== undefined ? A.eq[l.id + ':' + k] : d;
      const r = await rpc('admin_correct_line', { p_line: l.id, p_group: g('g', l.group_id), p_color: g('c', l.color_id), p_size: g('s', l.size), p_qty: Number(g('q', l.qty)), p_text: g('t', l.personalization) });
      Object.keys(A.eq).filter(k => k.startsWith(l.id)).forEach(k => delete A.eq[k]); await loadAll(); if (!r.error) toast(r.data && r.data.production_started ? T('msgCorr') + ' ' + T('msgProdStarted') : T('msgCorr')); },
    cancelOrder: async el => { const r = await rpc('admin_cancel_order', { p_order: el.dataset.id, p_reason: A.f.cancel || '' }); A.f.cancel = ''; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    savePrep: async el => { const k = el.dataset.p + '#' + el.dataset.key, row = prodRows(el.dataset.p).find(r => r.key === el.dataset.key), v = A.pq[k] !== undefined ? A.pq[k] : row.prepared; if (!/^\d+$/.test(String(v))) return toast(T('msgProd'));
      const r = await rpc('admin_set_prepared', { p_period: el.dataset.p, p_key: el.dataset.key, p_qty: Number(v) }); delete A.pq[k]; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    allPrep: async el => { const r = await rpc('admin_set_prepared', { p_period: el.dataset.p, p_key: el.dataset.key, p_qty: Number(el.dataset.n) }); delete A.pq[el.dataset.p + '#' + el.dataset.key]; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    toggleDel: el => { A.delSel = A.delSel === el.dataset.key ? null : el.dataset.key; A.dq = {}; render(); },
    regDelivery: async el => { const ls = act(el.dataset.p).filter(l => l.group_id === el.dataset.g), out = []; let ok = true;
      ls.forEach(l => { const raw = A.dq[l.id], q = raw === undefined || raw === '' ? 0 : Number(raw); if (!Number.isInteger(q) || q < 0 || q > l.qty - delq(l.id)) ok = false; else if (q > 0) out.push({ line_id: l.id, qty: q }); });
      if (!ok || !out.length || !A.f.dl_by || !(A.f.dl_date || todayLA())) return toast(T('msgDelInvalid'));
      const r = await rpc('admin_register_delivery', { p_period: el.dataset.p, p_group: el.dataset.g, p_date: A.f.dl_date || todayLA(), p_by: A.f.dl_by, p_notes: A.f.dl_notes || '', p_lines: out }); if (r.error) return;
      A.delSel = null; A.dq = {}; A.f.dl_by = ''; A.f.dl_notes = ''; await loadAll(); toast(T('msgDelOk')); }
  };
  root.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return; if (acts[el.dataset.act]) acts[el.dataset.act](el); });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.closest('button,textarea,select')) return;
    const card = e.target.closest('.auth-card'); if (!card) return;
    const btn = card.querySelector('.btn:not([disabled])');
    if (btn && acts[btn.dataset.act]) { e.preventDefault(); acts[btn.dataset.act](btn); }
  });
  root.addEventListener('change', e => { const t = e.target;
    if (t.dataset.gphoto !== undefined || t.dataset.gcphoto) {
      const file = t.files && t.files[0];
      if (!file || !A.g || A.g.busy) return;
      const bad = checkPhoto(file);
      if (bad) { A.g.err = bad; toast(bad); return render(); }
      A.g.err = '';
      if (t.dataset.gcphoto) {
        const c = A.g.colors.find(x => x.uid === t.dataset.gcphoto); if (!c) return;
        if (c.preview) { try { URL.revokeObjectURL(c.preview); } catch (e2) {} }
        c.file = file; c.preview = URL.createObjectURL(file);
      } else {
        if (A.g.photoPreview) { try { URL.revokeObjectURL(A.g.photoPreview); } catch (e2) {} }
        A.g.photoFile = file; A.g.photoPreview = URL.createObjectURL(file);
      }
      return render();
    }
    if (t.dataset.logo !== undefined) {
      const file = t.files && t.files[0];
      if (!file || A.logoBusy) return;
      const kind = logoKind(file);
      revokeLogoPreview(); A.logoFile = null;
      if (!kind || !file.size) { A.logoErr = T('logoType'); toast(A.logoErr); render(); return; }
      if (file.size > LOGO_MAX) { A.logoErr = T('logoSize'); toast(A.logoErr); render(); return; }
      A.logoErr = ''; A.logoFile = file; A.logoPreview = URL.createObjectURL(file); render(); return;
    }
    if (t.dataset.act && (t.tagName === 'SELECT' || t.type === 'checkbox')) { acts[t.dataset.act](t); return; }
    set(t, true); });
  root.addEventListener('input', e => { if (e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') set(e.target, false); });
  function set(t, fire) {
    if (t.dataset.gc) { const [uid, k] = t.dataset.gc.split(':'); const c = A.g && A.g.colors.find(x => x.uid === uid); if (c) c[k] = t.value; return; }
    if (t.dataset.m) { A[t.dataset.m][t.dataset.k] = t.value; return; }
    if (t.dataset.k) { A.f[t.dataset.k] = t.value; if (fire && t.dataset.re !== undefined) render(); return; }
    if (t.dataset.s) { A[t.dataset.s] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.clr) A[t.dataset.clr] = 'all'; if (fire) render(); }
  }
  async function afterAuth(user) {
    A.user = user;
    if (A.recovery) { render(); return; }
    const { data } = await sb().from('admins').select('user_id').maybeSingle();
    if (A.recovery) { render(); return; }
    A.ok = !!data; render(); if (A.ok) loadAll();
  }
  (async function init() {
    if (recoveryFromHash()) markRecovery();
    else { try { A.recovery = sessionStorage.getItem('jk_pw_recovery') === '1'; } catch (e) { A.recovery = false; } }
    render(); if (!JK.configured()) return;
    sb().auth.onAuthStateChange((event, session) => {
      if (event !== 'PASSWORD_RECOVERY') return;
      markRecovery();
      if (session && session.user) A.user = session.user;
      A.authReady = true; A.gate = ''; A.msg = ''; render();
    });
    const { data } = await sb().auth.getSession();
    A.authReady = true;
    if (A.recovery) { if (data.session && data.session.user) A.user = data.session.user; render(); return; }
    if (data.session) await afterAuth(data.session.user);
  })();
})();

