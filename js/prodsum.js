// Resumen de producción: agrega líneas ya filtradas en una matriz de tallas.
// No consulta la red. El panel le pasa solo pedidos no cancelados.
window.JKProd = (function () {
  const YOUTH = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'Y2XL', 'Y3XL', 'Y4XL', 'Y5XL', 'Y6XL'];
  const ADULT = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

  function normSize(size) {
    const u = String(size || '').trim().toUpperCase();
    if (u === 'XXL') return '2XL';
    if (u === 'XXXL') return '3XL';
    return u;
  }

  // Infantil y adulto comparten XS/S/M/L/XL en el catálogo. En la matriz,
  // la talla infantil lleva prefijo Y (XS → YXS) para no sumarlas juntas.
  function sizeToken(age, size) {
    const n = normSize(size);
    if (!n) return '';
    if (age === 'child') {
      if (n.charAt(0) === 'Y') return n;
      if (n === 'XS') return 'YXS';
      if (n === 'S') return 'YS';
      if (n === 'M') return 'YM';
      if (n === 'L') return 'YL';
      if (n === 'XL') return 'YXL';
      return 'Y' + n;
    }
    return n;
  }

  function isYouth(token) {
    if (YOUTH.indexOf(token) >= 0) return true;
    if (ADULT.indexOf(token) >= 0) return false;
    return String(token).charAt(0) === 'Y';
  }

  function sizeRank(token) {
    let i = YOUTH.indexOf(token);
    if (i >= 0) return i;
    i = ADULT.indexOf(token);
    if (i >= 0) return 100 + i;
    const m = String(token).match(/^(Y)?(\d+)XL$/);
    if (m) return (m[1] ? 20 : 120) + Number(m[2]);
    return isYouth(token) ? 50 : 180;
  }

  function statusOk(orderStatus, filter) {
    if (orderStatus !== 'preorder' && orderStatus !== 'active') return false;
    if (filter === 'preorder') return orderStatus === 'preorder';
    if (filter === 'active') return orderStatus === 'active';
    return true;
  }

  function summarize(lines, opts) {
    const byGroup = !!(opts && opts.byGroup);
    const rows = new Map();
    const pers = [];
    const colSet = new Set();
    (lines || []).forEach(l => {
      const qty = Number(l.qty) || 0;
      if (qty <= 0) return;
      const token = sizeToken(l.age, l.size) || String(l.size || '').trim();
      if (token) colSet.add(token);
      const key = [l.code || '', l.name || '', l.modelId || '', l.model || '', l.colorId || '', l.color || '', l.design || '', byGroup ? (l.groupId || '') : ''].join('\u0001');
      let row = rows.get(key);
      if (!row) {
        row = {
          code: l.code || '', name: l.name || '', model: l.model || '', color: l.color || '', design: l.design || '',
          groupLabel: byGroup ? (l.groupLabel || '') : '',
          qty: {}, total: 0
        };
        rows.set(key, row);
      }
      if (token) row.qty[token] = (row.qty[token] || 0) + qty;
      row.total += qty;
      if (String(l.personalization || '').trim()) pers.push(Object.assign({}, l, { sizeLabel: token, qty: qty }));
    });
    const columns = Array.from(colSet).sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
    const list = Array.from(rows.values()).sort((a, b) =>
      [a.code, a.name, a.model, a.color, a.design, a.groupLabel].join('\u0001').localeCompare([b.code, b.name, b.model, b.color, b.design, b.groupLabel].join('\u0001'), 'es'));
    pers.sort((a, b) =>
      [a.code, a.name, a.groupLabel, a.sizeLabel, a.orderNumber, a.personalization].join('\u0001')
        .localeCompare([b.code, b.name, b.groupLabel, b.sizeLabel, b.orderNumber, b.personalization].join('\u0001'), 'es'));
    const grand = { qty: {}, total: 0 };
    columns.forEach(c => { grand.qty[c] = 0; });
    list.forEach(r => {
      columns.forEach(c => { grand.qty[c] += r.qty[c] || 0; });
      grand.total += r.total;
    });
    return { columns: columns, rows: list, pers: pers, grand: grand };
  }

  function csvEscape(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  return { sizeToken: sizeToken, sizeRank: sizeRank, isYouth: isYouth, statusOk: statusOk, summarize: summarize, csvEscape: csvEscape };
})();
