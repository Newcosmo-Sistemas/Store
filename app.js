// TechPOS SaaS · Frontend (panel tipo dashboard)
const API_URL = 'https://script.google.com/macros/s/AKfycbw_kXHHeCS8N19VgFR047koM-fS91uToLau6v1njg5xFDUn2JT6-a8R3DLHOwlzV1VjGg/exec';
const IGV_RATE = 0.18, LOW_STOCK = 3;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const money = n => 'S/ ' + Number(n || 0).toFixed(2);
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico = n => `<svg class="ico"><use href="#i-${n}"/></svg>`;

/* ---------- Fechas (siempre en hora local del navegador) ---------- */
const parseD = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
const dayKey = v => { const d = parseD(v); return d ? d.toLocaleDateString('sv-SE') : ''; };   // AAAA-MM-DD local
const fmtDate = v => { const d = parseD(v); return d ? d.toLocaleDateString('es-PE') : '—'; };
const fmtDT = v => { const d = parseD(v); return d ? d.toLocaleString('es-PE') : (v ? String(v) : '—'); };
const daysLeft = v => { const d = parseD(v); return d ? Math.ceil((d - Date.now()) / 864e5) : null; };
const daysText = v => { const n = daysLeft(v); return n === null ? '' : n < 0 ? `hace ${-n} d` : n === 0 ? 'hoy' : `en ${n} d`; };

const state = {productos: [], ventas: [], cart: [], cat: 'Todas', q: '', token: '', user: null, view: '', loaded: false,
  businesses: [], adminUsers: [], teamUsers: [], tenantReports: null, auditLogs: [], userFilter: '', userScope: 'admin', paying: false};

/* ---------- Utilidades de UI ---------- */
let toastTimer;
function toast(msg, ok = true) {
  const t = $('#toast'); t.textContent = msg; t.style.background = ok ? '#047857' : '#b91c1c';
  t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3800);
}
const FATAL = /sesión vencida|negocio suspendido|licencia vencida/i;
const api = {
  async post(body) {
    let r;
    try {
      r = await fetch(API_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({...body, token: body.token ?? state.token})});
    } catch (e) { throw new Error('Sin conexión con el servidor. Revisa tu internet.'); }
    let d;
    try { d = await r.json(); } catch (e) { throw new Error('Respuesta inválida del servidor.'); }
    if (!d.ok) { const err = new Error(d.error || 'Error del servidor'); err.fatal = body.action !== 'login' && FATAL.test(err.message); throw err; }
    return d;
  },
  load() { return this.post({action: 'all'}); }
};
function fail(e) { toast(e.message, false); if (e.fatal) logout(true); }
const submitBtn = e => e.submitter || e.target.querySelector('button:not([type=button])');
async function busy(btn, fn) { if (!btn || btn.disabled) return; btn.disabled = true; try { return await fn(); } finally { btn.disabled = false; } }
const kpi = (label, value, sub = '', tone = '') => `<div class="card kpi ${tone}"><span class="k-label">${esc(label)}</span><span class="k-value">${value}</span><span class="k-sub">${esc(sub)}</span></div>`;
const roleLabel = r => ({SUPERADMIN: 'Superadmin', BUSINESS_ADMIN: 'Administrador', CAJERO: 'Cajero', VENDEDOR: 'Vendedor', BUSINESS_USER: 'Vendedor', ALMACEN: 'Almacén'})[r] || r || '—';
const PLAN_ALIAS = {PRUEBA: 'PRUEBA', MENSUAL: 'MENSUAL', TRIMESTRAL: 'TRIMESTRAL', ANUAL: 'ANUAL', 'Básico': 'MENSUAL', Profesional: 'TRIMESTRAL', Premium: 'ANUAL'};
const planKey = p => PLAN_ALIAS[p] || 'PRUEBA';
const planLabel = p => ({PRUEBA: 'Prueba · 7 días', MENSUAL: 'Mensual · 30 días', TRIMESTRAL: 'Trimestral · 90 días', ANUAL: 'Anual · 365 días'})[planKey(p)];
const planShort = p => ({PRUEBA: 'Prueba', MENSUAL: 'Mensual', TRIMESTRAL: 'Trimestral', ANUAL: 'Anual'})[planKey(p)];
function genPass(len = 14) {
  const cs = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(len); crypto.getRandomValues(a);
  return [...a].map(n => cs[n % cs.length]).join('');
}
function setMode(dlg, mode) { dlg.querySelectorAll('[data-only]').forEach(el => el.classList.toggle('hidden', el.dataset.only !== mode)); }
function showSecret(title, user, pass, extra = '') {
  $('#secretTitle').textContent = title; $('#secretUser').textContent = user; $('#secretPass').textContent = pass; $('#secretExtra').textContent = extra;
  $('#secretDlg').showModal();
}

/* Gráficos ligeros */
function vbars(el, items, fmt = v => v) {
  const max = Math.max(...items.map(i => i.value), 0);
  el.innerHTML = items.map(i => {
    const h = max ? Math.max(Math.round(i.value / max * 100), 4) : 0;
    return `<div class="vbar" title="${esc(i.label)}: ${esc(fmt(i.value))}"><span class="v">${i.value ? esc(fmt(i.value)) : ''}</span><div class="area"><div class="col ${i.value ? '' : 'zero'}" style="height:${i.value ? h : 2}%"></div></div><span class="l">${esc(i.label)}</span></div>`;
  }).join('');
}
function hbars(el, items, fmt = v => v) {
  const max = Math.max(...items.map(i => i.value), 1);
  el.innerHTML = items.map(i => `<div class="hbar"><div class="row"><span>${esc(i.label)}</span><b>${esc(fmt(i.value))}</b></div><div class="track"><i style="width:${Math.round(i.value / max * 100)}%"></i></div></div>`).join('') || '<p class="empty">Sin datos todavía.</p>';
}

