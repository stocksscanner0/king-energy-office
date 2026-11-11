(() => {
'use strict';

/* ---------- small helpers ---------- */
const CFG = window.KE_CONFIG || {};
// Practice mode: when no storage is set up, or on this computer only with ?demo=1 (used for testing).
const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey || (location.hostname === 'localhost' && /[?&]demo=1/.test(location.search));
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const nowIso = () => new Date().toISOString();
const STATUS = { todo: 'Not started', working: 'Working', stuck: 'Stuck', done: 'Done' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = s => { const d = parseYmd(s); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
const niceTime = iso => { const d = new Date(iso); let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + h + ':' + pad(d.getMinutes()) + ' ' + ap; };
const EXTRA_IDEAS = ['Store brand', 'POS type', 'Pump brand', 'Number of pumps', 'Tank 1 (fuel + size)', 'Tank 2 (fuel + size)', 'Tank 3 (fuel + size)', 'Fuel types', 'Current supplier', 'Contract end date', 'Price notes', 'Best time to call'];

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- data: practice mode (this device only) ---------- */
function demoDb() {
  const KEY = 'ke_demo_v1';
  const seed = () => {
    const t = new Date(), plus = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
    const a = uid(), b = uid(), c = uid();
    return {
      members: [{ email: 'you@demo', name: 'You' }, { email: 'sam@demo', name: 'Sam' }, { email: 'raj@demo', name: 'Raj' }],
      tasks: [
        { id: a, title: 'Send KY fuel license application', details: '', status: 'working', owner: 'sam@demo', due: plus(-2), created_by: 'you@demo', created_at: nowIso(), updated_at: nowIso() },
        { id: b, title: 'Get insurance quote for the truck', details: '', status: 'todo', owner: null, due: null, created_by: 'raj@demo', created_at: nowIso(), updated_at: nowIso() },
        { id: c, title: 'Open business bank account', details: '', status: 'todo', owner: 'you@demo', due: plus(3), created_by: 'you@demo', created_at: nowIso(), updated_at: nowIso() }
      ],
      events: [{ id: uid(), task_id: a, actor: 'sam@demo', kind: 'comment', body: 'Called the state office. Waiting on a call back.', created_at: nowIso() }],
      files: [],
      stores: [{ id: uid(), name: 'Sample Food Mart', owner_name: 'Store Owner', phone: '', email: '', address: 'Louisville, KY', notes: 'This is a sample. Delete it any time.', extra: [{ label: 'Pump brand', value: 'Gilbarco' }, { label: 'Tank 1 (fuel + size)', value: 'Regular, 10,000 gal' }], created_at: nowIso(), updated_at: nowIso() }]
    };
  };
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage blocked */ }
  if (!d) d = seed();
  d.store_files = d.store_files || []; d.activity = d.activity || []; d.store_pricing = d.store_pricing || []; d.staff = d.staff || []; d.fuel_orders = d.fuel_orders || []; d.deliveries = d.deliveries || [];
  d.invoices = d.invoices || []; d.office_info = d.office_info || []; d.rack_prices = d.rack_prices || [];
  if (!d.tax_rates) d.tax_rates = DEFAULT_TAXES.map((t, i) => ({ id: uid(), name: t[0], rate: t[1], grades: ['regular', 'premium'], sort: i + 1, active: true }));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } };
  return {
    async init() {},
    async session() { try { return localStorage.getItem(KEY + '_me'); } catch (e) { return null; } },
    async signIn(email) { try { localStorage.setItem(KEY + '_me', email); } catch (e) { /* ignore */ } },
    async signOut() { try { localStorage.removeItem(KEY + '_me'); } catch (e) { /* ignore */ } },
    async loadAll() {
      const o = JSON.parse(JSON.stringify(d));
      o.store_list = o.stores.map(s => ({ id: s.id, name: s.name, address: s.address }));
      o.team_names = o.members.concat(o.staff).map(x => ({ email: x.email, name: x.name }));
      return o;
    },
    async insert(t, row) {
      d[t].push({ ...row });
      if (t === 'deliveries' && row.order_id) { const o = d.fuel_orders.find(x => x.id === row.order_id); if (o) o.status = 'delivered'; }
      if (t === 'deliveries') {
        const n = d.invoices.filter(i => i.number.startsWith('KE-' + today().replace(/-/g, ''))).length + 1;
        d.invoices.push({ id: uid(), number: 'KE-' + today().replace(/-/g, '') + '-' + String(n).padStart(3, '0'), delivery_id: row.id, store_id: row.store_id, store_name: row.store_name, day: row.day, status: 'draft', lines: [], needs_price: true, created_at: nowIso() });
      }
      save();
    },
    async upsert(t, row) { const r = d[t].find(x => x.id === row.id); if (r) Object.assign(r, row); else d[t].push({ ...row }); save(); },
    async uploadBlob(row, file) {
      if (file.size > 400000) throw new Error('Practice mode can only keep small photos (under 400 KB). Real mode has no such limit.');
      row.photo_data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    },
    async update(t, id, patch) { const r = d[t].find(x => x.id === id); if (r) Object.assign(r, patch); save(); },
    async remove(t, id) {
      const gone = d[t].find(x => x.id === id);
      d[t] = d[t].filter(x => x.id !== id);
      if (t === 'deliveries') d.invoices = d.invoices.filter(i => i.delivery_id !== id);
      if (t === 'deliveries' && gone && gone.order_id) { const o = d.fuel_orders.find(x => x.id === gone.order_id); if (o && o.status === 'delivered') o.status = 'new'; }
      if (t === 'tasks') { d.events = d.events.filter(e => e.task_id !== id); d.files = d.files.filter(f => f.task_id !== id); }
      if (t === 'stores') { d.store_files = d.store_files.filter(f => f.store_id !== id); d.store_pricing = d.store_pricing.filter(p => p.id !== id); }
      save();
    },
    async uploadFile(row, file, table = 'files') {
      if (file.size > 400000) throw new Error('Practice mode can only keep small files (under 400 KB). Real mode has no such limit.');
      row.data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      d[table].push({ ...row }); save();
    },
    async fileUrl(row) { const f = row.data ? row : d.files.concat(d.store_files).find(x => x.id === row.id); const blob = await (await fetch(f.data)).blob(); return URL.createObjectURL(blob); },
    async removeFile(row, table = 'files') { await this.remove(table, row.id); },
    async fn() { return {}; },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } d = seed(); d.store_files = []; d.activity = []; d.store_pricing = []; d.staff = []; d.fuel_orders = []; d.deliveries = []; d.invoices = []; d.office_info = []; d.rack_prices = []; d.tax_rates = undefined; }
  };
}

/* ---------- data: real mode (Supabase, shared by all partners) ---------- */
function supaDb() {
  let sb;
  const ok = r => { if (r.error) throw r.error; return r.data; };
  return {
    async init() {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        s.onload = res; s.onerror = () => rej(new Error('Could not reach the internet.'));
        document.head.appendChild(s);
      });
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    },
    async session() { const { data } = await sb.auth.getSession(); const e = data.session && data.session.user.email; return e ? e.toLowerCase() : null; },
    async signIn(email, pw) { ok(await sb.auth.signInWithPassword({ email, password: pw })); },
    async signOut() { await sb.auth.signOut(); },
    async setPassword(pw) { ok(await sb.auth.updateUser({ password: pw })); },
    async loadAll() {
      const names = ['members', 'tasks', 'events', 'files', 'stores', 'store_files', 'activity', 'store_pricing', 'staff', 'fuel_orders', 'deliveries', 'invoices', 'office_info', 'tax_rates', 'rack_prices'];
      const [sl, tn] = await Promise.all([sb.rpc('store_list'), sb.rpc('team_names')]);
      const rs = await Promise.all(names.map(n => n === 'activity' ? sb.from(n).select('*').order('created_at', { ascending: false }).limit(100) : sb.from(n).select('*')));
      const out = {}; rs.forEach((r, i) => { out[names[i]] = ok(r); });
      out.store_list = ok(sl); out.team_names = ok(tn); return out;
    },
    async insert(t, row) { ok(await sb.from(t).insert(row)); },
    async update(t, id, patch) { ok(await sb.from(t).update(patch).eq('id', id)); },
    async remove(t, id) { ok(await sb.from(t).delete().eq('id', id)); },
    async uploadFile(row, file, table = 'files') { ok(await sb.storage.from('files').upload(row.path, file)); await this.insert(table, row); },
    async upsert(t, row) { ok(await sb.from(t).upsert(row)); },
    async uploadBlob(row, file) { ok(await sb.storage.from('files').upload(row.photo_path, file)); },
    async fileUrl(row) { return ok(await sb.storage.from('files').createSignedUrl(row.path, 3600)).signedUrl; },
    async removeFile(row, table = 'files') { await sb.storage.from('files').remove([row.path]); await this.remove(table, row.id); },
    async fn(op, payload) {
      const { data } = await sb.auth.getSession();
      const r = await fetch(CFG.supabaseUrl + '/functions/v1/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: 'Bearer ' + (data.session ? data.session.access_token : CFG.supabaseKey) },
        body: JSON.stringify({ op, ...(payload || {}) })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The alert service did not answer.');
      return j;
    },
    async saveSub(sub, email) { ok(await sb.from('push_subs').upsert({ endpoint: sub.endpoint, email, sub })); },
    async dropSub(endpoint) { ok(await sb.from('push_subs').delete().eq('endpoint', endpoint)); }
  };
}

const DEFAULT_TAXES = [['Federal Excise Gasoline', 0.183], ['Federal L.U.S.T.', 0.001], ['Federal Superfund Gas', 0.00386], ['KY Environmental Assessment', 0.014], ['KY Excise Gas', 0.25], ['TN Export Fee', 0.0005]];
const db = DEMO ? demoDb() : supaDb();

