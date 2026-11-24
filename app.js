/* =========================================================
 * TechPOS – Frontend (JavaScript Vanilla)
 * ========================================================= */

// 👉 Pega aquí la URL de tu Web App de Apps Script (termina en /exec)
const API_URL = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';

const IGV_RATE = 0.18;
const LOW_STOCK = 3;
const TIENDA = 'TECH STORE'; // nombre que sale en el ticket

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => 'S/ ' + Number(n || 0).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `fixed bottom-4 right-4 px-4 py-2 rounded shadow text-white z-50 ${ok ? 'bg-emerald-600' : 'bg-red-600'}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------- Capa de API ---------- */
const api = {
  async load() {
    const r = await fetch(`${API_URL}?action=all`);
    return r.json();
  },
  async post(body) {
    // text/plain evita el preflight CORS (Apps Script no responde a OPTIONS)
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error del servidor');
    return d;
  },
};

/* ---------- Estado ---------- */
const state = { productos: [], ventas: [], cart: [], cat: 'Todas', q: '' };

async function refresh() {
  try {
    const d = await api.load();
    if (!d.ok) throw new Error(d.error);
    state.productos = d.productos;
    state.ventas = d.ventas;
    renderAll();
  } catch (e) {
    toast('No se pudo cargar: ' + e.message + ' (revisa API_URL)', false);
  }
}

/* ---------- Carrito ---------- */
const stockOf = sku => Number(state.productos.find(p => String(p.SKU) === String(sku))?.Stock || 0);

function addToCart(sku) {
  const p = state.productos.find(x => String(x.SKU) === String(sku));
  if (!p) return;
  const line = state.cart.find(l => l.sku === String(sku));
  const next = (line?.cant || 0) + 1;
  if (next > Number(p.Stock)) return toast(`Stock insuficiente (${p.Stock} disponibles)`, false);
  if (line) line.cant = next;
  else state.cart.push({ sku: String(p.SKU), nombre: p.Nombre, precio: Number(p.Precio_Venta), cant: 1 });
  renderCart();
}

function changeQty(sku, delta) {
  const l = state.cart.find(x => x.sku === sku);
  if (!l) return;
  const n = l.cant + delta;
  if (n > stockOf(sku)) return toast('No hay más stock disponible', false);
  if (n <= 0) state.cart = state.cart.filter(x => x !== l);
  else l.cant = n;
  renderCart();
}

function totals() {
  const subtotal = state.cart.reduce((s, l) => s + l.precio * l.cant, 0);
  const igv = subtotal * IGV_RATE;
  return { subtotal, igv, total: subtotal + igv };
}

/* ---------- Render: POS ---------- */
function renderCats() {
  const cats = ['Todas', ...new Set(state.productos.map(p => p.Categoria).filter(Boolean))];
  $('#cats').innerHTML = cats.map(c => `<button data-cat="${esc(c)}" class="pchip ${c === state.cat ? 'active' : ''}">${esc(c)}</button>`).join('');
}

function renderGrid() {
  const q = state.q.toLowerCase();
  const list = state.productos.filter(p =>
    (state.cat === 'Todas' || p.Categoria === state.cat) &&
    (!q || String(p.Nombre).toLowerCase().includes(q) || String(p.SKU).toLowerCase().includes(q)));
  $('#grid').innerHTML = list.map(p => `
    <button data-sku="${esc(p.SKU)}" ${Number(p.Stock) <= 0 ? 'disabled' : ''} class="card text-left hover:ring-2 ring-indigo-500 disabled:opacity-50">
      <div class="text-xs text-slate-500">${esc(p.SKU)} · ${esc(p.Marca)}</div>
      <div class="font-medium">${esc(p.Nombre)}</div>
      <div class="flex justify-between items-center mt-2">
        <span class="font-bold text-indigo-600 dark:text-indigo-400">${money(p.Precio_Venta)}</span>
        <span class="badge ${Number(p.Stock) <= LOW_STOCK ? 'badge-low' : 'badge-ok'}">Stock ${p.Stock}</span>
      </div>
    </button>`).join('') || '<p class="text-slate-500">Sin resultados</p>';
}

function renderCart() {
  $('#cart').innerHTML = state.cart.map(l => `
    <div class="flex items-center gap-2 text-sm">
      <div class="flex-1"><div class="font-medium">${esc(l.nombre)}</div><div class="text-xs text-slate-500">${money(l.precio)}</div></div>
      <button data-q="-1" data-sku="${esc(l.sku)}" class="btn-sec !px-2 !py-0.5">−</button>
      <span>${l.cant}</span>
      <button data-q="1" data-sku="${esc(l.sku)}" class="btn-sec !px-2 !py-0.5">+</button>
    </div>`).join('') || '<p class="text-sm text-slate-500">Carrito vacío</p>';
  const t = totals();
  $('#tSub').textContent = money(t.subtotal);
  $('#tIgv').textContent = money(t.igv);
  $('#tTot').textContent = money(t.total);
  $('#btnPay').disabled = !state.cart.length;
}

/* ---------- Render: Inventario ---------- */
function renderInventory() {
  $('#invBody').innerHTML = state.productos.map(p => `
    <tr class="border-b dark:border-slate-700">
      <td class="p-2">${esc(p.SKU)}</td><td>${esc(p.Nombre)}</td><td>${esc(p.Categoria)}</td><td>${money(p.Precio_Venta)}</td>
      <td><span class="badge ${Number(p.Stock) <= LOW_STOCK ? 'badge-low' : 'badge-ok'}">${p.Stock}</span></td>
      <td class="whitespace-nowrap"><button data-edit="${esc(p.SKU)}" class="text-indigo-500">Editar</button> · <button data-del="${esc(p.SKU)}" class="text-red-500">Borrar</button></td>
    </tr>`).join('');
  $('#restockSku').innerHTML = state.productos.map(p => `<option value="${esc(p.SKU)}">${esc(p.SKU)} – ${esc(p.Nombre)}</option>`).join('');
}

/* ---------- Render: Dashboard ---------- */
function parseItems(v) { try { return JSON.parse(v.Productos_JSON) || []; } catch { return []; } }

function renderDashboard() {
  const today = new Date().toLocaleDateString('sv-SE');      // yyyy-MM-dd
  const month = today.slice(0, 7);
  const sum = arr => arr.reduce((s, v) => s + Number(v.Total), 0);
  const hoy = state.ventas.filter(v => String(v.Fecha).startsWith(today));
  const mes = state.ventas.filter(v => String(v.Fecha).startsWith(month));
  const bajo = state.productos.filter(p => Number(p.Stock) <= LOW_STOCK).length;
  const count = {};
  state.ventas.forEach(v => parseItems(v).forEach(i => (count[i.nombre] = (count[i.nombre] || 0) + Number(i.cant))));
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const kpi = (t, v, s = '') => `<div class="card"><div class="text-sm text-slate-500">${t}</div><div class="text-2xl font-bold">${v}</div><div class="text-xs text-slate-500">${s}</div></div>`;
  $('#kpis').innerHTML =
    kpi('Ventas del día', money(sum(hoy)), `${hoy.length} operaciones`) +
    kpi('Ingresos del mes', money(sum(mes)), `${mes.length} ventas`) +
    kpi('Bajo stock (≤ 3)', bajo, 'productos') +
    kpi('Más vendido', top ? esc(top[0]) : '—', top ? top[1] + ' uds.' : '');
  $('#salesBody').innerHTML = state.ventas.slice(-10).reverse().map(v => `
    <tr class="border-b dark:border-slate-700">
      <td class="p-2">${esc(v.ID_Venta)}</td><td>${esc(v.Fecha)}</td><td>${esc(v.Cliente_Nombre)}</td><td>${esc(v.Metodo_Pago)}</td>
      <td>${money(v.Total)}</td><td><button data-reprint="${esc(v.ID_Venta)}" class="text-indigo-500">Reimprimir</button></td>
    </tr>`).join('');
}

function renderAll() { renderCats(); renderGrid(); renderCart(); renderInventory(); renderDashboard(); }

/* ---------- Ticket (80 mm) ---------- */
function printTicket(v) {
  const items = parseItems(v);
  const rows = items.map(i => `<tr><td>${i.cant} x ${esc(i.nombre)}</td><td style="text-align:right">${money(i.cant * i.precio)}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=340,height=600');
  if (!w) return toast('Permite las ventanas emergentes para imprimir', false);
  w.document.write(`<html><head><title>${esc(v.ID_Venta)}</title><style>
    @page{size:80mm auto;margin:3mm} body{font-family:monospace;font-size:12px;width:72mm;margin:0}
    table{width:100%;border-collapse:collapse} hr{border:0;border-top:1px dashed #000} h3,p{text-align:center;margin:2px 0}
  </style></head><body>
    <h3>${TIENDA}</h3><p>Comprobante ${esc(v.ID_Venta)}</p><p>${esc(v.Fecha)}</p><hr>
    <p style="text-align:left">Cliente: ${esc(v.Cliente_Nombre)}<br>Doc: ${esc(v.Cliente_Doc || '-')}</p><hr>
    <table>${rows}</table><hr>
    <table><tr><td>Subtotal</td><td style="text-align:right">${money(v.Subtotal)}</td></tr>
    <tr><td>IGV 18%</td><td style="text-align:right">${money(v.IGV_Impuesto)}</td></tr>
    <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${money(v.Total)}</b></td></tr></table>
    <hr><p>Pago: ${esc(v.Metodo_Pago)}</p><p>¡Gracias por su compra!</p>
    <script>window.onload=()=>{window.print();}<\/script></body></html>`);
  w.document.close();
}