/* ---------- Navegación ---------- */
const NAV = {
  SUPERADMIN: [['adash', 'Panel general', 'home'], ['businesses', 'Negocios', 'building'], ['users', 'Usuarios', 'users'], ['systemReport', 'Reportes y auditoría', 'shield']],
  BUSINESS_ADMIN: [['dash', 'Resumen', 'home'], ['pos', 'Punto de venta', 'cart'], ['inv', 'Inventario', 'box'], ['reports', 'Reportes', 'file'], ['team', 'Mi equipo', 'users']],
  CAJERO: [['pos', 'Punto de venta', 'cart']], VENDEDOR: [['pos', 'Punto de venta', 'cart']], BUSINESS_USER: [['pos', 'Punto de venta', 'cart']],
  ALMACEN: [['inv', 'Inventario', 'box']]
};
const TITLES = {
  adash: ['Panel general', 'Licencias, negocios y actividad del sistema'], businesses: ['Negocios', 'Altas, licencias y suspensiones'],
  users: ['Usuarios', 'Edita usuarios y restablece claves de cualquier negocio'], systemReport: ['Reportes y auditoría', 'Quién hizo qué y cuándo'],
  dash: ['Resumen', 'Cómo va tu negocio'], pos: ['Punto de venta', 'Busca o escanea productos y cobra'], inv: ['Inventario', 'Productos, precios y stock'],
  reports: ['Reportes', 'Ventas, kardex e inventario valorizado'], team: ['Mi equipo', 'Empleados y permisos de tu negocio']
};
const DATA_VIEWS = ['dash', 'pos', 'inv'];
const LOADERS = {
  adash: () => loadAdminDash(), businesses: () => loadBusinesses(), users: () => loadAdminUsers(), systemReport: () => loadSystemReport(),
  reports: () => loadTenantReports(), team: () => loadTeam(), dash: () => ensureData(), pos: () => ensureData(), inv: () => ensureData()
};
function ensureData() { return state.loaded ? renderAll() : refresh(); }