/* ---------- state ---------- */
const KINDS = [['contract', '📄 Contract'], ['site', '📷 Site picture'], ['screenshot', '📱 Screenshot'], ['offer_world_fuel', '💲 Offer from World Fuel'], ['est_keshav', '🧾 Estimate from Keshav'], ['est_jf', '🧾 Estimate from JF'], ['est_others', '🧾 Estimate from others'], ['other', '📎 Other']];
const KIND_COLOR = { contract: '#1d5fd1', site: '#12805c', screenshot: '#8b3fd1', offer_world_fuel: '#b4530a', est_keshav: '#0e7490', est_jf: '#be185d', est_others: '#4d7c0f', other: '#64748b' };
const kindLabel = k => { const f = KINDS.find(x => x[0] === k); return f ? f[1] : '🏷 ' + (k || 'Other'); };
const kindPlain = k => kindLabel(k).replace(/^\S+\s/, '');
const kindColor = k => KIND_COLOR[k] || '#7c3aed';
const STORE_FIELDS = [['name', 'Store name'], ['owner_name', 'Owner or contact'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address'], ['landlord_name', 'Landlord name'], ['landlord_phone', 'Landlord number'], ['landlord_email', 'Landlord email'], ['notes', 'Notes']];
/* ---- fuel orders (staff and partners add them; only partners change them) ---- */
const GRADES = [['regular', 'Regular'], ['premium', 'Premium'], ['diesel', 'Diesel'], ['kerosene', 'Kerosene']];
const ORDER_STATUS = { new: 'New', delivered: 'Delivered', cancelled: 'Cancelled' };
const ORDER_PILL = { new: 's-working', delivered: 's-done', cancelled: 's-todo' };
const gal = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const galText = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const orderTotal = o => GRADES.reduce((s, [k]) => s + Number(o[k] || 0), 0);
const orderDraft = o => { const d = { store_id: (o && o.store_id) || '', store_name: (o && o.store_name) || '', day: (o && o.day) || today(), notes: (o && o.notes) || '' }; GRADES.forEach(([k]) => { d[k] = o && Number(o[k]) ? String(Number(o[k])) : ''; }); return d; };
const orderFacts = o => ['Delivery date: ' + niceDate(o.day)].concat(GRADES.filter(([k]) => Number(o[k]) > 0).map(([k, l]) => l + ': ' + galText(o[k]) + ' gal'), ['Total: ' + galText(orderTotal(o)) + ' gal'], o.notes ? ['Notes: ' + o.notes] : []).join('\n');

/* ---- pricing deal (partners only; kept in its own locked table, store_pricing, whose id is the store's id) ---- */
const TERMS = ['Net 7', 'Net 15', 'Net 30', 'Weekly settlement', 'Due on delivery'];
const PRICE_METHODS = ['Rack price + cents/gallon', 'Fixed selling price', 'Delivered cost + markup', 'Custom / quoted price'];
const FREIGHT_METHODS = ['Included in fuel price', 'Pass-through actual freight', 'Fixed cents/gallon', 'Custom'];
const PRICE_FIELDS = [['parent', 'Parent company'], ['brand', 'Brand / card network'], ['terms', 'Payment terms'], ['credit_limit', 'Credit limit ($)'], ['pricing_method', 'Pricing agreement'], ['benchmark', 'Rack / terminal benchmark'], ['fixed_price', 'Fixed selling price ($/gal)'], ['differential', 'Differential / markup ($/gal)'], ['freight_method', 'Freight arrangement'], ['freight_rate', 'Freight rate ($/gal)']];
const PRICE_NUMS = ['credit_limit', 'fixed_price', 'differential', 'freight_rate'];
const numText = v => { const s = String(v == null ? '' : v).replace(/[$,\s]/g, ''); return s === '' || isNaN(Number(s)) ? '' : String(Number(s)); };
const pricingDraft = r => { const p = {}; PRICE_FIELDS.forEach(([k]) => { p[k] = r && r[k] != null ? String(r[k]) : ''; }); p.termsCustom = !!p.terms && !TERMS.includes(p.terms); return p; };
const pricingRow = p => { const r = {}; PRICE_FIELDS.forEach(([k]) => { r[k] = PRICE_NUMS.includes(k) ? (numText(p[k]) === '' ? null : numText(p[k])) : (p[k] || '').trim(); }); return r; };
const pricingBadNumber = p => { const bad = PRICE_FIELDS.find(([k]) => PRICE_NUMS.includes(k) && (p[k] || '').trim() !== '' && numText(p[k]) === ''); return bad ? bad[1] : ''; };
function pricingChanges(old, row) {
  const lines = [], o = old || {};
  PRICE_FIELDS.forEach(([k, label]) => {
    const norm = v => PRICE_NUMS.includes(k) ? numText(v) : String(v == null ? '' : v).trim();
    const a = norm(o[k]), b = norm(row[k]); if (a === b) return;
    lines.push('Pricing – ' + (!a ? label + ': ' + b : !b ? label + ': removed (was ' + a + ')' : label + ': ' + a + ' → ' + b));
  });
  return lines;
}
function pricingBlock(p) {
  const opt = (list, cur) => list.map(v => `<option${cur === v ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const txt = (k, label, ph) => `<label class="f">${label}</label><input class="in" data-p="${k}" placeholder="${ph || ''}" value="${esc(p[k])}">`;
  const num = (k, label, ph) => `<label class="f">${label}</label><input class="in" data-p="${k}" inputmode="decimal" placeholder="${ph || ''}" value="${esc(p[k])}">`;
  const m = p.pricing_method, rack = m === PRICE_METHODS[0], fixed = m === PRICE_METHODS[1], cost = m === PRICE_METHODS[2];
  return `<div class="group money"><div class="group-t">💲 Pricing deal <small>partners only</small></div>
    ${txt('parent', 'Parent company')}
    ${txt('brand', 'Brand / card network')}
    <label class="f">Payment terms</label><select class="in" data-pp="terms"><option value="">Pick one…</option>${opt(TERMS, p.termsCustom ? null : p.terms)}<option value="__custom"${p.termsCustom ? ' selected' : ''}>✏️ Custom (type your own)</option></select>
    ${p.termsCustom ? `<input class="in" data-p="terms" placeholder="Type the terms" value="${esc(p.terms)}" style="margin-top:6px">` : ''}
    ${num('credit_limit', 'Credit limit ($)', 'like 25000')}
    <label class="f">Pricing agreement</label><select class="in" data-p="pricing_method"><option value="">Pick one…</option>${opt(PRICE_METHODS, m)}</select>
    ${rack ? txt('benchmark', 'Rack / terminal benchmark', 'like OPIS - terminal name') + num('differential', 'Cents on top of rack ($ per gallon)', '0.000000') : ''}
    ${fixed ? num('fixed_price', 'Fixed selling price ($ per gallon)', '0.000000') : ''}
    ${cost ? num('differential', 'Markup on delivered cost ($ per gallon)', '0.000000') : ''}
    ${rack || cost ? '<p class="muted" style="margin:4px 0 0">0.010000 means one cent per gallon. 0.027500 means 2.75 cents.</p>' : ''}
    <label class="f">Freight arrangement</label><select class="in" data-p="freight_method"><option value="">Pick one…</option>${opt(FREIGHT_METHODS, p.freight_method)}</select>
    ${p.freight_method === 'Fixed cents/gallon' ? num('freight_rate', 'Freight rate ($ per gallon)', '0.000000') : ''}
  </div>`;
}
const storeDraft = s => { const d = { p: pricingDraft(s.id ? S.store_pricing.find(x => x.id === s.id) : null), extra: (s.extra || []).map(x => ({ label: x.label, value: x.value })), newFiles: [], removeFiles: [], kind: 'site', customKind: '' }; STORE_FIELDS.forEach(([k]) => { d[k] = s[k] || ''; }); return d; };
const ACT_ICON = { delivery: '🚚', order: '⛽', store: '🏪', task_new: '🆕', task_taken: '🙋' };
const isImage = n => /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(n || '');
const HUES = [210, 150, 28, 280, 345, 175, 50, 240];
const thumbUrls = new Map();
const S = { orders: [], deliveries: [], invoices: [], office: null, taxes: [], racks: [], storeList: [], team: [], staff: [], role: null, menuOpen: false, store_pricing: [], store_files: [], activity: [], me: null, members: [], tasks: [], events: [], files: [], stores: [], tab: 'tasks', filter: 'all', sheet: null, search: '', draftComment: '' };
const nameOf = email => { const m = S.members.find(x => x.email === email) || S.staff.find(x => x.email === email) || S.team.find(x => x.email === email); return m ? m.name : (email || ''); };
// Who is this? A partner sees everything. Staff see only orders and BOLs. Anyone else is not let in.
const roleOf = email => S.members.some(m => m.email === email) ? 'partner' : S.staff.some(s => s.email === email && s.active) ? 'staff' : null;
const isLate = t => t.status !== 'done' && t.due && t.due < today();
const taskById = id => S.tasks.find(t => t.id === id);

function dueText(t) {
  const diff = Math.round((parseYmd(t.due) - parseYmd(today())) / 864e5);
  if (t.status !== 'done') {
    if (diff < 0) return (-diff) + (diff === -1 ? ' day late' : ' days late');
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
  }
  return niceDate(t.due);
}

async function safe(fn, failMsg) {
  try { return await fn(); }
  catch (e) { console.error(e); toast(failMsg || (e && e.message) || 'Could not save. Check your internet.'); refresh(); return undefined; }
}

async function refresh() {
  try {
    const d = await db.loadAll();
    S.members = d.members.sort((a, b) => a.name.localeCompare(b.name));
    S.tasks = d.tasks; S.events = d.events; S.files = d.files; S.stores = d.stores; S.store_files = d.store_files || []; S.store_pricing = d.store_pricing || []; S.staff = d.staff || [];
    S.orders = d.fuel_orders || []; S.deliveries = d.deliveries || [];
    S.invoices = d.invoices || []; S.office = (d.office_info || []).find(x => x.id === 'main') || null;
    S.taxes = (d.tax_rates || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)); S.racks = d.rack_prices || []; S.storeList = d.store_list || []; S.team = d.team_names || [];
    if (S.role && !roleOf(S.me)) { await db.signOut(); S.me = null; S.role = null; closeSheet(); renderLogin('You have been signed out.'); return; }
    S.activity = (d.activity || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } catch (e) { console.error(e); toast('Could not load. Check your internet.'); return; }
  renderMain();
  const sheetEl = $('#sheet');
  if (S.sheet && S.sheet.type === 'task' && !sheetEl.contains(document.activeElement)) {
    if (taskById(S.sheet.id)) renderSheet(); else closeSheet();
  }
}

/* ---------- picture card for sharing ---------- */
function wrapLines(g, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
  return lines;
}
function taskCardBlob(t) {
  const W = 1080, P = 64, F = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif';
  const late = isLate(t), nobody = !t.owner && t.status !== 'done';
  const STC = { todo: '#64748b', working: '#1d5fd1', stuck: '#c77700', done: '#12805c' };
  const cv = document.createElement('canvas'); let g = cv.getContext('2d');
  g.font = 'bold 66px ' + F; const titleLines = wrapLines(g, t.title, W - 2 * P, 4);
  const last = S.events.filter(e => e.task_id === t.id && e.kind === 'comment').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  g.font = '40px ' + F; const lastLines = last ? wrapLines(g, nameOf(last.actor) + ': ' + last.body, W - 2 * P - 56, 3) : [];
  const banner = late ? 'LATE  ·  ' + dueText(t).toUpperCase() : nobody ? 'NOBODY OWNS THIS YET' : '';
  const H = 180 + (banner ? 100 : 0) + 70 + titleLines.length * 82 + 30 + 3 * 100 + (lastLines.length ? 50 + lastLines.length * 54 + 50 : 0) + 120;
  cv.width = W; cv.height = H; g = cv.getContext('2d'); g.textBaseline = 'middle';
  const box = (x, y, w, h, r, color) => { g.fillStyle = color; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); };
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = '#0f2742'; g.fillRect(0, 0, W, 180);
  box(P, 46, 88, 88, 20, '#f5a623'); g.fillStyle = '#0f2742'; g.font = 'bold 44px ' + F; g.textAlign = 'center'; g.fillText('KE', P + 44, 92);
  g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = 'bold 52px ' + F; g.fillText('King Energy', P + 116, 74);
  g.fillStyle = '#f5a623'; g.font = '32px ' + F; g.fillText('TASK', P + 118, 124);
  let y = 180;
  if (banner) { g.fillStyle = late ? '#d92d20' : '#f5a623'; g.fillRect(0, y, W, 100); g.fillStyle = late ? '#ffffff' : '#1b1300'; g.font = 'bold 44px ' + F; g.fillText((late ? '⚠  ' : '🚨  ') + banner, P, y + 52); y += 100; }
  // title
  y += 70; g.fillStyle = '#14202e'; g.font = 'bold 66px ' + F;
  for (const line of titleLines) { g.fillText(line, P, y + 30); y += 82; }
  y += 30;
  // rows
  const row = (label, value, color) => {
    g.fillStyle = '#64748b'; g.font = 'bold 30px ' + F; g.fillText(label, P, y + 50);
    if (color) { g.font = 'bold 40px ' + F; const w = g.measureText(value).width + 56; box(P + 250, y + 14, w, 72, 36, color); g.fillStyle = '#ffffff'; g.fillText(value, P + 278, y + 52); }
    else { g.fillStyle = '#14202e'; g.font = 'bold 46px ' + F; g.fillText(value, P + 250, y + 50); }
    g.fillStyle = '#e3e8ee'; g.fillRect(P, y + 99, W - 2 * P, 2); y += 100;
  };
  row('OWNER', t.owner ? nameOf(t.owner) : 'Nobody yet');
  row('DUE', t.due ? niceDate(t.due) + (t.status !== 'done' && !late && dueText(t) !== niceDate(t.due) ? '  (' + dueText(t) + ')' : '') : 'No date');
  row('STATUS', STATUS[t.status], STC[t.status]);
  if (lastLines.length) {
    y += 50; const h = lastLines.length * 54 + 40; box(P, y - 20, W - 2 * P, h, 22, '#eef3f9'); box(P, y - 20, 10, h, 5, '#1d5fd1');
    g.fillStyle = '#14202e'; g.font = '40px ' + F; let yy = y + 28; for (const line of lastLines) { g.fillText(line, P + 36, yy); yy += 54; }
    y += h + 10;
  }
  g.fillStyle = '#64748b'; g.font = '30px ' + F; g.fillText('Open the app to update:  ' + location.host + location.pathname.replace(/\/$/, ''), P, H - 56);
  // Made right away (no waiting), so the phone still treats the share as coming from the tap.
  const bin = atob(cv.toDataURL('image/png').split(',')[1]), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}
window.KE_card = id => taskCardBlob(taskById(id));

/* ---------- phone alerts ---------- */
const PUSH_OK = !DEMO && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let alertsOn = false;
const b64ToBytes = s => { const p = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(p), c => c.charCodeAt(0)); };
const ping = (op, payload) => { db.fn(op, payload).catch(e => console.warn('alert not sent', e)); };
async function checkAlerts() {
  if (!PUSH_OK) return;
  try {
    const slow = new Promise((_, rej) => setTimeout(() => rej(new Error('alert check timed out')), 8000));
    const sub = await Promise.race([slow, (async () => { const reg = await navigator.serviceWorker.register('sw.js'); return reg.pushManager.getSubscription(); })()]);
    alertsOn = !!sub && Notification.permission === 'granted';
    if (alertsOn) db.saveSub(sub.toJSON(), S.me).catch(() => {});
  } catch (e) { console.warn(e); }
}
async function enableAlerts() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Alerts are blocked. Allow notifications for this app in your phone settings.'); return; }
    await navigator.serviceWorker.register('sw.js');
    const reg = await navigator.serviceWorker.ready;
    const { key } = await db.fn('key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await db.saveSub(sub.toJSON(), S.me);
    alertsOn = true; toast('Alerts are on for this phone.');
  } catch (e) { console.error(e); toast('Could not turn on alerts: ' + ((e && e.message) || 'unknown problem')); }
  renderMain(); if (S.sheet && S.sheet.type === 'settings') renderSheet();
}
async function disableAlerts(quiet) {
  if (!PUSH_OK) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await db.dropSub(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) { console.warn(e); }
  alertsOn = false;
  if (!quiet) { toast('Alerts are off for this phone.'); renderMain(); if (S.sheet && S.sheet.type === 'settings') renderSheet(); }
}

/* ---------- task actions ---------- */
async function addEvent(taskId, kind, body) {
  const ev = { id: uid(), task_id: taskId, actor: S.me, kind, body, created_at: nowIso() };
  S.events.push(ev);
  await db.insert('events', ev);
}
// One line in the bell list. It also asks the server to send the phone alert and the email.
async function logActivity(kind, title, body) {
  const a = { id: uid(), actor: S.me, kind, title, body: body || '', created_at: nowIso() };
  S.activity.unshift(a);
  await db.insert('activity', a);
  ping('notify', { activity_id: a.id });
}
const seenKey = () => 'ke_seen_' + S.me;
const lastSeen = () => { try { return localStorage.getItem(seenKey()) || ''; } catch (e) { return ''; } };
const unseenCount = () => { const s = lastSeen(); return S.activity.filter(a => a.actor !== S.me && (a.created_at || '') > s).length; };
const taskFacts = t => 'Owner: ' + (t.owner ? nameOf(t.owner) : 'Nobody yet') + '\nDue: ' + (t.due ? niceDate(t.due) : 'No date');

function storeChanges(old, fields, extra, newFiles, removed) {
  const lines = [], o = old || {};
  STORE_FIELDS.forEach(([k, label]) => {
    const a = String(o[k] || '').trim(), b = fields[k] || ''; if (a === b) return;
    lines.push(!a ? label + ': ' + b : !b ? label + ': removed (was ' + a + ')' : label + ': ' + a + ' → ' + b);
  });
  const oe = o.extra || [], used = new Set();
  extra.forEach(x => {
    const i = oe.findIndex((y, j) => !used.has(j) && y.label === x.label);
    if (i < 0) { lines.push('Added detail: ' + x.label + ' = ' + x.value); return; }
    used.add(i); if ((oe[i].value || '') !== x.value) lines.push(x.label + ': ' + (oe[i].value || '(empty)') + ' → ' + (x.value || '(empty)'));
  });
  oe.forEach((y, j) => { if (!used.has(j)) lines.push('Removed detail: ' + y.label + (y.value ? ' (was ' + y.value + ')' : '')); });
  newFiles.forEach(f => lines.push('Added file: ' + kindPlain(f.kind) + ' – ' + f.name));
  removed.forEach(f => lines.push('Removed file: ' + kindPlain(f.kind || 'other') + ' – ' + f.name));
  return lines;
}

async function patchTask(id, patch, note, quiet) {
  const t = taskById(id); if (!t) return;
  patch.updated_at = nowIso();
  Object.assign(t, patch);
  renderMain(); if (!quiet) renderSheet();
  await safe(async () => {
    await db.update('tasks', id, patch);
    if (note) { await addEvent(id, 'history', note); if (!quiet) renderSheet(); }
  });
}
function setOwner(id, email) {
  const t = taskById(id); if (!t || (t.owner || null) === (email || null)) return;
  const note = !email ? 'removed the owner. Nobody owns this now.' : email === S.me ? 'took this task.' : 'gave this task to ' + nameOf(email) + '.';
  return patchTask(id, { owner: email || null }, note).then(() => {
    if (email && email !== S.me) ping('assigned', { task_id: id });
    else if (email === S.me) logActivity('task_taken', nameOf(S.me) + ' picked up: ' + t.title, taskFacts(t)).catch(e => console.warn(e));
  });
}

/* ---------- screens ---------- */
function renderLogin(msg) {
  $('#sheet').hidden = true; document.body.classList.remove('has-side');
  if (DEMO) {
    $('#app').innerHTML = `<div class="login"><h1>King Energy Office</h1><p class="muted">Practice mode. Who are you?</p>
      ${S.members.map(m => `<button class="btn wide" data-act="demo-login" data-v="${esc(m.email)}">${esc(m.name)}</button>`).join('')}
      ${S.staff.filter(s => s.active).map(s => `<button class="btn wide" data-act="demo-login" data-v="${esc(s.email)}">${esc(s.name)} (staff)</button>`).join('')}</div>`;
  } else {
    $('#app').innerHTML = `<div class="login"><h1>King Energy Office</h1><p class="muted">Sign in</p>
      ${msg ? `<div class="banner">${esc(msg)}</div>` : ''}
      <form id="loginForm"><label class="f">Email</label><input class="in" type="email" name="email" autocomplete="username" required>
      <label class="f">Password</label><input class="in" type="password" name="pw" autocomplete="current-password" required>
      <button class="btn primary wide" type="submit">Sign in</button></form></div>`;
  }
}

function card(t) {
  const nc = S.events.filter(e => e.task_id === t.id && e.kind === 'comment').length;
  const nf = S.files.filter(f => f.task_id === t.id).length;
  const late = isLate(t);
  return `<div class="card st-${t.status}${late ? ' late' : ''}" data-act="open-task" data-id="${t.id}">
    <div class="card-top"><span class="pill s-${t.status}">${STATUS[t.status]}</span>${late ? '<span class="pill s-late">LATE</span>' : ''}</div>
    <div class="card-title">${esc(t.title)}</div>
    <div class="card-meta"><span>👤 ${t.owner ? esc(nameOf(t.owner)) : 'Nobody'}</span>
      <span>📅 ${t.due ? esc(dueText(t)) : 'No date'}</span>${nc ? `<span>💬 ${nc}</span>` : ''}${nf ? `<span>📎 ${nf}</span>` : ''}</div>
    ${!t.owner && t.status !== 'done' ? `<button class="btn go take" data-act="take" data-id="${t.id}">I'll take it</button>` : ''}
  </div>`;
}

function tasksView() {
  const open = S.tasks.filter(t => t.status !== 'done');
  const nobody = open.filter(t => !t.owner);
  const mineCount = open.filter(t => t.owner === S.me).length;
  let owned = open.filter(t => t.owner);
  if (S.filter === 'mine') owned = owned.filter(t => t.owner === S.me);
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.created_at || '').localeCompare(a.created_at || '');
  const late = owned.filter(isLate).sort(byDue);
  const rest = owned.filter(t => !isLate(t)).sort(byDue);
  let done = S.tasks.filter(t => t.status === 'done');
  if (S.filter === 'mine') done = done.filter(t => t.owner === S.me);
  done.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return `
    <div class="chips">
      <button class="chip${S.filter === 'all' ? ' on' : ''}" data-act="filter" data-v="all">Everyone (${open.length})</button>
      <button class="chip${S.filter === 'mine' ? ' on' : ''}" data-act="filter" data-v="mine">Mine (${mineCount})</button>
    </div>
    ${nobody.length ? `<div class="nobody"><h2>🚨 Nobody owns this yet (${nobody.length})</h2><p>These will not get done until one person takes them.</p>${nobody.sort(byDue).map(card).join('')}</div>` : ''}
    ${late.length ? `<h2 class="sec">Late (${late.length})</h2>${late.map(card).join('')}` : ''}
    ${rest.length ? `<h2 class="sec">To do (${rest.length})</h2>${rest.map(card).join('')}` : ''}
    ${!nobody.length && !late.length && !rest.length ? `<p class="empty">Nothing open here. Tap “+ New task” to add one.</p>` : ''}
    ${done.length ? `<details class="done"><summary>Done (${done.length})</summary>${done.map(card).join('')}</details>` : ''}`;
}

function storeCards() {
  const q = S.search.trim().toLowerCase();
  const list = S.stores.filter(s => !q || JSON.stringify([s.name, s.owner_name, s.phone, s.address, s.notes, s.extra]).toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!list.length) return `<p class="empty">${S.stores.length ? 'No store matches.' : 'No stores yet. Tap “+ New store” to add one.'}</p>`;
  return list.map((s, i) => {
    const nf = S.store_files.filter(f => f.store_id === s.id).length;
    const tags = (s.extra || []).filter(x => x.label && x.value).slice(0, 3);
    return `<div class="card store-card" style="--h:${HUES[i % HUES.length]}" data-act="open-store" data-id="${s.id}">
    <div class="store-top"><span class="avatar">${esc((s.name || '?').trim().charAt(0).toUpperCase())}</span><div class="card-title">${esc(s.name || 'No name')}</div></div>
    <div class="card-meta">${s.owner_name ? `<span>👤 ${esc(s.owner_name)}</span>` : ''}${s.phone ? `<span>📞 ${esc(s.phone)}</span>` : ''}${s.address ? `<span>📍 ${esc(s.address)}</span>` : ''}${nf ? `<span>📎 ${nf}</span>` : ''}</div>
    ${tags.length ? `<div class="tags">${tags.map(x => `<span class="tag">${esc(x.label)}: ${esc(x.value)}</span>`).join('')}</div>` : ''}
  </div>`; }).join('');
}

/* The menu. 'partner' pages are hidden from staff here AND locked in storage. */
const MENU = [['tasks', '✅', 'Tasks', 'partner'], ['stores', '🏪', 'Stores', 'partner'], ['orders', '⛽', 'Fuel orders', 'all'], ['bols', '🚚', 'Deliveries / BOL', 'all'], ['invoices', '🧾', 'Invoices', 'partner'], ['company', '🏢', 'Company & taxes', 'partner'], ['staff', '👥', 'Staff', 'partner']];
const menuFor = () => MENU.filter(m => m[3] === 'all' || S.role === 'partner');

function staffView() {
  const list = S.staff.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<div class="banner">Staff only see <b>Fuel orders</b> and <b>Deliveries / BOL</b>. They cannot open tasks, stores, pricing, files or this page.</div>
    ${list.length ? list.map(s => `<div class="card staff-card${s.active ? '' : ' off'}">
      <div class="card-top"><span class="pill ${s.active ? 's-done' : 's-todo'}">${s.active ? 'Can sign in' : 'Turned off'}</span></div>
      <div class="card-title">${esc(s.name)}</div><div class="card-meta"><span>✉️ ${esc(s.email)}</span>${s.added_by ? `<span>Added by ${esc(nameOf(s.added_by))}</span>` : ''}</div>
      <p class="row" style="margin:8px 0 0"><button class="btn" data-act="staff-toggle" data-id="${s.id}">${s.active ? 'Turn off' : 'Turn back on'}</button><button class="btn danger" data-act="staff-del" data-id="${s.id}">Remove</button></p></div>`).join('')
    : '<p class="empty">No staff yet. Add the first one below.</p>'}
    <form id="staffForm" class="group"><div class="group-t">➕ Add a staff person</div>
      <label class="f">Name</label><input class="in" name="name" required>
      <label class="f">Email they will sign in with</label><input class="in" type="email" name="email" required>
      <p></p><button class="btn go wide" type="submit">Add to staff</button>
      <p class="muted" style="margin:8px 0 0">This puts them on the list. They also need a password: in Supabase open Authentication → Users → Add user, and use the <b>same email</b>.</p></form>`;
}
function orderCard(o) {
  const parts = GRADES.filter(([k]) => Number(o[k]) > 0).map(([k, l]) => `<span class="tag">${l}: ${galText(o[k])}</span>`).join('');
  return `<div class="card order-card os-${o.status}" data-act="open-order" data-id="${o.id}">
    <div class="card-top"><span class="pill ${ORDER_PILL[o.status] || ''}">${ORDER_STATUS[o.status] || esc(o.status)}</span><span class="pill">📅 ${esc(niceDate(o.day))}</span></div>
    <div class="card-title">${esc(o.store_name)}</div>
    <div class="tags" style="--h:150">${parts}</div>
    <div class="card-meta"><span>⛽ ${galText(orderTotal(o))} gal total</span><span>✍️ ${esc(nameOf(o.created_by))}</span></div></div>`;
}
function ordersView() {
  const list = S.orders.slice().sort((a, b) => (b.day || '').localeCompare(a.day || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  const open = list.filter(o => o.status === 'new'), rest = list.filter(o => o.status !== 'new');
  if (!list.length) return '<p class="empty">No fuel orders yet. Tap “+ New order” to add the first one.</p>';
  return `${open.length ? `<h2 class="sec">Waiting for delivery (${open.length})</h2>${open.map(orderCard).join('')}` : '<p class="empty">No orders are waiting.</p>'}
    ${rest.length ? `<details class="done"${open.length ? '' : ' open'}><summary>Delivered or cancelled (${rest.length})</summary>${rest.map(orderCard).join('')}</details>` : ''}`;
}
function orderSheet(sh) {
  const d = sh.draft, isNew = !sh.id, partner = S.role === 'partner', can = isNew || partner, dis = can ? '' : ' disabled';
  const o = sh.id ? S.orders.find(x => x.id === sh.id) : null;
  if (sh.id && !o) return '';
  const stores = S.storeList.slice();
  if (d.store_id && !stores.some(s => s.id === d.store_id)) stores.push({ id: d.store_id, name: d.store_name, address: '' });
  const total = GRADES.reduce((s, [k]) => s + gal(d[k]), 0);
  return `<div class="sheet-head"><button data-act="close">${isNew ? '✕ Cancel' : '← Back'}</button><span>${isNew ? 'New fuel order' : 'Fuel order'}</span><span></span></div>
  <form class="sheet-body" id="orderForm">
    ${!can ? '<div class="banner">Only a partner can change an order after it is saved.</div>' : ''}
    ${!stores.length ? '<div class="banner">There are no stores yet. A partner needs to add a store first.</div>' : ''}
    ${o ? `<p class="row"><span class="pill ${ORDER_PILL[o.status] || ''}">${ORDER_STATUS[o.status]}</span><span class="muted">Entered by ${esc(nameOf(o.created_by))} · ${esc(niceTime(o.created_at))}</span></p>` : ''}
    <label class="f">Store</label><select class="in" name="store_id" required${dis}><option value="">Pick a store…</option>${stores.map(s => `<option value="${s.id}"${d.store_id === s.id ? ' selected' : ''}>${esc(s.name)}${s.address ? ' — ' + esc(s.address) : ''}</option>`).join('')}</select>
    <label class="f">Delivery date</label><input class="in" type="date" name="day" value="${esc(d.day)}" required${dis}>
    <div class="group"><div class="group-t">⛽ Gallons</div>
      ${GRADES.map(([k, l]) => `<label class="f">${l}</label><input class="in" name="${k}" data-gal inputmode="decimal" placeholder="0" value="${esc(d[k])}"${dis}>`).join('')}
      <div class="total-line">Total: <b id="orderTotal">${galText(total)}</b> gallons</div></div>
    <label class="f">Notes</label><textarea class="in" name="notes"${dis}>${esc(d.notes)}</textarea>
    ${can ? `<p></p><button class="btn go wide" type="submit">${isNew ? 'Save order' : 'Save changes'}</button>` : ''}
    ${o && partner ? `<label class="f">Status</label><div class="row">${Object.keys(ORDER_STATUS).map(k => `<button type="button" class="btn${o.status === k ? ' on' : ''}" data-act="order-status" data-v="${k}">${ORDER_STATUS[k]}</button>`).join('')}</div>
      <p style="margin-top:32px"><button type="button" class="btn danger" data-act="order-del">Delete this order</button></p>` : ''}
  </form>`;
}
/* ---- deliveries / BOL (staff and partners add them; only partners change them) ---- */
const dlvDraft = x => { const d = { order_id: (x && x.order_id) || '', store_id: (x && x.store_id) || '', store_name: (x && x.store_name) || '', day: (x && x.day) || today(), bol_number: (x && x.bol_number) || '', notes: (x && x.notes) || '', file: null, fileName: '', preview: '' }; GRADES.forEach(([k]) => { d[k] = x && Number(x[k]) ? String(Number(x[k])) : ''; }); return d; };
const waitingOrders = () => S.orders.filter(o => o.status === 'new').sort((a, b) => (a.day || '').localeCompare(b.day || ''));
const orderLabel = o => o.store_name + ' — ' + niceDate(o.day) + ' — ' + galText(orderTotal(o)) + ' gal';
function readDlvForm() {
  const f = $('#dlvForm'), d = S.sheet && S.sheet.draft; if (!f || !d) return d;
  ['day', 'bol_number', 'notes'].concat(GRADES.map(g => g[0])).forEach(k => { if (f.elements[k]) d[k] = f.elements[k].value; });
  return d;
}
function dlvCard(x) {
  const parts = GRADES.filter(([k]) => Number(x[k]) > 0).map(([k, l]) => `<span class="tag">${l}: ${galText(x[k])}</span>`).join('');
  return `<div class="card order-card" data-act="open-dlv" data-id="${x.id}">
    <div class="card-top"><span class="pill s-done">BOL #${esc(x.bol_number)}</span><span class="pill">📅 ${esc(niceDate(x.day))}</span></div>
    <div class="card-title">${esc(x.store_name)}</div>
    <div class="tags" style="--h:150">${parts}</div>
    <div class="card-meta"><span>⛽ ${galText(orderTotal(x))} gal</span><span>📷 Photo</span><span>✍️ ${esc(nameOf(x.created_by))}</span></div></div>`;
}
function dlvView() {
  const list = S.deliveries.slice().sort((a, b) => (b.day || '').localeCompare(a.day || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  const n = waitingOrders().length;
  return `${n ? `<div class="banner">${n} order${n === 1 ? ' is' : 's are'} waiting for delivery. Tap “+ New delivery” when the load is dropped.</div>` : ''}
    ${list.length ? list.map(dlvCard).join('') : '<p class="empty">No deliveries yet.</p>'}`;
}
function dlvSheet(sh) {
  const d = sh.draft, isNew = !sh.id, partner = S.role === 'partner', can = isNew || partner, dis = can ? '' : ' disabled';
  const x = sh.id ? S.deliveries.find(r => r.id === sh.id) : null;
  if (sh.id && !x) return '';
  const orders = waitingOrders();
  const total = GRADES.reduce((s, [k]) => s + gal(d[k]), 0);
  return `<div class="sheet-head"><button data-act="close">${isNew ? '✕ Cancel' : '← Back'}</button><span>${isNew ? 'New delivery' : 'Delivery'}</span><span></span></div>
  <form class="sheet-body" id="dlvForm">
    ${!can ? '<div class="banner">Only a partner can change a delivery after it is saved.</div>' : ''}
    ${x ? `<p class="muted">Entered by ${esc(nameOf(x.created_by))} · ${esc(niceTime(x.created_at))}</p>` : ''}
    ${isNew ? (orders.length ? `<label class="f">Which order is this?</label><select class="in" id="dlvOrder" required><option value="">Pick the order…</option>${orders.map(o => `<option value="${o.id}"${d.order_id === o.id ? ' selected' : ''}>${esc(orderLabel(o))}</option>`).join('')}</select>`
      : '<div class="banner">No orders are waiting. Put the order in <b>Fuel orders</b> first, then come back here.</div>')
      : `<label class="f">Store</label><div class="in" style="background:transparent">${esc(x.store_name)}</div>`}
    ${!isNew || d.order_id ? `
    <label class="f">BOL number</label><input class="in" name="bol_number" value="${esc(d.bol_number)}" required${dis}>
    <label class="f">Delivery date</label><input class="in" type="date" name="day" value="${esc(d.day)}" required${dis}>
    <div class="group"><div class="group-t">⛽ Gallons on the BOL <small>(from the terminal)</small></div>
      ${GRADES.map(([k, l]) => `<label class="f">${l}</label><input class="in" name="${k}" data-dgal inputmode="decimal" placeholder="0" value="${esc(d[k])}"${dis}>`).join('')}
      <div class="total-line">Total: <b id="dlvTotal">${galText(total)}</b> gallons</div></div>
    <label class="f">BOL photo</label>
    ${x ? `<p><button type="button" class="btn" data-act="dlv-photo">📷 See the BOL photo</button></p>`
      : `${d.preview ? `<img src="${d.preview}" alt="BOL photo" style="max-width:100%;border-radius:10px;margin-bottom:8px">` : ''}
         <p><label class="btn${d.file ? '' : ' go'}">${d.file ? '📷 Retake photo' : '📷 Take or pick the BOL photo'}<input type="file" id="dlvPhoto" accept="image/*" capture="environment" hidden></label></p>
         ${d.file ? '' : '<p class="muted">The photo is required.</p>'}`}
    <label class="f">Notes</label><textarea class="in" name="notes"${dis}>${esc(d.notes)}</textarea>
    ${can ? `<p></p><button class="btn go wide" type="submit">${isNew ? 'Save delivery' : 'Save changes'}</button>` : ''}
    ${x && partner ? `<p style="margin-top:32px"><button type="button" class="btn danger" data-act="dlv-del">Delete this delivery</button></p>` : ''}` : ''}
  </form>`;
}
/* ---- invoices (partners only) ---- */
const r2 = n => Math.round(Number(n) * 100) / 100;
const money = n => (n == null || n === '' || isNaN(n)) ? '—' : (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate6 = n => (n == null || n === '' || isNaN(n)) ? '' : Number(n).toFixed(6);
const numOrNull = v => { const s = String(v == null ? '' : v).replace(/[$,\s]/g, ''); return s === '' || isNaN(Number(s)) ? null : Number(s); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const longDate = s => s ? parseYmd(s).toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
const rackFor = (day, k) => { const r = S.racks.find(x => x.id === day + '|' + k); return r ? Number(r.price) : null; };
function dueFrom(day, terms) {
  const m = /net\s*(\d+)/i.exec(terms || '');
  if (m) return addDays(day, +m[1]);
  if (/weekly/i.test(terms || '')) return addDays(day, 1);
  return day;
}
const INV_TERMS = ['Due on delivery', 'Net 7', 'Net 10', 'Net 15', 'Net 30', 'Weekly settlement'];
function autoRate(p, day, k) {
  const m = p.pricing_method || '';
  if (m === 'Fixed selling price') return p.fixed_price != null ? Number(p.fixed_price) : null;
  if (m === 'Rack price + cents/gallon' || m === 'Delivered cost + markup') { const r = rackFor(day, k); return r == null ? null : r + Number(p.differential || 0); }
  return null;
}
function invLines(inv, saved) {
  const dl = S.deliveries.find(x => x.id === inv.delivery_id) || {}, p = S.store_pricing.find(x => x.id === inv.store_id) || {};
  const old = {}; (saved || []).forEach(l => { if (l.key) old[l.key] = l; });
  const keep = (key, auto) => old[key] && old[key].manual ? { rate: old[key].rate, manual: true } : { rate: auto, manual: false };
  const out = [], got = GRADES.filter(([k]) => Number(dl[k]) > 0);
  got.forEach(([k, l]) => { const key = 'fuel:' + k; out.push({ key, type: 'fuel', grade: k, label: l, gallons: Number(dl[k]), ...keep(key, autoRate(p, inv.day, k)) }); });
  const fm = p.freight_method || '';
  if (fm && fm !== 'Included in fuel price') got.forEach(([k, l]) => { const key = 'freight:' + k; out.push({ key, type: 'freight', grade: k, label: l, gallons: Number(dl[k]), ...keep(key, fm === 'Fixed cents/gallon' && p.freight_rate != null ? Number(p.freight_rate) : null) }); });
  S.taxes.filter(t => t.active !== false).forEach(t => {
    const basis = got.filter(([k]) => (t.grades || []).includes(k)).reduce((s, [k]) => s + Number(dl[k]), 0);
    if (basis > 0) { const key = 'tax:' + t.id; out.push({ key, type: 'tax', label: t.name, gallons: basis, ...keep(key, Number(t.rate)) }); }
  });
  (saved || []).filter(l => l.type === 'other').forEach(l => out.push({ ...l }));
  out.forEach(l => { l.amount = l.type === 'other' ? numOrNull(l.amount) : (l.rate == null ? null : r2(l.gallons * l.rate)); });
  return out;
}
const invTotal = ls => r2(ls.reduce((s, l) => s + (l.amount || 0), 0));
const invMissing = ls => ls.some(l => (l.type === 'fuel' || l.type === 'freight') && l.rate == null);
const invBol = inv => { const d = S.deliveries.find(x => x.id === inv.delivery_id); return d ? d.bol_number : ''; };
function invCard(inv) {
  const ls = inv.status === 'draft' ? invLines(inv, inv.lines) : (inv.lines || []), miss = inv.status === 'draft' && invMissing(ls);
  return `<div class="card order-card" data-act="open-inv" data-id="${inv.id}">
    <div class="card-top"><span class="pill ${inv.status === 'ready' ? 's-done' : 's-working'}">${inv.status === 'ready' ? 'Ready' : 'Draft'}</span><span class="pill">📅 ${esc(niceDate(inv.day))}</span>${miss ? '<span class="pill need-pill">Needs a price</span>' : ''}</div>
    <div class="card-title">${esc(inv.store_name || '')}</div>
    <div class="card-meta"><span>🧾 ${esc(inv.number)}</span><span>BOL #${esc(invBol(inv))}</span><span><b>${miss ? '—' : money(invTotal(ls))}</b></span></div></div>`;
}
function rackBox() {
  const day = S.rackDay || today();
  return `<div class="group money"><div class="group-t">📈 Rack prices for the day <small>(used by “rack + cents” stores)</small></div>
    <label class="f">Day</label><input class="in" type="date" id="rackDay" value="${esc(day)}">
    ${GRADES.map(([k, l]) => `<label class="f">${l} rack ($/gal)</label><input class="in" data-rack="${k}" inputmode="decimal" placeholder="e.g. 2.451200" value="${esc(rate6(rackFor(day, k)))}">`).join('')}
    <p></p><button class="btn go" data-act="rack-save">Save rack prices</button></div>`;
}
function invView() {
  const list = S.invoices.slice().sort((a, b) => (b.day || '').localeCompare(a.day || '') || (b.number || '').localeCompare(a.number || ''));
  const drafts = list.filter(i => i.status !== 'ready'), ready = list.filter(i => i.status === 'ready');
  return `${rackBox()}
    <h2 class="sec">Drafts (${drafts.length})</h2>${drafts.length ? drafts.map(invCard).join('') : '<p class="empty">No drafts. A draft is made each time a delivery is saved.</p>'}
    ${ready.length ? `<details class="done"><summary>Ready (${ready.length})</summary>${ready.map(invCard).join('')}</details>` : ''}`;
}
function invSheet(sh) {
  const inv = S.invoices.find(x => x.id === sh.id); if (!inv) return '';
  const d = sh.draft, edit = inv.status !== 'ready', ls = d.lines, miss = invMissing(ls), dis = edit ? '' : ' disabled';
  const row = (l, i) => l.type === 'other'
    ? `<tr><td><input class="in" data-li="${i}" data-lf="label" value="${esc(l.label)}" placeholder="What is it?"${dis}></td><td></td><td></td><td><input class="in num" data-li="${i}" data-lf="amount" inputmode="decimal" placeholder="-25.00" value="${l.amount == null ? '' : l.amount}"${dis}></td>${edit ? `<td><button type="button" class="x" data-act="inv-line-del" data-i="${i}">✕</button></td>` : ''}</tr>`
    : `<tr><td>${esc(l.label)}</td><td class="num">${galText(l.gallons)}</td><td><input class="in num${l.rate == null ? ' need' : ''}" data-li="${i}" data-lf="rate" inputmode="decimal" placeholder="price" value="${esc(rate6(l.rate))}"${dis}></td><td class="num">${money(l.amount)}</td>${edit ? '<td></td>' : ''}</tr>`;
  const part = (type, title) => { const rows = ls.map((l, i) => [l, i]).filter(([l]) => l.type === type); return rows.length ? `<tr class="inv-h"><td colspan="5">${title}</td></tr>${rows.map(([l, i]) => row(l, i)).join('')}` : ''; };
  return `<div class="sheet-head"><button data-act="close">← Back</button><span>${esc(inv.number)}</span><span></span></div>
  <form class="sheet-body" id="invForm">
    <p class="row"><span class="pill ${edit ? 's-working' : 's-done'}">${edit ? 'Draft' : 'Ready'}</span><span class="muted">${esc(inv.store_name)} · BOL #${esc(invBol(inv))} · ${esc(niceDate(inv.day))}</span></p>
    <p><button type="button" class="btn" data-act="inv-bol">📷 See the BOL photo</button></p>
    ${miss && edit ? '<div class="banner need-banner">A price is missing. Save the rack price for this day on the Invoices page, or type the price in the red box.</div>' : ''}
    <div class="inv-wrap"><table class="inv-t"><tr><th>Item</th><th class="num">Gallons</th><th>Price / gal</th><th class="num">Amount</th>${edit ? '<th></th>' : ''}</tr>
      ${part('fuel', 'Fuel')}${part('freight', 'Freight')}${part('tax', 'Taxes and fees')}${part('other', 'Other')}
      <tr class="inv-total"><td colspan="3">Invoice total</td><td class="num">${miss ? '—' : money(invTotal(ls))}</td>${edit ? '<td></td>' : ''}</tr></table></div>
    ${edit ? '<p><button type="button" class="btn" data-act="inv-line-add">+ Add a line (discount, fee, credit…)</button></p>' : ''}
    <label class="f">Payment terms</label><select class="in" name="terms" id="invTerms"${dis}>${INV_TERMS.concat(d.terms && d.terms !== '__custom' && !INV_TERMS.includes(d.terms) ? [d.terms] : []).map(t => `<option${d.terms === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}<option value="__custom"${d.terms === '__custom' ? ' selected' : ''}>Custom date</option></select>
    <label class="f">Due date</label><input class="in" type="date" name="due_date" value="${esc(d.due_date)}"${dis}>
    <label class="f">P.O. number (optional)</label><input class="in" name="po_number" value="${esc(d.po_number)}"${dis}>
    <label class="f">Note printed on the invoice (optional)</label><textarea class="in" name="notes"${dis}>${esc(d.notes)}</textarea>
    <p></p>
    ${edit ? `<button class="btn go wide" type="submit">Save draft</button><p></p><button type="button" class="btn wide" data-act="inv-ready">✅ Mark ready</button>`
      : `<button type="button" class="btn wide" data-act="inv-unready">✏️ Change it (back to draft)</button>`}
    <p></p><button type="button" class="btn go wide" data-act="inv-print">🖨 Print / Save as PDF</button>
  </form>`;
}
function readInvForm() {
  const f = $('#invForm'), d = S.sheet && S.sheet.draft; if (!f || !d) return d;
  f.querySelectorAll('[data-li]').forEach(el => {
    const l = d.lines[+el.dataset.li], k = el.dataset.lf; if (!l) return;
    if (k === 'rate') { const v = numOrNull(el.value); if (v !== l.rate && !(v != null && l.rate != null && v.toFixed(6) === Number(l.rate).toFixed(6))) { l.rate = v; l.manual = true; } }
    else if (k === 'amount') l.amount = numOrNull(el.value);
    else l.label = el.value;
  });
  ['terms', 'due_date', 'po_number', 'notes'].forEach(k => { if (f.elements[k]) d[k] = f.elements[k].value; });
  const inv = S.invoices.find(x => x.id === S.sheet.id);
  if (inv && inv.status !== 'ready') d.lines = invLines(inv, d.lines);
  return d;
}
function invDraft(inv) {
  const p = S.store_pricing.find(x => x.id === inv.store_id) || {};
  const terms = inv.terms === 'Custom date' ? '__custom' : (inv.terms || p.terms || 'Due on delivery');
  return { lines: inv.status === 'ready' ? (inv.lines || []) : invLines(inv, inv.lines), terms, due_date: inv.due_date || dueFrom(inv.day, terms), po_number: inv.po_number || '', notes: inv.notes || '' };
}
async function saveInv(status) {
  const d = readInvForm(), inv = S.invoices.find(x => x.id === S.sheet.id); if (!inv) return false;
  const total = invTotal(d.lines), miss = invMissing(d.lines);
  if (status === 'ready' && miss) { toast('A price is missing. Fill in the red boxes first.'); renderSheet(); return false; }
  const patch = { lines: d.lines, subtotal: miss ? null : total, total: miss ? null : total, needs_price: miss, terms: d.terms === '__custom' ? 'Custom date' : d.terms, due_date: d.due_date || null, po_number: d.po_number.trim(), notes: d.notes.trim(), status, ready_at: status === 'ready' ? nowIso() : null, updated_by: S.me, updated_at: nowIso() };
  const okay = await safe(async () => { await db.update('invoices', inv.id, patch); return true; }, 'The invoice was NOT saved.');
  if (okay) Object.assign(inv, patch);
  return okay;
}
function printInvoice(inv, d) {
  const o = S.office || {}, st = S.stores.find(x => x.id === inv.store_id) || {}, dl = S.deliveries.find(x => x.id === inv.delivery_id) || {};
  const ls = d.lines, nl = s => esc(s || '').replace(/\n/g, '<br>');
  const sect = (type, title, cols) => { const rows = ls.filter(l => l.type === type); return rows.length ? `<h3>${title}</h3><table><tr>${cols.map(c => `<th${c[1] ? ' class="n"' : ''}>${c[0]}</th>`).join('')}</tr>${rows.map(l => type === 'other'
    ? `<tr><td>${esc(l.label)}</td><td class="n">${money(l.amount)}</td></tr>`
    : `<tr><td>${esc(l.label)}</td>${type === 'fuel' ? `<td>${esc(dl.bol_number || '')}</td>` : ''}<td class="n">${galText(l.gallons)}</td><td class="n">${rate6(l.rate)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}</table>` : ''; };
  const terms = d.terms === '__custom' ? 'Custom date' : d.terms;
  closeViewer();
  const v = document.createElement('div'); v.id = 'viewer';
  v.innerHTML = `<div class="sheet-head"><button type="button" data-act="viewer-close">← Back</button><span class="vname">${esc(inv.number)}</span><span></span></div>
    <div class="viewer-body"><p class="row vbtns"><button type="button" class="btn go" data-act="pdf-share" disabled>Making the PDF…</button>${standalone() ? '' : '<button type="button" class="btn" data-act="pdf-print">🖨 Print</button>'}</p>
    <div class="pi-paper"></div></div>`;
  document.body.appendChild(v);
  const el = $('.pi-paper', v);
  el.innerHTML = `<div class="pi">
    <div class="pi-top"><div><b class="pi-co">${esc(o.name || 'King Energy')}</b><br>${nl(o.address)}${o.phone ? '<br>' + esc(o.phone) : ''}${o.email ? '<br>' + esc(o.email) : ''}</div>
      <table class="pi-meta"><tr><td>Invoice No:</td><td>${esc(inv.number)}</td></tr><tr><td>Invoice Date:</td><td>${esc(longDate((inv.ready_at || nowIso()).slice(0, 10)))}</td></tr><tr><td>Delivery Date:</td><td>${esc(longDate(inv.day))}</td></tr>${d.po_number ? `<tr><td>P.O. No:</td><td>${esc(d.po_number)}</td></tr>` : ''}</table></div>
    ${o.remit_to ? `<div class="pi-remit"><b>Remit To:</b><br>${nl(o.remit_to)}</div>` : ''}
    <div class="pi-to"><div><b>Bill To:</b><br>${esc(st.name || inv.store_name)}${st.owner_name ? '<br>Attn: ' + esc(st.owner_name) : ''}<br>${nl(st.address)}</div><div><b>Ship To:</b><br>${esc(st.name || inv.store_name)}<br>${nl(st.address)}</div></div>
    ${sect('fuel', 'Fuel', [['Description'], ['BOL No'], ['Units', 1], ['Unit Price', 1], ['Total', 1]])}
    ${sect('freight', 'Freight Summary', [['Description'], ['Units', 1], ['Unit Price', 1], ['Total', 1]])}
    ${sect('tax', 'Tax and Other Charges Summary', [['Description'], ['Basis', 1], ['Rate', 1], ['Total', 1]])}
    ${sect('other', 'Other', [['Description'], ['Total', 1]])}
    <div class="pi-total">Invoice Total <b>${money(invTotal(ls))}</b></div>
    <p><b>Payment terms:</b> Due by ${esc(longDate(d.due_date))} (${esc(terms)})</p>
    ${d.notes ? `<p>${nl(d.notes)}</p>` : ''}
    <p class="pi-foot">${esc(o.footer || 'Thank you for your business!')}</p></div>`;
  const cur = viewing = { id: inv.id, file: null, failed: false, pdf: true };
  const btn = () => $('[data-act=pdf-share]', v);
  makePdf($('.pi', el), inv.number + '.pdf').then(file => {
    if (viewing !== cur) return; cur.file = file;
    const b = btn(); if (b) { b.disabled = false; b.textContent = '📤 Save or share PDF'; }
  }).catch(e => { console.warn(e); cur.failed = true; const b = btn(); if (b) { b.textContent = 'Could not make the PDF'; } });
}
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let pdfLib = null;
function loadPdfLib() {
  if (window.html2pdf) return Promise.resolve();
  if (!pdfLib) pdfLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; s.onload = res; s.onerror = () => { pdfLib = null; rej(new Error('Could not load the PDF maker.')); }; document.head.appendChild(s); });
  return pdfLib;
}
async function makePdf(node, name) {
  await loadPdfLib();
  const blob = await window.html2pdf().set({ margin: 0.3, filename: name, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(node).outputPdf('blob');
  return new File([blob], name, { type: 'application/pdf' });
}
async function sharePdf() {
  const cur = viewing; if (!cur || !cur.file) return;
  const f = cur.file;
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: f.name }); } catch (e) { if (e.name !== 'AbortError') toast('Could not share. Try again.'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  toast('PDF saved to your downloads.');
}
function companyView() {
  const o = S.office || {};
  const taxRow = t => `<div class="group" data-tax="${t.id}"><input class="in" data-tf="name" value="${esc(t.name)}" placeholder="Tax name">
    <label class="f">Rate ($ per gallon)</label><input class="in" data-tf="rate" inputmode="decimal" value="${esc(rate6(t.rate))}">
    <div class="row">${GRADES.map(([k, l]) => `<label class="chk"><input type="checkbox" data-tg="${k}"${(t.grades || []).includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>
    <p><button type="button" class="btn danger" data-act="tax-del" data-id="${t.id}">Remove this tax</button></p></div>`;
  return `<form id="companyForm"><div class="group"><div class="group-t">🏢 Printed at the top of every invoice</div>
    <label class="f">Company name</label><input class="in" name="name" value="${esc(o.name)}" placeholder="King Energy LLC">
    <label class="f">Address</label><textarea class="in" name="address" placeholder="Street&#10;City, KY ZIP">${esc(o.address)}</textarea>
    <label class="f">Phone</label><input class="in" name="phone" value="${esc(o.phone)}">
    <label class="f">Email</label><input class="in" name="email" value="${esc(o.email)}">
    <label class="f">Remit to (where checks go, if different)</label><textarea class="in" name="remit_to">${esc(o.remit_to)}</textarea>
    <label class="f">Line at the bottom</label><input class="in" name="footer" value="${esc(o.footer)}" placeholder="Thank you for your business!">
    <p></p><button class="btn go wide" type="submit">Save company info</button></div></form>
    <h2 class="sec">Taxes and fees per gallon</h2>
    <p class="muted">Each tax is added to an invoice for the fuels you tick. The starting list came from your sample invoice and covers gasoline only. Add diesel and kerosene taxes yourself.</p>
    <form id="taxForm">${S.taxes.map(taxRow).join('') || '<p class="empty">No taxes yet.</p>'}
      <p><button type="button" class="btn" data-act="tax-add">+ Add a tax</button></p>
      ${S.taxes.length ? '<button class="btn go wide" type="submit">Save taxes</button>' : ''}</form>`;
}
const comingSoon = (icon, what) =>`<p class="empty" style="margin-top:40px"><span style="font-size:44px">${icon}</span><br>${what} will live here.<br>This page is being built next.</p>`;

function renderMain() {
  if (!S.me || !S.role) return; // wait until we know if this is a partner or staff
  const menu = menuFor();
  if (!menu.some(m => m[0] === S.tab)) S.tab = menu[0][0];
  const cur = menu.find(m => m[0] === S.tab), partner = S.role === 'partner';
  const open = S.tasks.filter(t => t.status !== 'done');
  const nLate = open.filter(isLate).length, nNobody = open.filter(t => !t.owner).length;
  const sub = S.tab === 'tasks' ? ([nLate ? nLate + ' late' : '', nNobody ? nNobody + ' with no owner' : ''].filter(Boolean).join(' · ') || 'All tasks have an owner and are on time') : 'King Energy Office';
  const page = S.tab === 'tasks' ? tasksView()
    : S.tab === 'stores' ? `<input class="in" id="search" type="search" placeholder="Search stores…" value="${esc(S.search)}" style="margin-bottom:12px"><div id="storeList">${storeCards()}</div>`
    : S.tab === 'orders' ? ordersView()
    : S.tab === 'bols' ? dlvView()
    : S.tab === 'invoices' ? invView()
    : S.tab === 'company' ? companyView()
    : staffView();
  const fab = S.tab === 'tasks' ? ['new-task', 'task'] : S.tab === 'stores' ? ['new-store', 'store'] : S.tab === 'orders' ? ['new-order', 'order'] : S.tab === 'bols' ? ['new-dlv', 'delivery'] : null;
  document.body.classList.add('has-side');
  $('#app').innerHTML = `
    <nav class="side${S.menuOpen ? ' open' : ''}"><div class="side-t">KE Office</div>
      ${menu.map(m => `<button class="${S.tab === m[0] ? 'on' : ''}" data-act="tab" data-v="${m[0]}"><span>${m[1]}</span>${m[2]}</button>`).join('')}
      <div class="side-who">${esc(nameOf(S.me))}<br><small>${partner ? 'Partner' : 'Staff'}</small></div></nav>
    ${S.menuOpen ? '<div class="shade" data-act="menu-close"></div>' : ''}
    <header class="top"><button data-act="menu" class="menu-btn" aria-label="Menu">☰</button><h1>${cur[1]} ${esc(cur[2])}<small>${esc(sub)}</small></h1><button data-act="refresh" aria-label="Refresh">↻</button>${partner ? `<button data-act="bell" class="bell" aria-label="Recent changes">🔔${unseenCount() ? `<b class="badge">${unseenCount()}</b>` : ''}</button>` : ''}<button data-act="settings">${esc(nameOf(S.me))} ⚙</button></header>
    <main>
      ${DEMO ? '<div class="banner">Practice mode: saved on this device only. Your partners cannot see it yet.</div>' : ''}
      ${partner && PUSH_OK && !alertsOn ? '<div class="banner">🔔 Alerts are off on this phone. <button class="btn" data-act="alert-on">Turn on</button></div>' : ''}
      ${page}
    </main>
    ${fab ? `<button class="fab" data-act="${fab[0]}">+ New ${fab[1]}</button>` : ''}`;
}

/* ---------- sheets (full-screen pages) ---------- */
function openSheet(sheet) { S.sheet = sheet; S.draftComment = ''; renderSheet(); $('#sheet').scrollTop = 0; }
function closeSheet() { S.sheet = null; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
const ownerButtons = (current, act) => S.members.map(m => `<button type="button" class="btn${current === m.email ? ' on' : ''}" data-act="${act}" data-v="${esc(m.email)}">${esc(m.name)}${m.email === S.me ? ' (me)' : ''}</button>`).join('') +
  `<button type="button" class="btn${!current ? ' on' : ''}" data-act="${act}" data-v="">Nobody yet</button>`;

function renderSheet() {
  const el = $('#sheet'), sh = S.sheet; if (!sh) return;
  el.hidden = false;
  if (sh.type === 'task') el.innerHTML = taskSheet(taskById(sh.id));
  else if (sh.type === 'new-task') el.innerHTML = newTaskSheet(sh.draft);
  else if (sh.type === 'store') { el.innerHTML = storeSheet(sh); loadThumbs(); }
  else if (sh.type === 'order') el.innerHTML = orderSheet(sh);
  else if (sh.type === 'dlv') el.innerHTML = dlvSheet(sh);
  else if (sh.type === 'inv') el.innerHTML = invSheet(sh);
  else if (sh.type === 'settings') el.innerHTML = settingsSheet();
  else if (sh.type === 'activity') el.innerHTML = activitySheet();
}

function activitySheet() {
  return `<div class="sheet-head"><button data-act="close">← Back</button><span>Recent changes</span><span></span></div>
  <div class="sheet-body">${S.activity.length ? S.activity.slice(0, 60).map(a => `<div class="act">
    <div class="act-t">${ACT_ICON[a.kind] || '•'} ${esc(a.title)}</div>
    <div class="when">${esc(nameOf(a.actor))} · ${esc(niceTime(a.created_at))}</div>
    ${a.body ? `<div class="act-b">${esc(a.body)}</div>` : ''}</div>`).join('') : '<p class="empty">Nothing yet. New tasks, picked-up tasks and store changes will show here.</p>'}</div>`;
}

function newTaskSheet(d) {
  return `<div class="sheet-head"><button data-act="close">✕ Cancel</button><span>New task</span><span></span></div>
  <form class="sheet-body" id="newTaskForm">
    <label class="f">What needs to be done?</label><input class="in title-in" name="title" value="${esc(d.title)}" placeholder="Example: Send fuel license application" required>
    <label class="f">Who owns it?</label><div class="row">${ownerButtons(d.owner, 'new-owner')}</div>
    <label class="f">Due date</label><input class="in" type="date" name="due" value="${esc(d.due || '')}">
    <label class="f">Details (optional)</label><textarea class="in" name="details">${esc(d.details)}</textarea>
    <p></p><button class="btn go wide" type="submit">Save task</button>
  </form>`;
}

function taskSheet(t) {
  if (!t) return '';
  const evs = S.events.filter(e => e.task_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const files = S.files.filter(f => f.task_id === t.id);
  return `<div class="sheet-head"><button data-act="close">← Back</button><button data-act="share" data-id="${t.id}">Share to WhatsApp</button></div>
  <div class="sheet-body">
    ${isLate(t) ? `<div class="banner" style="background:var(--red-bg);border-color:var(--red)">This task is ${esc(dueText(t))}.</div>` : ''}
    ${!t.owner && t.status !== 'done' ? '<div class="banner">🚨 Nobody owns this yet. Pick one person below.</div>' : ''}
    <input class="in title-in" data-field="title" value="${esc(t.title)}">
    <label class="f">Status</label><div class="row">${Object.keys(STATUS).map(k => `<button class="btn${t.status === k ? ' on' : ''}" data-act="status" data-v="${k}">${STATUS[k]}</button>`).join('')}</div>
    <label class="f">Who owns it?</label><div class="row">${ownerButtons(t.owner, 'owner')}</div>
    <label class="f">Due date</label><input class="in" type="date" data-field="due" value="${esc(t.due || '')}">
    <label class="f">Details</label><textarea class="in" data-field="details" placeholder="Extra notes about this task">${esc(t.details || '')}</textarea>
    <label class="f">Files and photos (${files.length})</label>
    ${files.map(f => `<div class="file"><button class="link" data-act="open-file" data-id="${f.id}">📎 ${esc(f.name)}</button><button class="x" data-act="del-file" data-id="${f.id}" aria-label="Remove file">✕</button></div>`).join('')}
    <p><label class="btn">+ Add file or photo<input type="file" id="fileIn" multiple hidden></label></p>
    <label class="f">Talk and history</label>
    ${evs.length ? evs.map(e => e.kind === 'comment'
      ? `<div class="ev"><span class="who">${esc(nameOf(e.actor))}</span><span class="when">${esc(niceTime(e.created_at))}</span><div class="body">${esc(e.body)}</div></div>`
      : `<div class="ev h">${esc(nameOf(e.actor))} ${esc(e.body)} <span class="when">${esc(niceTime(e.created_at))}</span></div>`).join('') : '<p class="muted">Nothing said yet.</p>'}
    <div class="say"><textarea class="in" id="comment" placeholder="Write an update…">${esc(S.draftComment)}</textarea><button class="btn primary" data-act="send">Send</button></div>
    <p style="margin-top:32px"><button class="btn danger" data-act="del-task">Delete this task</button></p>
  </div>`;
}

/* ---------- file viewer: shows the file inside the app, so the phone never lands on a blank page ---------- */
let viewing = null;
function closeViewer() { const v = $('#viewer'); if (v) v.remove(); viewing = null; }
async function saveViewing(el) {
  // Never send the app itself to a download link: on a phone's home-screen app that can leave a stuck black screen.
  const cur = viewing; if (!cur) return;
  if (!cur.file) { toast(cur.failed ? 'Could not get the file. Tap Open file.' : 'Still getting the file. Tap again in a moment.'); return; }
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [cur.file] })) await navigator.share({ files: [cur.file] });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(cur.file); a.download = cur.file.name; a.click(); toast('Saved to your downloads.'); }
  } catch (e) { if (!e || e.name !== 'AbortError') { console.warn(e); toast('Could not save it. Tap Open file.'); } }
}
async function openViewer(f) {
  closeViewer();
  const v = document.createElement('div'); v.id = 'viewer';
  v.innerHTML = `<div class="sheet-head"><button type="button" data-act="viewer-close">← Back</button><span class="vname">${esc(f.name)}</span><span></span></div><div class="viewer-body"><p class="muted">Opening…</p></div>`;
  document.body.appendChild(v);
  const url = await safe(() => db.fileUrl(f), 'Could not open the file.');
  if (!v.isConnected) return;
  if (!url) { closeViewer(); return; }
  const cur = viewing = { id: f.id, file: null, failed: false };
  fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
    .then(b => { cur.file = new File([b], f.name, { type: b.type || 'application/octet-stream' }); })
    .catch(e => { cur.failed = true; console.warn(e); });
  const pic = isImage(f.name), body = $('.viewer-body', v);
  body.innerHTML = (pic ? `<img src="${esc(url)}" alt="${esc(f.name)}">`
    : `<div class="bigdoc">📄</div><p><b>${esc(f.name)}</b></p><p class="muted">Tap Open file to read it.</p>`)
    + `<p class="row vbtns"><a class="btn go" href="${esc(url)}" target="_blank" rel="noopener">Open file</a><button type="button" class="btn" data-act="viewer-save">Save or share</button></p>`;
  const img = $('img', body);
  if (img) img.addEventListener('error', () => { img.outerHTML = '<div class="bigdoc">🖼️</div><p class="muted">This picture cannot be shown here. Tap Open file.</p>'; });
}

function loadThumbs() {
  document.querySelectorAll('#sheet img[data-thumb]').forEach(async img => {
    const id = img.dataset.thumb, f = S.store_files.find(x => x.id === id); if (!f) return;
    try { if (!thumbUrls.has(id)) thumbUrls.set(id, await db.fileUrl(f)); img.src = thumbUrls.get(id); } catch (e) { console.warn(e); }
  });
}
function storeFilesBlock(sh) {
  const d = sh.draft;
  const kept = sh.id ? S.store_files.filter(f => f.store_id === sh.id && !d.removeFiles.includes(f.id)) : [];
  const all = kept.map(f => ({ ...f, pending: false })).concat(d.newFiles.map(f => ({ ...f, pending: true })));
  const kinds = [...new Set(KINDS.map(k => k[0]).concat(all.map(f => f.kind || 'other')))];
  const groups = kinds.map(k => {
    const fs = all.filter(f => (f.kind || 'other') === k); if (!fs.length) return '';
    return `<div class="sf-head" style="background:${kindColor(k)}">${esc(kindLabel(k))} (${fs.length})</div><div class="tiles">${fs.map(f => `<div class="tile${f.pending ? ' pending' : ''}">
      ${isImage(f.name) ? (f.pending ? `<img src="${esc(f.preview)}" alt="${esc(f.name)}">` : `<img data-thumb="${f.id}" data-act="sf-open" data-id="${f.id}" alt="${esc(f.name)}">`) : `<button type="button" class="doc"${f.pending ? '' : ` data-act="sf-open" data-id="${f.id}"`}>📄</button>`}
      <button type="button" class="x" data-act="sf-del" data-id="${f.id}" aria-label="Remove">✕</button><span class="nm">${f.pending ? 'Not saved yet · ' : ''}${esc(f.name)}</span></div>`).join('')}</div>`;
  }).join('');
  const kind = d.kind || 'site', custom = kind === '__custom';
  return `<label class="f">Documents &amp; photos (${all.length})</label>
    <p class="muted" style="margin:0 0 6px">What is this file? Pick it, then tap Add. Files are kept when you tap Save store.</p>
    <select class="in" id="sfKind">${KINDS.map(([k, l]) => `<option value="${k}"${kind === k ? ' selected' : ''}>${l}</option>`).join('')}<option value="__custom"${custom ? ' selected' : ''}>✏️ Custom (type your own)</option></select>
    ${custom ? `<input class="in" id="sfCustom" placeholder="Type a name, like Tank test report" value="${esc(d.customKind || '')}" style="margin-top:6px">` : ''}
    <p><label class="btn go">+ Add a file<input type="file" id="storeFileIn" multiple hidden></label></p>
    ${groups}`;
}
const xrowHtml = (x, i) => {
  const custom = x.custom || (!!x.label && !EXTRA_IDEAS.includes(x.label));
  return `<div class="xrow"><select class="in" data-x="pick"><option value="">Pick a detail…</option>${EXTRA_IDEAS.map(v => `<option${!custom && x.label === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}<option value="__custom"${custom ? ' selected' : ''}>✏️ Custom (type your own)</option></select>
    <button type="button" data-act="x-del" data-i="${i}" aria-label="Remove detail">✕</button>
    ${custom ? `<input class="in" data-x="label" placeholder="Name of the detail" value="${esc(x.label)}">` : ''}
    <input class="in" data-x="value" placeholder="Answer" value="${esc(x.value)}"></div>`;
};

function storeSheet(sh) {
  const d = sh.draft;
  const digits = (d.phone || '').replace(/[^\d+]/g, '');
  return `<div class="sheet-head"><button data-act="close">← Back</button><span>${sh.id ? 'Store' : 'New store'}</span><span></span></div>
  <form class="sheet-body" id="storeForm">
    <label class="f">Store name</label><input class="in title-in" name="name" value="${esc(d.name)}" required>
    ${sh.id && (digits || d.address) ? `<p class="row">${digits ? `<a class="btn" href="tel:${esc(digits)}">📞 Call</a>` : ''}${d.address ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}">📍 Map</a>` : ''}</p>` : ''}
    <label class="f">Owner or contact name</label><input class="in" name="owner_name" value="${esc(d.owner_name)}">
    <label class="f">Phone</label><input class="in" type="tel" name="phone" value="${esc(d.phone)}">
    <label class="f">Email</label><input class="in" type="email" name="email" value="${esc(d.email)}">
    <label class="f">Address</label><input class="in" name="address" value="${esc(d.address)}">
    <div class="group"><div class="group-t">🏠 Landlord</div>
    <label class="f">Landlord name</label><input class="in" name="landlord_name" value="${esc(d.landlord_name)}">
    <label class="f">Landlord number</label><input class="in" type="tel" name="landlord_phone" value="${esc(d.landlord_phone)}">
    ${sh.id && (d.landlord_phone || '').replace(/[^\d+]/g, '') ? `<p><a class="btn" href="tel:${esc(d.landlord_phone.replace(/[^\d+]/g, ''))}">📞 Call landlord</a></p>` : ''}
    <label class="f">Landlord email</label><input class="in" type="email" name="landlord_email" value="${esc(d.landlord_email)}"></div>
    ${pricingBlock(d.p)}
    <label class="f">Store details (tanks, pumps, POS, anything)</label>
    <div id="xrows">${d.extra.map(xrowHtml).join('')}</div>
    <button type="button" class="btn" data-act="x-add">+ Add a detail</button>
    <label class="f">Notes</label><textarea class="in" name="notes">${esc(d.notes)}</textarea>
    ${storeFilesBlock(sh)}
    <p></p><button class="btn go wide" type="submit">Save store</button>
    ${sh.id ? '<p style="margin-top:32px"><button type="button" class="btn danger" data-act="del-store">Delete this store</button></p>' : ''}
  </form>`;
}

function settingsSheet() {
  return `<div class="sheet-head"><button data-act="close">← Back</button><span>Settings</span><span></span></div>
  <div class="sheet-body">
    <p>Signed in as <b>${esc(nameOf(S.me))}</b>${DEMO ? ' (practice mode)' : ' · ' + esc(S.me)}</p>
    ${DEMO || S.role !== 'partner' ? '' : `<label class="f">Alerts on this phone</label>
    ${!PUSH_OK ? '<p class="muted">This browser cannot show alerts yet. On iPhone: add the app to your Home Screen first, open it from there, then come back here.</p>'
      : alertsOn ? '<p>🔔 Alerts are ON. You get one when a task is created, picked up, or given to you, when a store is changed, and each morning if something is due, late, or has no owner.</p><div class="row"><button class="btn" data-act="alert-test">Send me a test alert</button><button class="btn" data-act="alert-off">Turn off</button></div>'
      : '<button class="btn go wide" data-act="alert-on">🔔 Turn on alerts</button>'}`}
    <label class="f">Put the app on your phone</label>
    <p><b>iPhone:</b> open this page in Safari, tap the Share button, then “Add to Home Screen”.</p>
    <p><b>Android:</b> open this page in Chrome, tap the ⋮ menu, then “Add to Home screen”.</p>
    ${DEMO ? '' : `<label class="f">Change my password</label><form id="pwForm" class="row"><input class="in" type="password" name="pw" minlength="8" placeholder="New password (8 or more letters)" autocomplete="new-password" required style="flex:1;min-width:180px"><button class="btn" type="submit">Change</button></form>`}
    <p class="muted" style="margin-top:20px">App version ${esc(window.KE_VERSION || 1)} <button class="btn" data-act="reload">Get the newest version</button></p>
    <p style="margin-top:28px"><button class="btn wide" data-act="signout">${DEMO ? 'Switch person' : 'Sign out'}</button></p>
    ${DEMO ? '<p><button class="btn danger wide" data-act="demo-reset">Wipe practice data</button></p>' : ''}
  </div>`;
}

function readStoreForm() {
  const f = $('#storeForm'), d = S.sheet.draft; if (!f) return d;
  STORE_FIELDS.forEach(([k]) => { d[k] = f.elements[k].value.trim(); });
  d.extra = [...f.querySelectorAll('.xrow')].map(r => {
    const pick = $('[data-x=pick]', r).value, custom = pick === '__custom', li = $('[data-x=label]', r);
    return { label: custom ? (li ? li.value.trim() : '') : pick, value: $('[data-x=value]', r).value.trim(), custom };
  });
  f.querySelectorAll('[data-p]').forEach(i => { d.p[i.dataset.p] = i.value.trim(); });
  const tp = $('[data-pp=terms]', f);
  if (tp) { if (tp.value === '__custom') { if (!d.p.termsCustom) d.p.terms = ''; d.p.termsCustom = true; } else { d.p.termsCustom = false; d.p.terms = tp.value; } }
  const ks = $('#sfKind'); if (ks) d.kind = ks.value;
  const kc = $('#sfCustom'); if (kc) d.customKind = kc.value.trim();
  return d;
}

/* ---------- clicks ---------- */
const ACT = {
  'demo-login': async el => { await db.signIn(el.dataset.v); await start(); },
  tab: el => { S.tab = el.dataset.v; S.menuOpen = false; renderMain(); window.scrollTo(0, 0); },
  menu: () => { S.menuOpen = !S.menuOpen; renderMain(); },
  'open-inv': el => { const inv = S.invoices.find(x => x.id === el.dataset.id); if (inv) openSheet({ type: 'inv', id: inv.id, draft: invDraft(inv) }); },
  'inv-bol': () => { const inv = S.invoices.find(x => x.id === S.sheet.id), x = inv && S.deliveries.find(r => r.id === inv.delivery_id); if (x) openViewer({ id: x.id, name: x.photo_name || ('BOL ' + x.bol_number + '.jpg'), path: x.photo_path, data: x.photo_data }); else toast('The delivery for this invoice is gone.'); },
  'inv-line-add': () => { const d = readInvForm(); d.lines.push({ key: 'other:' + uid(), type: 'other', label: '', amount: null }); renderSheet(); },
  'inv-line-del': el => { const d = readInvForm(); d.lines.splice(+el.dataset.i, 1); renderSheet(); },
  'inv-ready': async () => { if (await saveInv('ready')) { toast('Invoice is ready. Tap Print to print or save it.'); renderSheet(); renderMain(); } },
  'inv-unready': async () => { const inv = S.invoices.find(x => x.id === S.sheet.id); if (await saveInv('draft')) { S.sheet.draft = invDraft(inv); renderSheet(); renderMain(); } },
  'inv-print': () => { const inv = S.invoices.find(x => x.id === S.sheet.id), d = readInvForm(); if (inv.status !== 'ready' && invMissing(d.lines)) { toast('A price is missing. Fill in the red boxes first.'); renderSheet(); return; } printInvoice(inv, d); },
  'rack-save': async () => {
    const day = ($('#rackDay') || {}).value || today(), rows = [];
    document.querySelectorAll('[data-rack]').forEach(el => { const v = numOrNull(el.value); if (v != null) rows.push({ id: day + '|' + el.dataset.rack, day, grade: el.dataset.rack, price: v, updated_by: S.me, updated_at: nowIso() }); });
    if (!rows.length) { toast('Type at least one rack price.'); return; }
    const okay = await safe(async () => { for (const r of rows) await db.upsert('rack_prices', r); return true; }, 'Rack prices were NOT saved.');
    if (okay) toast('Rack prices saved for ' + niceDate(day) + '. Drafts for that day now use them.'); refresh();
  },
  'tax-add': async () => { await safe(() => db.insert('tax_rates', { id: uid(), name: 'New tax', rate: 0, grades: [], sort: S.taxes.reduce((m, t) => Math.max(m, t.sort || 0), 0) + 1, active: true, updated_by: S.me, updated_at: nowIso() }), 'Could not add the tax.'); refresh(); },
  'tax-del': async el => { const t = S.taxes.find(x => x.id === el.dataset.id); if (!t || !confirm('Remove “' + t.name + '”? Drafts stop adding it. Ready invoices keep it.')) return; await safe(() => db.remove('tax_rates', t.id), 'Could not remove the tax.'); refresh(); },
  'new-dlv': () => openSheet({ type: 'dlv', id: null, draft: dlvDraft(null) }),
  'open-dlv': el => { const x = S.deliveries.find(r => r.id === el.dataset.id); if (x) openSheet({ type: 'dlv', id: x.id, draft: dlvDraft(x) }); },
  'dlv-photo': () => { const x = S.deliveries.find(r => r.id === S.sheet.id); if (x) openViewer({ id: x.id, name: x.photo_name || ('BOL ' + x.bol_number + '.jpg'), path: x.photo_path, data: x.photo_data }); },
  'dlv-del': async () => {
    const x = S.deliveries.find(r => r.id === S.sheet.id); if (!x) return;
    if (!confirm('Delete BOL #' + x.bol_number + ' for ' + x.store_name + '? Its order goes back to waiting, and its invoice draft is deleted. This cannot be undone.')) return;
    S.deliveries = S.deliveries.filter(r => r.id !== x.id); closeSheet(); renderMain();
    await safe(() => db.removeFile({ id: x.id, path: x.photo_path }, 'deliveries'), 'Could not delete the delivery.'); refresh();
  },
  'new-order': () => openSheet({ type: 'order', id: null, draft: orderDraft(null) }),
  'open-order': el => { const o = S.orders.find(x => x.id === el.dataset.id); if (o) openSheet({ type: 'order', id: o.id, draft: orderDraft(o) }); },
  'order-status': async el => {
    const o = S.orders.find(x => x.id === S.sheet.id), v = el.dataset.v; if (!o || o.status === v) return;
    o.status = v; o.updated_at = nowIso(); renderSheet(); renderMain();
    await safe(() => db.update('fuel_orders', o.id, { status: v, updated_by: S.me, updated_at: o.updated_at }), 'Could not change the status.');
    toast('Order marked ' + ORDER_STATUS[v] + '.');
  },
  'order-del': async () => {
    const o = S.orders.find(x => x.id === S.sheet.id); if (!o) return;
    if (!confirm('Delete the order for ' + o.store_name + ' for everyone? This cannot be undone.')) return;
    S.orders = S.orders.filter(x => x.id !== o.id); closeSheet(); renderMain();
    await safe(() => db.remove('fuel_orders', o.id), 'Could not delete the order.'); refresh();
  },
  'menu-close': () => { S.menuOpen = false; renderMain(); },
  'staff-toggle': async el => {
    const s = S.staff.find(x => x.id === el.dataset.id); if (!s) return;
    s.active = !s.active; renderMain();
    await safe(() => db.update('staff', s.id, { active: s.active }), 'Could not change it.');
    toast(s.active ? s.name + ' can sign in again.' : s.name + ' can no longer sign in.'); refresh();
  },
  'staff-del': async el => {
    const s = S.staff.find(x => x.id === el.dataset.id); if (!s) return;
    if (!confirm('Remove ' + s.name + ' from staff? They will no longer be able to use the app.')) return;
    S.staff = S.staff.filter(x => x.id !== s.id); renderMain();
    await safe(() => db.remove('staff', s.id), 'Could not remove them.'); refresh();
  },
  filter: el => { S.filter = el.dataset.v; renderMain(); },
  settings: () => openSheet({ type: 'settings' }),
  close: () => {
    if (S.sheet && S.sheet.type === 'store' && S.sheet.draft.newFiles.length && !confirm('You added files but did not tap Save store. Leave without saving them?')) return;
    closeSheet();
  },
  refresh: async () => { await refresh(); checkVersion(); toast('Up to date.'); },
  bell: () => { openSheet({ type: 'activity' }); try { localStorage.setItem(seenKey(), nowIso()); } catch (e) { /* ignore */ } renderMain(); },
  'open-task': el => openSheet({ type: 'task', id: el.dataset.id }),
  take: el => { const id = el.dataset.id; const t = taskById(id); if (!t) return; setOwnerQuiet(id); },
  'new-task': () => openSheet({ type: 'new-task', draft: { title: '', owner: null, due: '', details: '' } }),
  'new-owner': el => { const f = $('#newTaskForm'), d = S.sheet.draft; d.title = f.elements.title.value; d.due = f.elements.due.value; d.details = f.elements.details.value; d.owner = el.dataset.v || null; renderSheet(); },
  status: el => { const t = taskById(S.sheet.id); if (t.status !== el.dataset.v) patchTask(t.id, { status: el.dataset.v }, 'set the status to ' + STATUS[el.dataset.v] + '.'); },
  owner: el => setOwner(S.sheet.id, el.dataset.v || null),
  send: async () => {
    const box = $('#comment'), text = box.value.trim(); if (!text) return;
    S.draftComment = '';
    await safe(() => addEvent(S.sheet.id, 'comment', text));
    renderSheet(); renderMain();
  },
  share: el => {
    const t = taskById(el.dataset.id);
    const text = `King Energy task\n*${t.title}*\nOwner: ${t.owner ? nameOf(t.owner) : 'NOBODY YET'}\nDue: ${t.due ? niceDate(t.due) : 'no date'}\nStatus: ${STATUS[t.status]}${isLate(t) ? ' (LATE)' : ''}\n${location.origin + location.pathname}`;
    let file = null;
    try { file = new File([taskCardBlob(t)], 'king-energy-task.png', { type: 'image/png' }); } catch (e) { console.warn(e); }
    if (navigator.share) {
      // Phones: use the phone's own share menu. The app itself never leaves this page.
      const withPic = file && navigator.canShare && navigator.canShare({ files: [file] });
      navigator.share(withPic ? { files: [file], text } : { text })
        .catch(e => { if (!e || e.name !== 'AbortError') { console.warn(e); toast('Sharing did not work on this phone.'); } });
      return;
    }
    // Computers: save the picture, then open WhatsApp in a new tab.
    if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); toast('Picture saved. Attach it in WhatsApp.'); }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  },
  'del-task': async () => {
    const t = taskById(S.sheet.id);
    if (!confirm('Delete “' + t.title + '” for everyone? This cannot be undone.')) return;
    const files = S.files.filter(f => f.task_id === t.id);
    closeSheet();
    await safe(async () => { for (const f of files) await db.removeFile(f); await db.remove('tasks', t.id); });
    refresh();
  },
  'open-file': el => { const f = S.files.find(x => x.id === el.dataset.id); if (f) openViewer(f); },
  'viewer-close': () => closeViewer(),
  'pdf-share': () => sharePdf(),
  'pdf-print': () => { document.body.classList.add('printing'); const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); },
  'viewer-save': el => saveViewing(el),
  'del-file': async el => {
    const f = S.files.find(x => x.id === el.dataset.id);
    if (!confirm('Remove the file “' + f.name + '”?')) return;
    S.files = S.files.filter(x => x.id !== f.id); renderSheet(); renderMain();
    await safe(async () => { await db.removeFile(f); await addEvent(f.task_id, 'history', 'removed the file ' + f.name + '.'); renderSheet(); });
  },
  'new-store': () => openSheet({ type: 'store', id: null, draft: storeDraft({}) }),
  'open-store': el => { const s = S.stores.find(x => x.id === el.dataset.id); openSheet({ type: 'store', id: s.id, draft: storeDraft(s) }); },
  'x-add': () => { readStoreForm().extra.push({ label: '', value: '' }); renderSheet(); },
  'x-del': el => { readStoreForm().extra.splice(+el.dataset.i, 1); renderSheet(); },
  'del-store': async () => {
    const id = S.sheet.id, s = S.stores.find(x => x.id === id);
    if (!confirm('Delete “' + s.name + '” and its files for everyone? This cannot be undone.')) return;
    const files = S.store_files.filter(f => f.store_id === id);
    closeSheet();
    await safe(async () => { for (const f of files) await db.removeFile(f, 'store_files'); await db.remove('stores', id); await logActivity('store', 'Store deleted: ' + s.name, 'The store and its ' + files.length + ' file(s) were removed.'); });
    refresh();
  },
  'sf-open': el => { const f = S.store_files.find(x => x.id === el.dataset.id); if (f) openViewer(f); },
  'sf-del': el => {
    const d = readStoreForm(), id = el.dataset.id, i = d.newFiles.findIndex(x => x.id === id);
    if (i >= 0) { if (d.newFiles[i].preview) URL.revokeObjectURL(d.newFiles[i].preview); d.newFiles.splice(i, 1); }
    else { d.removeFiles.push(id); toast('It will be removed when you tap Save store.'); }
    renderSheet();
  },
  reload: () => { location.href = location.pathname + '?r=' + Date.now(); },
  'alert-on': () => enableAlerts(),
  'alert-off': () => disableAlerts(),
  'alert-test': async () => {
    const r = await safe(() => db.fn('test'), 'The test alert could not be sent.');
    if (r) toast(r.sent ? 'Test alert sent. It should pop up in a few seconds.' : 'No alert went out. Turn alerts off and on again.');
  },
  signout: async () => { await disableAlerts(true); await db.signOut(); S.me = null; closeSheet(); renderLogin(); },
  'demo-reset': async () => { if (!confirm('Wipe all practice data on this device?')) return; db.reset(); closeSheet(); await refresh(); }
};
function setOwnerQuiet(id) {
  const t = taskById(id); t.owner = S.me; t.updated_at = nowIso(); renderMain(); toast('It is yours now.');
  safe(async () => { await db.update('tasks', id, { owner: S.me, updated_at: t.updated_at }); await addEvent(id, 'history', 'took this task.'); await logActivity('task_taken', nameOf(S.me) + ' picked up: ' + t.title, taskFacts(t)); });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
  fn(el);
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'loginForm') {
    try { await db.signIn(f.elements.email.value.trim().toLowerCase(), f.elements.pw.value); await start(); }
    catch (err) { renderLogin('That email or password did not work.'); }
  } else if (f.id === 'newTaskForm') {
    const title = f.elements.title.value.trim(); if (!title) return;
    const owner = S.sheet.draft.owner, due = f.elements.due.value || null;
    const t = { id: uid(), title, details: f.elements.details.value.trim(), status: 'todo', owner, due, created_by: S.me, created_at: nowIso(), updated_at: nowIso() };
    S.tasks.push(t); closeSheet(); S.tab = 'tasks'; renderMain();
    await safe(async () => {
      await db.insert('tasks', t);
      await addEvent(t.id, 'history', 'created this task' + (owner ? (owner === S.me ? ' and took it.' : ' and gave it to ' + nameOf(owner) + '.') : ' with no owner.'));
      await logActivity('task_new', 'New task: ' + t.title, taskFacts(t) + (t.details ? '\nDetails: ' + t.details : ''));
    });
    if (!owner) toast('Saved. Nobody owns it yet.');
  } else if (f.id === 'storeForm') {
    const d = readStoreForm();
    const extra = d.extra.filter(x => x.label || x.value).map(x => ({ label: x.label || 'Note', value: x.value }));
    const isNew = !S.sheet.id, id = S.sheet.id || uid(), stamp = nowIso();
    const old = isNew ? null : S.stores.find(x => x.id === id);
    const fields = {}; STORE_FIELDS.forEach(([k]) => { fields[k] = d[k]; });
    const removed = S.store_files.filter(x => d.removeFiles.includes(x.id));
    const newFiles = d.newFiles.slice();
    const badNum = pricingBadNumber(d.p);
    if (badNum) { toast(badNum + ' must be a number, like 0.0275'); return; }
    const oldP = isNew ? null : S.store_pricing.find(x => x.id === id), prow = pricingRow(d.p);
    const plines = pricingChanges(oldP, prow);
    const lines = storeChanges(old, fields, extra, newFiles, removed).concat(plines);
    closeSheet();
    if (!isNew && !lines.length) { toast('Nothing changed.'); return; }
    toast('Saving…');
    const saved = await safe(async () => {
      if (isNew) await db.insert('stores', { id, ...fields, extra, created_by: S.me, updated_by: S.me, created_at: stamp, updated_at: stamp });
      else await db.update('stores', id, { ...fields, extra, updated_by: S.me, updated_at: stamp });
      if (plines.length) {
        const pr = { ...prow, updated_by: S.me, updated_at: stamp };
        if (oldP) await db.update('store_pricing', id, pr); else await db.insert('store_pricing', { id, ...pr });
      }
      for (const nf of newFiles) {
        const row = { id: nf.id, store_id: id, kind: nf.kind, name: nf.name, size: nf.size, path: 'stores/' + id + '/' + nf.id + '-' + nf.name.replace(/[^\w.\-]+/g, '_'), uploaded_by: S.me, created_at: stamp };
        await db.uploadFile(row, nf.file, 'store_files');
      }
      for (const f of removed) await db.removeFile(f, 'store_files');
      await logActivity('store', (isNew ? 'New store: ' : 'Store updated: ') + fields.name, lines.join('\n'));
      return true;
    });
    await refresh(); if (saved) toast('Store saved. Your partners are being told.');
  } else if (f.id === 'orderForm') {
    const isNew = !S.sheet.id, old = isNew ? null : S.orders.find(x => x.id === S.sheet.id);
    if (!isNew && S.role !== 'partner') return;
    const sid = f.elements.store_id.value, st = S.storeList.find(s => s.id === sid);
    const g = {}; GRADES.forEach(([k]) => { g[k] = gal(f.elements[k].value); });
    if (!sid) { toast('Pick a store first.'); return; }
    if (!orderTotal(g)) { toast('Type the gallons for at least one fuel.'); return; }
    const stamp = nowIso();
    const base = { store_id: sid, store_name: st ? st.name : (old ? old.store_name : ''), day: f.elements.day.value, ...g, notes: f.elements.notes.value.trim(), updated_by: S.me, updated_at: stamp };
    closeSheet();
    if (isNew) {
      const row = { id: uid(), ...base, status: 'new', created_by: S.me, created_at: stamp };
      S.orders.push(row); S.tab = 'orders'; renderMain();
      const okay = await safe(async () => { await db.insert('fuel_orders', row); return true; }, 'The order was NOT saved. Check your internet and try again.');
      if (okay) { toast('Order saved. The partners are being told.'); ping('order_new', { order_id: row.id }); setTimeout(refresh, 2500); } else refresh();
    } else {
      Object.assign(old, base); renderMain();
      await safe(() => db.update('fuel_orders', old.id, base), 'The changes were NOT saved.');
      toast('Order changed.'); refresh();
    }
  } else if (f.id === 'invForm') {
    if (await saveInv('draft')) { toast('Draft saved.'); renderSheet(); renderMain(); }
  } else if (f.id === 'companyForm') {
    const row = { id: 'main', updated_by: S.me, updated_at: nowIso() };
    ['name', 'address', 'phone', 'email', 'remit_to', 'footer'].forEach(k => { row[k] = f.elements[k].value.trim(); });
    if (await safe(async () => { await db.upsert('office_info', row); return true; }, 'Company info was NOT saved.')) toast('Company info saved.');
    refresh();
  } else if (f.id === 'taxForm') {
    const rows = [...f.querySelectorAll('[data-tax]')].map(g => ({ id: g.dataset.tax, name: g.querySelector('[data-tf=name]').value.trim() || 'Tax', rate: numOrNull(g.querySelector('[data-tf=rate]').value) || 0, grades: [...g.querySelectorAll('[data-tg]:checked')].map(c => c.dataset.tg), updated_by: S.me, updated_at: nowIso() }));
    if (await safe(async () => { for (const r of rows) await db.update('tax_rates', r.id, r); return true; }, 'Taxes were NOT saved.')) toast('Taxes saved. Drafts use the new rates; ready invoices do not change.');
    refresh();
  } else if (f.id === 'dlvForm') {
    const d = readDlvForm(), isNew = !S.sheet.id, old = isNew ? null : S.deliveries.find(x => x.id === S.sheet.id);
    if (!isNew && S.role !== 'partner') return;
    const g = {}; GRADES.forEach(([k]) => { g[k] = gal(d[k]); });
    const bol = (d.bol_number || '').trim();
    if (isNew && !d.order_id) { toast('Pick the order first.'); return; }
    if (!bol) { toast('Type the BOL number.'); return; }
    if (!orderTotal(g)) { toast('Type the BOL gallons for at least one fuel.'); return; }
    if (isNew && !d.file) { toast('Take the BOL photo first. It is required.'); return; }
    const stamp = nowIso();
    if (isNew) {
      const o = S.orders.find(x => x.id === d.order_id); if (!o) { toast('That order is gone. Refresh and try again.'); return; }
      const id = uid(), ext = (d.file.name.match(/\.\w+$/) || ['.jpg'])[0].toLowerCase();
      const row = { id, order_id: o.id, store_id: o.store_id, store_name: o.store_name, day: d.day, bol_number: bol, ...g, notes: d.notes.trim(),
        photo_path: 'bol/' + id + ext, photo_name: 'BOL ' + bol.replace(/[^\w\-]+/g, '_') + ext, created_by: S.me, created_at: stamp };
      const btn = f.querySelector('button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const okay = await safe(async () => { await db.uploadBlob(row, d.file); await db.insert('deliveries', row); return true; }, 'The delivery was NOT saved. Check your internet and try again.');
      if (!okay) { if (btn) { btn.disabled = false; btn.textContent = 'Save delivery'; } return; }
      closeSheet(); S.tab = 'bols';
      toast('Delivery saved. The partners are being told.'); ping('delivery_new', { delivery_id: id }); await refresh(); setTimeout(refresh, 2500);
    } else {
      const base = { bol_number: bol, day: d.day, ...g, notes: d.notes.trim(), updated_by: S.me, updated_at: stamp };
      closeSheet(); Object.assign(old, base); renderMain();
      await safe(() => db.update('deliveries', old.id, base), 'The changes were NOT saved.');
      toast('Delivery changed.'); refresh();
    }
  } else if (f.id === 'staffForm') {
    const name = f.elements.name.value.trim(), email = f.elements.email.value.trim().toLowerCase();
    if (!name || !email) return;
    if (S.members.some(m => m.email === email)) { toast('That email is already a partner.'); return; }
    if (S.staff.some(s => s.email === email)) { toast('That email is already on the staff list.'); return; }
    const row = { id: uid(), email, name, active: true, added_by: S.me, created_at: nowIso() };
    const okay = await safe(async () => { await db.insert('staff', row); return true; }, 'Could not add them.');
    if (okay) { S.staff.push(row); renderMain(); toast(name + ' is on the staff list. Now make their password in Supabase.'); }
  } else if (f.id === 'pwForm') {
    await safe(async () => { await db.setPassword(f.elements.pw.value); f.reset(); toast('Password changed.'); }, 'Could not change the password.');
  }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.id === 'fileIn') {
    const taskId = S.sheet.id, picked = [...el.files];
    for (const file of picked) {
      toast('Adding ' + file.name + '…');
      const fid = uid();
      const row = { id: fid, task_id: taskId, name: file.name, size: file.size, path: taskId + '/' + fid + '-' + file.name.replace(/[^\w.\-]+/g, '_'), uploaded_by: S.me, created_at: nowIso() };
      await safe(async () => { await db.uploadFile(row, file); S.files.push(row); await addEvent(taskId, 'history', 'added the file ' + file.name + '.'); toast('File added.'); });
    }
    if (S.sheet && S.sheet.id === taskId) renderSheet();
    renderMain();
  } else if (el.id === 'rackDay') {
    S.rackDay = el.value || today(); renderMain();
  } else if (el.closest && el.closest('#invForm') && (el.dataset.li !== undefined || el.id === 'invTerms')) {
    const d = readInvForm();
    if (el.id === 'invTerms' && d.terms !== '__custom') { const inv = S.invoices.find(x => x.id === S.sheet.id); d.due_date = dueFrom(inv.day, d.terms); }
    renderSheet();
  } else if (el.id === 'dlvOrder') {
    const d = readDlvForm(), o = S.orders.find(x => x.id === el.value);
    d.order_id = o ? o.id : '';
    if (o) { d.day = o.day || d.day; GRADES.forEach(([k]) => { d[k] = Number(o[k]) ? String(Number(o[k])) : ''; }); }
    renderSheet();
  } else if (el.id === 'dlvPhoto') {
    const file = el.files[0]; if (!file) return;
    const d = readDlvForm(); d.file = file; d.fileName = file.name; d.preview = URL.createObjectURL(file);
    renderSheet();
  } else if (el.id === 'storeFileIn') {
    const d = readStoreForm(), picked = [...el.files]; let kind = d.kind || 'site';
    if (kind === '__custom') { kind = d.customKind; if (!kind) { el.value = ''; toast('Type a name for it first, then tap Add.'); return; } }
    for (const file of picked) d.newFiles.push({ id: uid(), kind, name: file.name, size: file.size, file, preview: isImage(file.name) ? URL.createObjectURL(file) : '' });
    renderSheet(); toast('Added. Tap Save store to keep it.');
  } else if (el.id === 'sfKind' || el.dataset.x === 'pick' || el.dataset.pp || el.dataset.p === 'pricing_method' || el.dataset.p === 'freight_method') {
    readStoreForm(); renderSheet();
    if (el.id === 'sfKind' && el.value === '__custom') { const c = $('#sfCustom'); if (c) c.focus(); }
  } else if (el.dataset.field && S.sheet && S.sheet.type === 'task') {
    const t = taskById(S.sheet.id), k = el.dataset.field; let v = el.value.trim();
    if (k === 'title') { if (!v) { el.value = t.title; return; } if (v !== t.title) patchTask(t.id, { title: v }, 'renamed this task.', true); }
    else if (k === 'details') { if (v !== (t.details || '')) patchTask(t.id, { details: v }, 'changed the details.', true); }
    else if (k === 'due') { v = v || null; if (v !== (t.due || null)) patchTask(t.id, { due: v }, v ? 'set the due date to ' + niceDate(v) + '.' : 'removed the due date.', true); }
  }
});

document.addEventListener('input', e => {
  if (e.target.dataset.dgal !== undefined) { const f = $('#dlvForm'), t = $('#dlvTotal'); if (f && t) t.textContent = galText(GRADES.reduce((s, [k]) => s + gal(f.elements[k].value), 0)); }
  if (e.target.dataset.gal !== undefined) { const f = $('#orderForm'), t = $('#orderTotal'); if (f && t) t.textContent = galText(GRADES.reduce((s, [k]) => s + gal(f.elements[k].value), 0)); }
  else if (e.target.id === 'comment') S.draftComment = e.target.value;
  else if (e.target.id === 'search') { S.search = e.target.value; $('#storeList').innerHTML = storeCards(); }
});

/* ---------- keep the app itself up to date ---------- */
async function checkVersion() {
  if (S.sheet) return; // never reload while someone is typing in a page
  try {
    const r = await fetch('version.json?x=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const v = Number((await r.json()).v);
    if (!(v > Number(window.KE_VERSION || 0))) return;
    let tried = null; try { tried = sessionStorage.getItem('keo_tried'); } catch (e) { /* ignore */ }
    if (tried === String(v)) return;
    try { sessionStorage.setItem('keo_tried', String(v)); } catch (e) { /* ignore */ }
    location.replace(location.pathname + '?v=' + v);
  } catch (e) { /* offline: try again next time */ }
}

/* ---------- start ---------- */
async function start() {
  S.me = await db.session();
  S.role = null;
  if (DEMO) { const d = await db.loadAll(); S.members = d.members; S.staff = d.staff || []; }
  if (!S.me) { renderLogin(); return; }
  await refresh();
  S.role = roleOf(S.me);
  if (!S.role) {
    const who = S.me; await db.signOut(); S.me = null;
    renderLogin(who + ' is not on the King Energy list.'); return;
  }
  if (S.role === 'staff') { renderMain(); return; } // staff get no phone alerts and no bell
  // Show the app first. The alert check can hang on a home-screen app, so it must never hold up the screen.
  renderMain();
  checkAlerts().then(() => { if (alertsOn && !S.sheet) renderMain(); });
}

(async () => {
  checkVersion(); // first, so a stuck start can still pick up a fixed version
  setTimeout(() => {
    if ($('#app .loading')) $('#app').innerHTML = '<p class="loading">This is taking too long.</p><p style="text-align:center"><button class="btn go" data-act="reload">Try again</button></p>';
  }, 12000);
  try { await db.init(); await start(); }
  catch (e) { console.error(e); $('#app').innerHTML = '<p class="loading">Could not start. Check your internet.</p><p style="text-align:center"><button class="btn go" data-act="reload">Try again</button></p>'; }
  let lastWake = 0;
  const wake = () => { if (document.hidden || Date.now() - lastWake < 3000) return; lastWake = Date.now(); checkVersion(); if (S.me) refresh(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);
  setInterval(() => { if (!document.hidden && S.me && !['INPUT', 'TEXTAREA'].includes((document.activeElement || {}).tagName)) refresh(); }, 60000);
})();
})();