/* ---------- Eventos ---------- */
function bindEvents() {
  // Navegación
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#view-' + b.dataset.view).classList.remove('hidden');
    $$('.tab').forEach(t => t.classList.toggle('active', t === b));
  }));
  $('.tab').click();

  $('#btnTheme').onclick = () => document.documentElement.classList.toggle('dark');
  $('#btnRefresh').onclick = refresh;

  // Buscador (Enter con SKU exacto = lector de códigos de barras)
  $('#search').addEventListener('input', e => { state.q = e.target.value; renderGrid(); });
  $('#search').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const hit = state.productos.find(p => String(p.SKU).toLowerCase() === e.target.value.trim().toLowerCase());
    if (hit) { addToCart(hit.SKU); e.target.value = ''; state.q = ''; renderGrid(); }
  });

  $('#cats').addEventListener('click', e => { const c = e.target.dataset.cat; if (c) { state.cat = c; renderCats(); renderGrid(); } });
  $('#grid').addEventListener('click', e => { const b = e.target.closest('[data-sku]'); if (b) addToCart(b.dataset.sku); });
  $('#cart').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) changeQty(b.dataset.sku, Number(b.dataset.q)); });
  $('#btnClear').onclick = () => { state.cart = []; renderCart(); };

  // Cobro
  $('#btnPay').onclick = () => { $('#payTotal').textContent = money(totals().total); $('#modal').classList.remove('hidden'); };
  $('#btnCancel').onclick = () => $('#modal').classList.add('hidden');
  $('#payForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = $('#btnConfirm'); btn.disabled = true; btn.textContent = 'Procesando…';
    try {
      const d = await api.post({ action: 'venta', ...f, items: state.cart.map(l => ({ sku: l.sku, cant: l.cant })) });
      printTicket(d.venta);
      state.cart = []; e.target.reset();
      $('#modal').classList.add('hidden');
      toast('Venta registrada ' + d.venta.ID_Venta);
      await refresh();
    } catch (err) { toast(err.message, false); await refresh(); }
    btn.disabled = false; btn.textContent = 'Confirmar e imprimir';
  });

  // Inventario: guardar / editar / borrar / reabastecer
  $('#prodForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.post({ action: 'guardarProducto', producto: Object.fromEntries(new FormData(e.target)) });
      e.target.reset(); $('#prodTitle').textContent = 'Nuevo producto';
      toast('Producto guardado'); refresh();
    } catch (err) { toast(err.message, false); }
  });
  $('#invBody').addEventListener('click', async e => {
    const ed = e.target.dataset.edit, del = e.target.dataset.del;
    if (ed) {
      const p = state.productos.find(x => String(x.SKU) === ed);
      const f = $('#prodForm');
      Object.keys(p).forEach(k => { if (f.elements[k]) f.elements[k].value = p[k]; });
      $('#prodTitle').textContent = 'Editar producto';
    }
    if (del && confirm('¿Eliminar ' + del + '?')) {
      try { await api.post({ action: 'eliminarProducto', sku: del }); toast('Eliminado'); refresh(); } catch (err) { toast(err.message, false); }
    }
  });
  $('#restockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api.post({ action: 'reabastecer', ...f }); e.target.reset(); toast('Stock actualizado'); refresh(); } catch (err) { toast(err.message, false); }
  });

  // Reimprimir
  $('#salesBody').addEventListener('click', e => {
    const id = e.target.dataset.reprint;
    if (id) printTicket(state.ventas.find(v => v.ID_Venta === id));
  });
}

bindEvents();
refresh();