function showApp() {
  $('#loginScreen').classList.add('hidden'); $('#appScreen').classList.remove('hidden');
  const role = state.user.role, items = NAV[role] || NAV.VENDEDOR;
  $('#nav').innerHTML = items.map(([v, l, i]) => `<button class="nav-item" data-view="${v}">${ico(i)}<span>${l}</span></button>`).join('');
  $('#userName').textContent = state.user.name || state.user.username;
  $('#userMeta').textContent = role === 'SUPERADMIN' ? 'Superadministrador' : (state.user.businessName ? state.user.businessName + ' · ' : '') + roleLabel(role);
  state.loaded = false; showView(items[0][0]);
}
function showView(v) {
  if (!state.user) return;
  if (!(NAV[state.user.role] || NAV.VENDEDOR).some(x => x[0] === v)) return toast('Tu cargo no tiene acceso a esta sección.', false);
  state.view = v;
  $$('.view').forEach(x => x.classList.add('hidden')); $('#view-' + v).classList.remove('hidden');
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  $('#pageTitle').textContent = TITLES[v][0]; $('#pageSub').textContent = TITLES[v][1];
  closeSidebar(); LOADERS[v]();
  if (v === 'pos') setTimeout(() => $('#search').focus(), 0);
}
const closeSidebar = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); };
$('#btnMenu').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); };
$('#scrim').onclick = closeSidebar;
$('#nav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); };
$('#btnRefresh').onclick = () => DATA_VIEWS.includes(state.view) ? refresh() : LOADERS[state.view]();
$('#btnTheme').onclick = () => { const d = document.documentElement.classList.toggle('dark'); try { localStorage.setItem('tp_theme', d ? 'dark' : 'light'); } catch (e) {} };
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close();
  const g = e.target.closest('[data-gen]'); if (g) { const f = $('#' + g.dataset.gen); f.elements.password.value = genPass(); f.elements.password.type = 'text'; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { const txt = $('#' + cp.dataset.copy).textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copiado'), () => toast('No se pudo copiar; selecciónalo manualmente.', false)); }
});

/* ---------- Sesión ---------- */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Ingresando…';
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const d = await api.post({action: 'login', ...f, token: ''});
    state.token = d.token; state.user = d.user;
    sessionStorage.setItem('tp_token', d.token); sessionStorage.setItem('tp_user', JSON.stringify(d.user));
    e.target.reset(); showApp();
  } catch (err) { $('#loginError').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
});
async function logout(silent) {
  if (!silent) { try { await api.post({action: 'logout'}); } catch (e) {} }
  state.token = ''; state.user = null; state.loaded = false; state.cart = []; sessionStorage.clear();
  $('#appScreen').classList.add('hidden'); $('#loginScreen').classList.remove('hidden');
}
$('#btnLogout').onclick = () => logout(false);
$('#togglePass').onclick = () => { const i = $('#loginPass'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#togglePass').textContent = show ? 'Ocultar' : 'Ver'; };

/* ======================================================================
   NEGOCIO: datos, POS, inventario
   ====================================================================== */
async function refresh() {
  try { const d = await api.load(); state.productos = d.productos || []; state.ventas = d.ventas || []; state.loaded = true; renderAll(); }
  catch (e) { fail(e); }
}
function renderAll() { renderCats(); renderGrid(); renderCart(); renderInventory(); renderRestock(); renderDashboard(); }

function renderCats() {
  const cats = ['Todas', ...new Set(state.productos.map(p => p.Categoria).filter(Boolean))];
  $('#cats').innerHTML = cats.map(c => `<button data-cat="${esc(c)}" class="pchip ${c === state.cat ? 'active' : ''}">${esc(c)}</button>`).join('');
}
function renderGrid() {
  const q = state.q.toLowerCase();
  const list = state.productos.filter(p => (state.cat === 'Todas' || p.Categoria === state.cat) && (!q || String(p.Nombre).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q)));
  $('#grid').innerHTML = list.map(p => {
    const st = Number(p.Stock) || 0;
    return `<button class="prod" data-sku="${esc(p.SKU)}" ${st <= 0 ? 'disabled' : ''}><span class="muted text-xs">${esc(p.SKU)}${p.Marca ? ' · ' + esc(p.Marca) : ''}</span><span class="font-medium">${esc(p.Nombre)}</span><span class="flex justify-between items-center mt-1"><b style="color:var(--brand)">${money(p.Precio_Venta)}</b><span class="badge ${st <= LOW_STOCK ? 'b-bad' : 'b-ok'}">${st <= 0 ? 'Agotado' : 'Stock ' + st}</span></span></button>`;
  }).join('') || '<p class="empty" style="grid-column:1/-1">Sin resultados</p>';
}
const stockOf = sku => Number(state.productos.find(p => String(p.SKU) === String(sku))?.Stock || 0);
function addToCart(sku) {
  const p = state.productos.find(x => String(x.SKU) === String(sku)); if (!p) return;
  const line = state.cart.find(l => l.sku === String(sku)), n = (line?.cant || 0) + 1;
  if (n > Number(p.Stock)) return toast('Stock insuficiente', false);
  if (line) line.cant = n; else state.cart.push({sku: String(p.SKU), nombre: p.Nombre, precio: Number(p.Precio_Venta), cant: 1});
  renderCart();
}
function changeQty(sku, delta) {
  const l = state.cart.find(x => x.sku === sku); if (!l) return;
  const n = l.cant + delta;
  if (n > stockOf(sku)) return toast('Stock insuficiente', false);
  if (n <= 0) state.cart = state.cart.filter(x => x !== l); else l.cant = n;
  renderCart();
}
function totals() {
  const subtotal = round2(state.cart.reduce((s, l) => s + l.precio * l.cant, 0)), igv = round2(subtotal * IGV_RATE);
  return {subtotal, igv, total: round2(subtotal + igv)};
}
function renderCart() {
  $('#cart').innerHTML = state.cart.map(l => `<div class="cart-line"><div class="flex-1 min-w-0"><div class="font-medium truncate">${esc(l.nombre)}</div><div class="muted text-xs">${money(l.precio)} × ${l.cant} = ${money(l.precio * l.cant)}</div></div><button class="qty" data-q="-1" data-sku="${esc(l.sku)}" aria-label="Quitar uno">−</button><b>${l.cant}</b><button class="qty" data-q="1" data-sku="${esc(l.sku)}" aria-label="Agregar uno">+</button></div>`).join('') || '<p class="empty">El carrito está vacío</p>';
  const t = totals(); $('#tSub').textContent = money(t.subtotal); $('#tIgv').textContent = money(t.igv); $('#tTot').textContent = money(t.total);
  $('#btnPay').disabled = !state.cart.length;
}
function renderInventory() {
  const q = ($('#invSearch').value || '').trim().toLowerCase();
  const list = state.productos.filter(p => !q || String(p.Nombre).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q));
  $('#invBody').innerHTML = list.map(p => `<tr><td>${esc(p.SKU)}</td><td>${esc(p.Nombre)}<div class="hint">${esc(p.Marca || '')}</div></td><td>${esc(p.Categoria)}</td><td class="num">${money(p.Precio_Venta)}</td><td class="num"><span class="badge ${Number(p.Stock) <= LOW_STOCK ? 'b-bad' : 'b-ok'}">${esc(p.Stock)}</span></td><td><div class="actions"><button class="link" data-edit="${esc(p.SKU)}">Editar</button><button class="link bad" data-del="${esc(p.SKU)}">Borrar</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No hay productos para mostrar.</td></tr>';
}
function renderRestock() { $('#restockSku').innerHTML = state.productos.map(p => `<option value="${esc(p.SKU)}">${esc(p.SKU)} – ${esc(p.Nombre)}</option>`).join(''); }

function parseItems(v) { try { return JSON.parse(v.Productos_JSON) || []; } catch (e) { return []; } }
function renderDashboard() {
  const V = state.ventas || [], today = dayKey(new Date()), month = today.slice(0, 7);
  const sum = a => a.reduce((s, v) => s + Number(v.Total || 0), 0);
  const hoy = V.filter(v => dayKey(v.Fecha) === today), mes = V.filter(v => dayKey(v.Fecha).startsWith(month));
  const low = state.productos.filter(p => Number(p.Stock) <= LOW_STOCK).sort((a, b) => Number(a.Stock) - Number(b.Stock));
  $('#kpis').innerHTML = kpi('Ventas de hoy', money(sum(hoy)), hoy.length + ' operaciones') + kpi('Ingresos del mes', money(sum(mes)), mes.length + ' ventas')
    + kpi('Ticket promedio', money(mes.length ? sum(mes) / mes.length : 0), 'Este mes') + kpi('Stock bajo', low.length, low.length ? 'Productos por reponer' : 'Todo en orden', low.length ? 'warn' : 'ok');
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d); days.push({label: d.toLocaleDateString('es-PE', {weekday: 'short', day: 'numeric'}), value: round2(sum(V.filter(v => dayKey(v.Fecha) === k)))}); }
  vbars($('#salesChart'), days, v => 'S/ ' + Math.round(v));
  const count = {}; V.forEach(v => parseItems(v).forEach(i => count[i.nombre] = (count[i.nombre] || 0) + Number(i.cant)));
  hbars($('#topProducts'), Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({label, value})), v => v + ' uds.');
  $('#salesBody').innerHTML = V.slice(-10).reverse().map(v => `<tr><td>${esc(v.ID_Venta)}</td><td>${esc(fmtDT(v.Fecha))}</td><td>${esc(v.Cliente_Nombre)}</td><td>${esc(v.Metodo_Pago)}</td><td class="num">${money(v.Total)}</td><td><button class="link" data-reprint="${esc(v.ID_Venta)}">Reimprimir</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aún no hay ventas registradas.</td></tr>';
  $('#lowStock').innerHTML = low.slice(0, 8).map(p => `<div class="flex justify-between gap-2 py-1 text-sm"><span class="truncate">${esc(p.Nombre)}</span><span class="badge b-bad">${esc(p.Stock)}</span></div>`).join('') || '<p class="empty">Sin alertas de stock.</p>';
}

/* Ticket: se imprime desde un iframe oculto (no lo bloquean los bloqueadores de ventanas emergentes). */
function printTicket(v) {
  if (!v) return;
  const rows = parseItems(v).map(i => `<tr><td>${esc(i.cant)} x ${esc(i.nombre)}</td><td style="text-align:right">${money(i.cant * i.precio)}</td></tr>`).join('');
  const html = `<html><head><title>${esc(v.ID_Venta)}</title><style>@page{size:80mm auto;margin:3mm}body{font-family:monospace;font-size:12px;width:72mm}table{width:100%}h3,p{text-align:center;margin:.3em 0}</style></head><body><h3>${esc(state.user?.businessName || 'TechPOS')}</h3><p>${esc(v.ID_Venta)}</p><p>${esc(fmtDT(v.Fecha))}</p><hr><p>Cliente: ${esc(v.Cliente_Nombre)}</p><table>${rows}</table><hr><p>Subtotal: ${money(v.Subtotal)}</p><p>IGV: ${money(v.IGV_Impuesto)}</p><p><b>TOTAL: ${money(v.Total)}</b></p><p>Pago: ${esc(v.Metodo_Pago)}</p></body></html>`;
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  const d = f.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250);
}

$('#search').addEventListener('input', e => { state.q = e.target.value; renderGrid(); });
$('#search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const p = state.productos.find(x => String(x.SKU).toLowerCase() === e.target.value.trim().toLowerCase());
  if (p) { addToCart(p.SKU); e.target.value = ''; state.q = ''; renderGrid(); }
});
$('#invSearch').addEventListener('input', renderInventory);
$('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { state.cat = b.dataset.cat; renderCats(); renderGrid(); } };
$('#grid').onclick = e => { const b = e.target.closest('[data-sku]'); if (b) addToCart(b.dataset.sku); };
$('#cart').onclick = e => { const b = e.target.closest('[data-q]'); if (b) changeQty(b.dataset.sku, Number(b.dataset.q)); };
$('#btnClear').onclick = () => { state.cart = []; renderCart(); };
$('#btnPay').onclick = () => { $('#payTotal').textContent = money(totals().total); $('#payDlg').showModal(); };
$('#payForm').onsubmit = async e => {
  e.preventDefault(); if (state.paying) return;           // evita ventas duplicadas por doble clic
  state.paying = true; const btn = $('#btnConfirm'); btn.disabled = true;
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const d = await api.post({action: 'venta', ...f, items: state.cart.map(l => ({sku: l.sku, cant: l.cant}))});
    state.cart = []; e.target.reset(); $('#payDlg').close(); renderCart(); toast('Venta registrada'); printTicket(d.venta); await refresh();
  } catch (err) { fail(err); }
  finally { state.paying = false; btn.disabled = false; }
};
$('#prodForm').addEventListener('reset', () => setTimeout(() => { $('#prodTitle').textContent = 'Nuevo producto'; $('#prodForm').elements.SKU.readOnly = false; }, 0));
$('#prodForm').onsubmit = async e => {
  e.preventDefault();
  await busy(submitBtn(e), async () => {
    try { await api.post({action: 'guardarProducto', producto: Object.fromEntries(new FormData(e.target))}); e.target.reset(); toast('Producto guardado'); await refresh(); }
    catch (err) { fail(err); }
  });
};
$('#invBody').onclick = async e => {
  const ed = e.target.closest('[data-edit]')?.dataset.edit, del = e.target.closest('[data-del]')?.dataset.del;
  if (ed) {
    const p = state.productos.find(x => String(x.SKU) === ed), f = $('#prodForm');
    if (p.Categoria && ![...f.elements.Categoria.options].some(o => o.value === p.Categoria)) f.elements.Categoria.add(new Option(p.Categoria, p.Categoria));
    Object.keys(p).forEach(k => { if (f.elements[k]) f.elements[k].value = p[k]; });
    f.elements.SKU.readOnly = true; $('#prodTitle').textContent = 'Editar producto'; f.scrollIntoView({behavior: 'smooth', block: 'center'});
  }
  if (del && confirm('¿Eliminar el producto ' + del + '? Esta acción no se puede deshacer.')) {
    try { await api.post({action: 'eliminarProducto', sku: del}); toast('Producto eliminado'); await refresh(); } catch (err) { fail(err); }
  }
};
$('#restockForm').onsubmit = async e => {
  e.preventDefault();
  await busy(submitBtn(e), async () => {
    try { await api.post({action: 'reabastecer', ...Object.fromEntries(new FormData(e.target))}); e.target.reset(); toast('Stock actualizado'); await refresh(); }
    catch (err) { fail(err); }
  });
};
$('#salesBody').onclick = e => { const id = e.target.closest('[data-reprint]')?.dataset.reprint; if (id) printTicket(state.ventas.find(v => v.ID_Venta === id)); };

/* ======================================================================
   NEGOCIO: equipo (administrador del negocio)
   ====================================================================== */
async function loadTeam() {
  if (state.user.role !== 'BUSINESS_ADMIN') return;
  try { const d = await api.post({action: 'tenant_users'}); state.teamUsers = d.users || []; renderTeam(); } catch (e) { fail(e); }
}
function renderTeam() {
  $('#teamUsersBody').innerHTML = state.teamUsers.map(u => `<tr><td><b>${esc(u.Username)}</b><div class="hint">${esc(u.Nombre || '')}</div></td><td>${esc(roleLabel(u.Role))}</td><td><span class="badge ${u.Estado === 'ACTIVO' ? 'b-ok' : 'b-bad'}">${u.Estado === 'ACTIVO' ? 'Activo' : 'Desactivado'}</span></td><td>${u.Role === 'BUSINESS_ADMIN' ? '<span class="hint">Lo gestiona el superadministrador</span>' : `<div class="actions"><button class="link" data-act="team-edit" data-id="${esc(u.ID)}">Editar</button><button class="link warn" data-act="team-pwd" data-id="${esc(u.ID)}">Nueva clave</button></div>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aún no hay empleados creados.</td></tr>';
}
$('#teamReload').onclick = loadTeam;
$('#teamUserForm').onsubmit = async e => {
  e.preventDefault();
  await busy(submitBtn(e), async () => {
    try { await api.post({action: 'tenant_createUser', ...Object.fromEntries(new FormData(e.target))}); e.target.reset(); toast('Empleado creado correctamente'); await loadTeam(); }
    catch (err) { fail(err); }
  });
};

/* ======================================================================
   NEGOCIO: reportes
   ====================================================================== */
async function loadTenantReports() {
  try {
    const d = await api.post({action: 'tenant_reports', desde: $('#repFrom').value, hasta: $('#repTo').value, sku: $('#repSku').value});
    const r = d.reports || {}; state.tenantReports = r; const s = r.resumen || {};
    $('#tenantReportKpis').innerHTML = kpi('Ventas del periodo', money(s.totalVentas), (s.cantidadVentas || 0) + ' operaciones') + kpi('Inventario a costo', money(s.valorCosto), (s.productos || 0) + ' productos')
      + kpi('Inventario a venta', money(s.valorVenta), (s.unidadesStock || 0) + ' unidades en stock');
    $('#tenantSalesBody').innerHTML = (r.ventas || []).slice().reverse().map(v => `<tr><td>${esc(fmtDT(v.Fecha))}</td><td>${esc(v.ID_Venta)}</td><td>${esc(v.Cliente_Nombre)}</td><td>${esc(v.Metodo_Pago)}</td><td class="num">${money(v.Subtotal)}</td><td class="num">${money(v.IGV_Impuesto)}</td><td class="num"><b>${money(v.Total)}</b></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No hay ventas en este periodo.</td></tr>';
    const prods = state.productos || [];
    $('#tenantKardexBody').innerHTML = (r.kardex || []).slice().reverse().map(m => {
      const p = prods.find(x => String(x.SKU) === String(m.SKU)), inc = /ENTRADA|INICIAL/.test(m.Tipo);
      return `<tr><td>${esc(fmtDT(m.Fecha))}</td><td>${esc(m.SKU)}</td><td>${esc(p?.Nombre || '—')}</td><td>${esc(m.Tipo)}</td><td class="num" style="color:var(${inc ? '--ok' : '--bad'})">${inc ? '+' : '−'}${Number(m.Cantidad || 0)}</td><td class="num">${Number(m.Saldo_Despues || 0)}</td><td>${esc(m.Usuario || '')}</td><td>${esc(m.Referencia || '')}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">No hay movimientos para este filtro.</td></tr>';
    $('#kardexNotice').textContent = 'El Kardex contiene los movimientos guardados desde la activación del registro de inventario; los anteriores no pueden reconstruirse.';
    $('#tenantValuedBody').innerHTML = (r.inventario || []).map(p => `<tr><td>${esc(p.SKU)}</td><td>${esc(p.Nombre)}</td><td class="num">${Number(p.Stock || 0)}</td><td class="num">${money(p.Precio_Costo)}</td><td class="num">${money(p.Valor_Costo)}</td><td class="num">${money(p.Precio_Venta)}</td><td class="num"><b>${money(p.Valor_Venta)}</b></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No hay productos registrados.</td></tr>';
  } catch (e) { fail(e); }
}
$('#repApply').onclick = loadTenantReports;
$('#exportSales').onclick = () => exportRowsCsv('TechPOS_reporte_ventas.csv', state.tenantReports?.ventas || []);
$('#exportKardex').onclick = () => exportRowsCsv('TechPOS_kardex.csv', state.tenantReports?.kardex || []);
$('#exportValued').onclick = () => exportRowsCsv('TechPOS_inventario_valorizado.csv', state.tenantReports?.inventario || []);
function exportRowsCsv(filename, rows, cols) {
  if (!rows.length) return toast('No hay datos para exportar', false);
  cols = cols || Object.keys(rows[0]); const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '\ufeff' + [cols.join(';'), ...rows.map(r => cols.map(k => q(r[k])).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ======================================================================
   SUPERADMIN: panel general
   ====================================================================== */
const ACTION_LABEL = {login: 'Inicio de sesión', logout: 'Cierre de sesión', venta: 'Venta', guardarProducto: 'Producto guardado', eliminarProducto: 'Producto eliminado',
  reabastecer: 'Reabastecimiento', tenant_createUser: 'Empleado creado', tenant_updateUser: 'Empleado editado', admin_createBusiness: 'Negocio creado',
  admin_updateBusiness: 'Negocio editado', admin_updateLicense: 'Licencia renovada', admin_suspend: 'Estado de negocio cambiado', admin_createUser: 'Usuario creado',
  admin_updateUser: 'Usuario editado', admin_resetPassword: 'Clave restablecida', admin_deleteUser: 'Usuario eliminado'};
const actionLabel = a => ACTION_LABEL[a] || a || '—';
function detailObj(raw) { try { return JSON.parse(raw || '{}') || {}; } catch (e) { return {}; } }
const detailText = raw => { const o = detailObj(raw), t = Object.entries(o).map(([k, v]) => k + ': ' + v).join(' · '); return t || '—'; };

async function loadAdminDash() {
  try {
    const d = (await api.post({action: 'admin_dashboard'})).dashboard; state.adminDashLic = d.licencias || [];
    $('#aKpis').innerHTML = kpi('Negocios activos', d.activos, 'de ' + d.negocios + ' registrados', 'ok')
      + kpi('Por vencer', d.porVencer, 'En los próximos 15 días', d.porVencer ? 'warn' : '')
      + kpi('Vencidos', d.vencidos, d.suspendidos + ' suspendidos', d.vencidos ? 'bad' : '')
      + kpi('Usuarios activos', d.usuariosActivos, 'de ' + d.usuarios + ' en total');
    vbars($('#aLogins'), (d.logins || []).map(x => ({label: new Date(x.dia + 'T12:00:00').toLocaleDateString('es-PE', {weekday: 'short', day: 'numeric'}), value: x.total})));
    hbars($('#aPlans'), ['PRUEBA', 'MENSUAL', 'TRIMESTRAL', 'ANUAL'].map(k => ({label: planShort(k), value: Number((d.planes || {})[k] || 0)})));
    $('#aExpiring').innerHTML = (d.licencias || []).map(b => { const s = bizStatus(b); return `<tr><td><b>${esc(b.Nombre)}</b></td><td>${esc(planShort(b.Plan))}</td><td>${esc(fmtDate(b.Vencimiento))} <span class="hint">${esc(daysText(b.Vencimiento))}</span></td><td><span class="badge b-${s.tone}">${s.label}</span></td><td><button class="link" data-act="renew" data-id="${esc(b.ID)}">Renovar</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Ninguna licencia vence pronto.</td></tr>';
    $('#aFeed').innerHTML = (d.actividad || []).map(x => { const err = x.Estado === 'ERROR'; return `<li><span class="dot ${err ? 'err' : ''}"></span><div><b>${esc(actionLabel(x.Accion))}</b> · ${esc(x.Usuario || '—')}<small>${esc(fmtDT(x.Fecha))}${err ? ' · ' + esc(detailObj(x.Detalle).error || 'Error') : ''}</small></div></li>`; }).join('') || '<li class="empty">Sin actividad registrada.</li>';
  } catch (e) { fail(e); }
}

/* ======================================================================
   SUPERADMIN: negocios
   ====================================================================== */
function bizStatus(b) {
  const n = daysLeft(b.Vencimiento);
  if (String(b.Estado) === 'SUSPENDIDO') return {key: 'SUSPENDIDO', label: 'Suspendido', tone: 'bad', soon: false};
  if (n !== null && n < 0) return {key: 'VENCIDO', label: 'Vencido', tone: 'bad', soon: false};
  if (n !== null && n <= 7) return {key: 'ACTIVO', label: 'Por vencer', tone: 'warn', soon: true};
  return {key: 'ACTIVO', label: 'Activo', tone: 'ok', soon: false};
}
async function loadBusinesses() {
  try { state.businesses = (await api.post({action: 'admin_businesses'})).businesses || []; renderBusinesses(); } catch (e) { fail(e); }
}
function renderBusinesses() {
  const q = $('#bizSearch').value.trim().toLowerCase(), f = $('#bizFilter').value;
  const list = state.businesses.filter(b => { const s = bizStatus(b); return (!q || [b.Nombre, b.RUC, b.Email].some(x => String(x || '').toLowerCase().includes(q))) && (!f || (f === 'POR_VENCER' ? s.soon : s.key === f)); });
  $('#businessBody').innerHTML = list.map(b => {
    const s = bizStatus(b), suspended = String(b.Estado) === 'SUSPENDIDO';
    return `<tr><td><b>${esc(b.Nombre)}</b><div class="hint">${esc([b.RUC, b.Email].filter(Boolean).join(' · '))}</div></td><td><span class="badge b-${s.tone}">${s.label}</span></td><td>${esc(planShort(b.Plan))}</td><td>${esc(fmtDate(b.Vencimiento))} <span class="hint">${esc(daysText(b.Vencimiento))}</span></td><td>${Number(b.UsuariosActivos || 0)} <span class="hint">/ ${Number(b.Usuarios || 0)}</span></td><td><div class="actions"><button class="link" data-act="biz-users" data-id="${esc(b.ID)}">Usuarios</button><button class="link" data-act="edit-biz" data-id="${esc(b.ID)}">Editar</button><button class="link" data-act="renew" data-id="${esc(b.ID)}">Renovar</button><button class="link ${suspended ? '' : 'warn'}" data-act="toggle" data-id="${esc(b.ID)}">${suspended ? 'Activar' : 'Suspender'}</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No hay negocios que coincidan.</td></tr>';
}
$('#bizSearch').addEventListener('input', renderBusinesses); $('#bizFilter').addEventListener('change', renderBusinesses);
$('#btnNewBiz').onclick = () => openBusinessDlg(null);

function openBusinessDlg(b) {
  const f = $('#businessForm'); f.reset(); setMode($('#businessDlg'), b ? 'edit' : 'create');
  $('#businessDlgTitle').textContent = b ? 'Editar negocio' : 'Nuevo negocio y licencia';
  f.elements.username.required = !b; f.elements.password.required = !b; f.elements.businessId.value = b ? b.ID : '';
  if (b) {
    f.elements.nombre.value = b.Nombre || ''; f.elements.ruc.value = b.RUC || ''; f.elements.telefono.value = b.Telefono || ''; f.elements.email.value = b.Email || '';
    f.elements.planEdit.value = planKey(b.Plan); f.elements.vencimiento.value = dayKey(b.Vencimiento);
  }
  $('#businessDlg').showModal();
}
$('#businessForm').onsubmit = async e => {
  e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
  await busy(submitBtn(e), async () => {
    try {
      if (!v.businessId) {
        const d = await api.post({action: 'admin_createBusiness', nombre: v.nombre, ruc: v.ruc, email: v.email, telefono: v.telefono, username: v.username.trim(), password: v.password, plan: v.planCreate});
        $('#businessDlg').close(); showSecret('Negocio creado', v.username.trim(), v.password, 'Base de datos independiente: ' + d.business.databaseUrl);
      } else {
        await api.post({action: 'admin_updateBusiness', businessId: v.businessId, nombre: v.nombre, ruc: v.ruc, email: v.email, telefono: v.telefono, plan: v.planEdit, vencimiento: v.vencimiento});
        $('#businessDlg').close(); toast('Negocio actualizado');
      }
      await loadBusinesses();
    } catch (err) { fail(err); }
  });
};
function openLicenseDlg(b) {
  const f = $('#licenseForm'); f.elements.businessId.value = b.ID; f.elements.plan.value = planKey(b.Plan);
  $('#licenseInfo').textContent = b.Nombre + ' · vence el ' + fmtDate(b.Vencimiento) + ' ' + daysText(b.Vencimiento);
  $('#licenseDlg').showModal();
}
$('#licenseForm').onsubmit = async e => {
  e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
  await busy(submitBtn(e), async () => {
    try { await api.post({action: 'admin_updateLicense', businessId: v.businessId, plan: v.plan}); $('#licenseDlg').close(); toast('Licencia renovada con plan ' + planShort(v.plan)); refreshAdminViews(); }
    catch (err) { fail(err); }
  });
};
const refreshAdminViews = () => { if (state.view === 'adash') loadAdminDash(); else if (state.view === 'businesses') loadBusinesses(); else if (state.view === 'users') loadAdminUsers(); };

/* ======================================================================
   SUPERADMIN: usuarios y claves
   ====================================================================== */
async function loadAdminUsers() {
  try {
    const [u, b] = await Promise.all([api.post({action: 'admin_users'}), api.post({action: 'admin_businesses'})]);
    state.adminUsers = u.users || []; state.businesses = b.businesses || [];
    const sel = $('#userBizFilter'), cur = state.userFilter || sel.value || '';
    sel.innerHTML = '<option value="">Todos los negocios</option>' + state.businesses.map(x => `<option value="${esc(x.ID)}">${esc(x.Nombre)}</option>`).join('');
    sel.value = cur; state.userFilter = ''; renderAdminUsers();
  } catch (e) { fail(e); }
}
function renderAdminUsers() {
  const q = $('#userSearch').value.trim().toLowerCase(), biz = $('#userBizFilter').value;
  const list = state.adminUsers.filter(u => (!biz || String(u.BusinessId) === biz) && (!q || String(u.Username).toLowerCase().includes(q) || String(u.Nombre || '').toLowerCase().includes(q)));
  $('#adminUsersBody').innerHTML = list.map(u => `<tr><td><b>${esc(u.Username)}</b><div class="hint">${esc(u.Nombre || '')}</div></td><td>${esc(u.BusinessNombre)}</td><td>${esc(roleLabel(u.Role))}</td><td><span class="badge ${u.Estado === 'ACTIVO' ? 'b-ok' : 'b-bad'}">${u.Estado === 'ACTIVO' ? 'Activo' : 'Desactivado'}</span></td><td><div class="actions"><button class="link" data-act="edit-user" data-id="${esc(u.ID)}">Editar</button><button class="link warn" data-act="pwd-user" data-id="${esc(u.ID)}">Restablecer clave</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hay usuarios que coincidan.</td></tr>';
}
$('#userSearch').addEventListener('input', renderAdminUsers); $('#userBizFilter').addEventListener('change', renderAdminUsers);
$('#btnNewUser').onclick = () => openUserDlg(null, 'admin');

function openUserDlg(u, scope, resetPass) {
  const f = $('#userForm'), create = !u; f.reset(); state.userScope = scope; setMode($('#userDlg'), create ? 'create' : 'edit');
  const roles = [['CAJERO', 'Cajero'], ['VENDEDOR', 'Vendedor'], ['ALMACEN', 'Almacén']];
  if (scope === 'admin') roles.unshift(['BUSINESS_ADMIN', 'Administrador del negocio']);
  f.elements.role.innerHTML = roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  f.elements.userId.value = u ? u.ID : '';
  if (create) {
    f.elements.businessId.innerHTML = state.businesses.map(b => `<option value="${esc(b.ID)}">${esc(b.Nombre)}</option>`).join('');
    f.elements.businessId.value = $('#userBizFilter').value || (state.businesses[0]?.ID ?? ''); f.elements.role.value = 'VENDEDOR';
  } else {
    f.elements.username.value = u.Username; f.elements.nombre.value = u.Nombre || ''; f.elements.role.value = u.Role; f.elements.estado.value = u.Estado;
  }
  f.elements.username.readOnly = scope !== 'admin' && !create; f.elements.password.required = create; f.elements.password.type = 'text';
  $('#passLabel').textContent = create ? 'Clave inicial' : 'Nueva clave';
  f.elements.password.placeholder = create ? 'Mínimo 10 caracteres' : 'Déjalo vacío para no cambiarla';
  $('#userDlgTitle').textContent = create ? 'Nuevo usuario' : resetPass ? 'Restablecer clave' : 'Editar usuario';
  $('#userDlgBiz').textContent = u ? (u.BusinessNombre || state.user.businessName || '') : '';
  $('#userDelete').classList.toggle('hidden', create || scope !== 'admin');
  if (resetPass) f.elements.password.value = genPass();
  $('#userDlg').showModal(); if (resetPass) f.elements.password.focus();
}
$('#userForm').onsubmit = async e => {
  e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), scope = state.userScope;
  await busy(submitBtn(e), async () => {
    try {
      const username = String(v.username || '').trim();
      if (!v.userId) {
        await api.post({action: 'admin_createUser', businessId: v.businessId, username, nombre: v.nombre, role: v.role, password: v.password});
        $('#userDlg').close(); showSecret('Usuario creado', username, v.password);
      } else {
        const body = {action: scope === 'admin' ? 'admin_updateUser' : 'tenant_updateUser', userId: v.userId, nombre: v.nombre, role: v.role, estado: v.estado};
        if (scope === 'admin') body.username = username;
        if (v.password) body.password = v.password;
        await api.post(body); $('#userDlg').close();
        if (v.password) showSecret('Clave actualizada', username, v.password, 'Las sesiones abiertas de este usuario se cerraron; deberá ingresar con la nueva clave.'); else toast('Usuario actualizado');
      }
      scope === 'admin' ? loadAdminUsers() : loadTeam();
    } catch (err) { fail(err); }
  });
};
$('#userDelete').onclick = async () => {
  const f = $('#userForm'), name = f.elements.username.value;
  if (!confirm(`¿Eliminar definitivamente al usuario "${name}"? Si solo quieres impedir su acceso, desactívalo en su lugar.`)) return;
  try { await api.post({action: 'admin_deleteUser', userId: f.elements.userId.value}); $('#userDlg').close(); toast('Usuario eliminado'); loadAdminUsers(); } catch (err) { fail(err); }
};

/* Acciones de tabla (negocios, usuarios, equipo, licencias por vencer) */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  const biz = state.businesses.find(x => String(x.ID) === id) || (state.adminDashLic || []).find(x => String(x.ID) === id);
  try {
    if (act === 'edit-biz') openBusinessDlg(biz);
    else if (act === 'renew') openLicenseDlg(biz || {ID: id, Nombre: 'Negocio', Plan: 'MENSUAL', Vencimiento: ''});
    else if (act === 'biz-users') { state.userFilter = id; showView('users'); }
    else if (act === 'toggle') {
      const suspend = String(biz.Estado) !== 'SUSPENDIDO';
      if (!confirm(suspend ? `¿Suspender "${biz.Nombre}"? Sus usuarios no podrán ingresar hasta que lo actives.` : `¿Activar "${biz.Nombre}"?`)) return;
      await api.post({action: 'admin_suspend', businessId: id, suspend}); toast(suspend ? 'Negocio suspendido' : 'Negocio activado'); await loadBusinesses();
    }
    else if (act === 'edit-user') openUserDlg(state.adminUsers.find(x => String(x.ID) === id), 'admin');
    else if (act === 'pwd-user') openUserDlg(state.adminUsers.find(x => String(x.ID) === id), 'admin', true);
    else if (act === 'team-edit') openUserDlg(state.teamUsers.find(x => String(x.ID) === id), 'tenant');
    else if (act === 'team-pwd') openUserDlg(state.teamUsers.find(x => String(x.ID) === id), 'tenant', true);
  } catch (err) { fail(err); }
});

/* ======================================================================
   SUPERADMIN: reportes y auditoría
   ====================================================================== */
async function loadSystemReport() {
  try {
    const r = (await api.post({action: 'admin_system_report'})).report || {};
    $('#systemReportKpis').innerHTML = kpi('Tiendas registradas', Number(r.totalNegocios || 0), (r.negociosActivos || 0) + ' activas') + kpi('Licencias vencidas', Number(r.licenciasVencidas || 0), (r.negociosSuspendidos || 0) + ' suspendidas', r.licenciasVencidas ? 'bad' : '')
      + kpi('Usuarios', Number(r.totalUsuarios || 0), (r.usuariosActivos || 0) + ' activos') + kpi('Accesos / errores', (r.accesosRegistrados || 0) + ' / ' + (r.erroresRegistrados || 0), 'Según los últimos eventos', r.erroresRegistrados ? 'warn' : '');
    state.auditLogs = r.auditoria || []; $('#reportGenerated').textContent = 'Últimos 200 eventos · generado ' + fmtDT(r.generado); renderAudit();
  } catch (e) { fail(e); }
}
function renderAudit() {
  const f = $('#auditFilter').value, rows = state.auditLogs.filter(x => !f || x.Estado === f);
  $('#auditBody').innerHTML = rows.map(x => `<tr><td class="whitespace-nowrap">${esc(fmtDT(x.Fecha))}</td><td>${esc(x.Usuario || '—')}</td><td>${esc(roleLabel(x.Rol))}</td><td>${esc(actionLabel(x.Accion))}</td><td><span class="badge ${x.Estado === 'ERROR' ? 'b-bad' : 'b-ok'}">${esc(x.Estado === 'ERROR' ? 'Error' : 'Correcto')}</span></td><td class="max-w-xs truncate" title="${esc(x.Detalle || '')}">${esc(detailText(x.Detalle))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No hay eventos para este filtro.</td></tr>';
}
$('#auditFilter').addEventListener('change', renderAudit);
$('#reportExport').onclick = () => exportRowsCsv('TechPOS_reporte_sistema.csv', state.auditLogs, ['Fecha', 'Usuario', 'Rol', 'BusinessId', 'Accion', 'Estado', 'Detalle']);

/* ---------- Inicio ---------- */
(function init() {
  const today = dayKey(new Date()); $('#repTo').value = today; $('#repFrom').value = today.slice(0, 8) + '01';
  try {
    const t = sessionStorage.getItem('tp_token'), u = sessionStorage.getItem('tp_user');
    if (t && u) { state.token = t; state.user = JSON.parse(u); showApp(); }
  } catch (e) { sessionStorage.clear(); }
})();
