// ===== Firebase SDKs (tu archivo firebase.js expone estos) =====
import {
  db, auth, HOGAR_ID,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, setDoc, orderBy, limit
} from "./firebase.js";

/* =======================
   Helpers generales
======================= */
const $   = (sel) => document.querySelector(sel);
const $$  = (sel) => document.querySelectorAll(sel);
const L   = (n) => 'L ' + Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const monthOf = (dateStr) => (dateStr || today()).slice(0,7); // YYYY-MM
const systemMonth = () => new Date().toISOString().slice(0,7);
const isYYYYMM = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const nextMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`; };
const previousMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };

const ROLES = { esposa: 'Esposa', esposo: 'Esposo' };
const DEFAULT_INCOME = { esposa: 18800, esposo: 27000 };

/* =======================
   Estado UI / Periodo
======================= */
let CURRENT_PERIOD = localStorage.getItem("hogar_periodo_actual") || systemMonth();
function setCurrentPeriod(p) {
  CURRENT_PERIOD = p;
  localStorage.setItem("hogar_periodo_actual", p);
}

/* =======================
   Referencias Firestore
======================= */
const colTareas       = collection(db, 'hogares', HOGAR_ID, 'tareas');
const colGastos       = collection(db, 'hogares', HOGAR_ID, 'gastos');
const colPresupuestos = collection(db, 'hogares', HOGAR_ID, 'presupuestos');
const colIngresos     = collection(db, 'hogares', HOGAR_ID, 'ingresos'); // docId = YYYY-MM
const colCerrados     = collection(db, 'hogares', HOGAR_ID, 'cerrados'); // docId = YYYY-MM {cerrado:true}

/* =======================
   Seguridad extra (UI)
   — mostrar app sólo si hay user *y* es miembro del hogar
======================= */
async function isMember(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'hogares', HOGAR_ID, 'miembros', uid));
  return snap.exists();
}

function showLoginOnly() {
  $('#auth-guard')?.classList.remove('hidden');
  $('#app')?.classList.add('hidden');
  $('#btn-logout')?.setAttribute('disabled', 'true');
  $('#session-badge').textContent = 'Sesión: —';
}

function showApp(user) {
  $('#auth-guard')?.classList.add('hidden');
  $('#app')?.classList.remove('hidden');
  $('#btn-logout')?.removeAttribute('disabled');
  $('#session-badge').textContent = `Sesión: ${user.email || user.uid}`;
}

/* =======================
   Auth observer
======================= */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      showLoginOnly();
      return;
    }
    const ok = await isMember(user.uid);
    if (!ok) {
      showLoginOnly();
      alert('Tu usuario no está registrado como miembro del hogar. (Consulta al admin)');
      return;
    }
    // Tiene sesión y es miembro: mostrar app y refrescar datos
    showApp(user);
    await onPeriodChange(); // puebla la UI de finanzas
    await renderTareas();
  } catch (e) {
    console.error(e);
    showLoginOnly();
  }
});

/* =======================
   Datos: Ingresos / Cerrado
======================= */
async function getIncomes(period) {
  const snap = await getDoc(doc(colIngresos, period));
  if (snap.exists()) return { esposa:+(snap.data().esposa||0), esposo:+(snap.data().esposo||0) };
  const prev = previousMonth(period);
  const s2 = await getDoc(doc(colIngresos, prev));
  if (s2.exists()) return { esposa:+(s2.data().esposa||0), esposo:+(s2.data().esposo||0) };
  return { ...DEFAULT_INCOME };
}
async function setIncomes(period, data) {
  await setDoc(doc(colIngresos, period), { esposa:+data.esposa||0, esposo:+data.esposo||0 }, { merge: true });
}
async function isClosed(period) {
  const s = await getDoc(doc(colCerrados, period)); return s.exists();
}
async function markClosed(period) {
  await setDoc(doc(colCerrados, period), { cerrado: true });
}
async function unmarkClosed(period) {
  await deleteDoc(doc(colCerrados, period)).catch(()=>{});
}

/* =======================
   Datos: Tareas
======================= */
async function addTarea(t) { await addDoc(colTareas, t); }
async function listTareas() {
  const q = query(colTareas, orderBy('creado_en','desc'));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function updateTarea(id, patch) { await updateDoc(doc(colTareas, id), patch); }
async function deleteTarea(id) { await deleteDoc(doc(colTareas, id)); }

/* =======================
   Datos: Gastos / Presupuestos
======================= */
async function addGasto(g) { await addDoc(colGastos, g); }
async function listGastos(limitTo=60) {
  const q = query(colGastos, orderBy('creado_en','desc'), limit(limitTo));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function deleteG(id) { await deleteDoc(doc(colGastos, id)); }

async function upsertPresupuesto(periodo, categoria, tope) {
  const q = query(colPresupuestos, where('periodo','==',periodo), where('categoria','==',categoria));
  const s = await getDocs(q);
  if (s.empty) { await addDoc(colPresupuestos, { periodo, categoria, tope:+tope||0 }); }
  else { await updateDoc(doc(colPresupuestos, s.docs[0].id), { tope:+tope||0 }); }
}
async function listPresupuestos(periodo) {
  const q = query(colPresupuestos, where('periodo','==',periodo));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function deletePresupuesto(periodo, categoria) {
  const q = query(colPresupuestos, where('periodo','==',periodo), where('categoria','==',categoria));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(doc(colPresupuestos, d.id))));
}

/* =======================
   Meses conocidos para dropdown
======================= */
async function knownPeriods() {
  const set = new Set([CURRENT_PERIOD]);
  const [ing, pre] = await Promise.all([ getDocs(colIngresos), getDocs(colPresupuestos) ]);
  ing.docs.forEach(d => set.add(d.id));
  pre.docs.forEach(d => d.data().periodo && set.add(d.data().periodo));
  return Array.from(set).sort();
}
function monthsAround(center, back=3, forward=3) {
  const [y,m] = center.split('-').map(Number);
  const base = new Date(y, m-1, 1);
  const out = [];
  for (let i=-back; i<=forward; i++) {
    const d = new Date(base.getFullYear(), base.getMonth()+i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    out.push(k);
  }
  return Array.from(new Set(out));
}

/* =======================
   Tabs
======================= */
function wireTabs() {
  const tabs = $$('.tabs button');
  const sections = $$('.tab');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    $('#'+btn.dataset.tab).classList.add('active');
  }));
}

/* =======================
   TAREAS UI
======================= */
async function renderTareas() {
  const listaT = $('#lista-tareas');
  const tFiltroPersona = $('#t-filtro-persona');
  const tFiltroEstado = $('#t-filtro-estado');
  const tMetricas = $('#t-metricas');

  const persona = tFiltroPersona?.value || 'todas';
  const estado  = tFiltroEstado?.value  || 'todas';
  const tareas  = await listTareas();
  if (listaT) listaT.innerHTML = '';

  // métricas últimos 7 días
  const semanaMs = 7 * 24 * 3600 * 1000;
  const now = Date.now();
  const sem = tareas.filter(t => now - new Date(t.creado_en).getTime() < semanaMs);
  const puntosHechos = { esposa: 0, esposo: 0 }, puntosPend = { esposa: 0, esposo: 0 };
  sem.forEach(t => { (t.estado === 'hecha' ? puntosHechos : puntosPend)[t.asignado] += t.esfuerzo; });
  if (tMetricas) tMetricas.textContent =
`Hechos (7 días)  →  Esposa: ${puntosHechos.esposa} | Esposo: ${puntosHechos.esposo}
Pendientes        →  Esposa: ${puntosPend.esposa}  | Esposo: ${puntosPend.esposo}`;

  tareas
    .filter(t => (persona === 'todas' || t.asignado === persona))
    .filter(t => (estado === 'todas' || t.estado === estado))
    .forEach(t => {
      const li = document.createElement('li'); li.className = 'item';
      li.innerHTML = `
        <div>
          <strong>${t.titulo}</strong>
          <div class="meta">${t.descripcion || ''} — Asignado a: ${t.asignado} — Esfuerzo: ${t.esfuerzo}
            ${t.fecha_limite ? ` — Límite: ${t.fecha_limite}` : ''} — Estado: <span class="badge">${t.estado}</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ok" data-done>Hecha</button>
          <button class="btn btn-warn" data-reasign>Reasignar</button>
          <button class="btn btn-danger" data-del>Eliminar</button>
        </div>`;
      li.querySelector('[data-done]').onclick = async () => { await updateTarea(t.id, { estado: 'hecha', hecho_en: new Date().toISOString() }); renderTareas(); };
      li.querySelector('[data-reasign]').onclick = async () => { const nuevo = t.asignado === 'esposo' ? 'esposa' : 'esposo'; await updateTarea(t.id, { asignado: nuevo }); renderTareas(); };
      li.querySelector('[data-del]').onclick  = async () => { await deleteTarea(t.id); renderTareas(); };
      listaT?.appendChild(li);
    });
}

/* =======================
   FINANZAS UI
======================= */
async function renderGastos() {
  const listaG = $('#lista-gastos');
  const gastos = await listGastos();
  if (listaG) listaG.innerHTML = '';
  gastos.forEach(g => {
    const li = document.createElement('li'); li.className = 'item';
    li.innerHTML = `
      <div>
        <strong>${g.categoria}</strong> — ${L(g.monto)}
        <div class="meta">${g.fecha} — Pagó: ${g.pagado_por} — ${g.descripcion || ''} — Periodo: ${g.periodo}</div>
      </div>
      <div class="actions">
        <button class="btn btn-danger" data-del>Eliminar</button>
      </div>`;
    li.querySelector('[data-del]').onclick = async () => { await deleteG(g.id); renderAllFinance(); };
    listaG?.appendChild(li);
  });
}
async function renderPresupuestos() {
  const p = ($('#r-periodo')?.value || CURRENT_PERIOD);
  const [gastos, presupuestos] = await Promise.all([
    listGastos(1000).then(arr => arr.filter(g => g.periodo === p)),
    listPresupuestos(p)
  ]);
  const porCat = gastos.reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] || 0) + g.monto; return acc; }, {});
  const listaP = $('#lista-presupuestos');
  if (listaP) listaP.innerHTML = '';
  presupuestos.forEach(b => {
    const usado = porCat[b.categoria] || 0;
    const pct = b.tope > 0 ? Math.min(100, Math.round(usado * 100 / b.tope)) : 0;
    const li = document.createElement('li'); li.className = 'item';
    li.innerHTML = `
      <div style="flex:1">
        <strong>${b.categoria}</strong> — tope ${L(b.tope)} — usado ${L(usado)} (${pct}%)
        <div class="progress"><div style="width:${pct}%"></div></div>
      </div>
      <div class="actions">
        <button class="btn btn-danger" data-del>Quitar</button>
      </div>`;
    li.querySelector('[data-del]').onclick = async () => { await deletePresupuesto(b.periodo, b.categoria); renderPresupuestos(); };
    listaP?.appendChild(li);
  });
}
async function renderResumen() {
  const p = ($('#r-periodo')?.value || CURRENT_PERIOD);
  const inc = await getIncomes(p);
  const sum = (+inc.esposa || 0) + (+inc.esposo || 0);
  const gastos = (await listGastos(1000)).filter(g => g.periodo === p);
  const total = gastos.reduce((a, g) => a + g.monto, 0);
  const cuotas = sum > 0
    ? { esposa: total * (inc.esposa / sum), esposo: total * (inc.esposo / sum) }
    : { esposa: total * 0.5, esposo: total * 0.5 };
  const pagado = {
    esposa: gastos.filter(g => g.pagado_por === 'esposa').reduce((a, g) => a + g.monto, 0),
    esposo:  gastos.filter(g => g.pagado_por === 'esposo').reduce((a, g) => a + g.monto, 0),
  };
  const balance = { esposa: pagado.esposa - cuotas.esposa, esposo: pagado.esposo - cuotas.esposo };
  const cerrado = await isClosed(p);
  const rOut = $('#r-out');
  if (rOut) rOut.textContent =
`Periodo ${p}  ${cerrado ? '— [CERRADO]' : ''}
Ingresos →  Esposa: ${L(inc.esposa)} | Esposo: ${L(inc.esposo)}  (proporciones: ${sum>0?(inc.esposa/sum*100).toFixed(1):50}% / ${sum>0?(inc.esposo/sum*100).toFixed(1):50}%)
Total Gastos: ${L(total)}
Cuotas teóricas →  Esposa: ${L(cuotas.esposa)} | Esposo: ${L(cuotas.esposo)}
Pagado           →  Esposa: ${L(pagado.esposa)} | Esposo: ${L(pagado.esposo)}
Balance          →  Esposa: ${balance.esposa>=0?'a favor':'en contra'} ${L(Math.abs(balance.esposa))}
                    Esposo: ${balance.esposo>=0?'a favor':'en contra'} ${L(Math.abs(balance.esposo))}`;
}
async function renderAllFinance() { await renderGastos(); await renderPresupuestos(); await renderResumen(); }

async function updatePeriodHeader() {
  const current = CURRENT_PERIOD;
  $('#curr-period').textContent = current;
  const closed = await isClosed(current);
  $('#curr-estado').textContent = closed
    ? 'Estado: CERRADO (puedes reabrirlo si necesitas editarlo).'
    : 'Estado: ABIERTO';
  $('#btn-reabrir-mes').style.display = closed ? '' : 'none';
  $('#btn-cerrar-mes').style.display  = closed ? 'none' : '';
}
async function refreshMonthDropdown() {
  let options = await knownPeriods();
  if (options.length === 0) options = monthsAround(CURRENT_PERIOD, 4, 2);
  else options = Array.from(new Set([...options, ...monthsAround(CURRENT_PERIOD, 2, 2)])).sort();
  const monthSelect = $('#goto-period');
  monthSelect.innerHTML = '';
  options.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    if (p === CURRENT_PERIOD) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}
async function onPeriodChange() {
  $('#p-periodo').value = CURRENT_PERIOD; $('#r-periodo').value = CURRENT_PERIOD;
  $('#g-fecha').value = today();
  await updatePeriodHeader();
  await loadIncomeFields();
  await renderAllFinance();
  await refreshMonthDropdown();
}
async function loadIncomeFields() {
  const period = $('#p-periodo').value || CURRENT_PERIOD;
  const inc = await getIncomes(period);
  $('#ing-esposa').value = inc.esposa;
  $('#ing-esposo').value = inc.esposo;
  const sum = (+inc.esposa||0) + (+inc.esposo||0);
  const pe = sum>0 ? (inc.esposa/sum*100).toFixed(1) : '50.0';
  const po = sum>0 ? (inc.esposo/sum*100).toFixed(1) : '50.0';
  $('#ing-info').textContent = `Proporciones para ${period}: Esposa ${pe}% — Esposo ${po}%`;
}

/* =======================
   Wire de eventos (DOM listo)
======================= */
document.addEventListener('DOMContentLoaded', () => {
  wireTabs();

  // LOGIN
  const formLogin  = $('#form-login');
  const loginEmail = $('#auth-email');
  const loginPass  = $('#auth-pass');
  const loginMsg   = $('#login-msg');
  const btnLogout  = $('#btn-logout');

  if (formLogin) formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = 'Ingresando...';
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPass.value);
      loginMsg.textContent = '';
    } catch (err) {
      console.error(err);
      loginMsg.textContent = 'Error de inicio de sesión.';
      alert(err.message || 'No se pudo iniciar sesión');
    }
  });

  if (btnLogout) btnLogout.addEventListener('click', async () => {
    try { await signOut(auth); } catch(e) { console.error(e); }
  });

  // FORM TAREA
  $('#form-tarea')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tarea = {
      titulo: $('#t-titulo').value.trim(),
      descripcion: $('#t-desc').value.trim(),
      esfuerzo: +$('#t-esfuerzo').value,
      asignado: $('#t-asignado').value,
      estado: 'pendiente',
      fecha_limite: $('#t-fecha').value || null,
      creado_en: new Date().toISOString(),
      hecho_en: null,
    };
    if (!tarea.titulo) return;
    await addTarea(tarea);
    e.target.reset(); $('#t-fecha').value = '';
    await renderTareas();
  });

  // FILTROS TAREAS
  $('#t-filtro-persona')?.addEventListener('change', renderTareas);
  $('#t-filtro-estado') ?.addEventListener('change', renderTareas);

  // GASTOS
  $('#form-gasto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fecha = $('#g-fecha').value || today();
    const g = {
      fecha, periodo: monthOf(fecha),
      categoria: $('#g-categoria').value.trim(),
      descripcion: $('#g-desc').value.trim(),
      monto: +$('#g-monto').value,
      pagado_por: $('#g-pagado').value,
      creado_en: new Date().toISOString()
    };
    if (!g.categoria || !g.monto) return;
    await addGasto(g);
    e.target.reset(); $('#g-fecha').value = today();
    await renderAllFinance();
  });

  // PRESUPUESTO
  $('#form-presupuesto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const periodo = ($('#p-periodo').value || CURRENT_PERIOD);
    const categoria = $('#p-categoria').value.trim();
    const tope = +$('#p-tope').value;
    if (!periodo || !categoria) return;
    await upsertPresupuesto(periodo, categoria, tope);
    e.target.reset(); $('#p-periodo').value = CURRENT_PERIOD;
    await renderAllFinance();
  });

  // INGRESOS
  $('#btn-guardar-ingresos')?.addEventListener('click', async () => {
    const periodo = $('#p-periodo').value || CURRENT_PERIOD;
    await setIncomes(periodo, { esposa: $('#ing-esposa').value, esposo: $('#ing-esposo').value });
    await loadIncomeFields();
    await renderAllFinance();
  });

  // Traer del mes anterior
  $('#btn-traer-anterior')?.addEventListener('click', async () => {
    const target = $('#p-periodo').value || CURRENT_PERIOD;
    const prev = previousMonth(target);
    // ingresos
    const prevInc = await getIncomes(prev);
    await setIncomes(target, prevInc);
    // presupuestos
    const [preTarget, prePrev] = await Promise.all([listPresupuestos(target), listPresupuestos(prev)]);
    const existentes = new Set(preTarget.map(b => b.categoria.toLowerCase()));
    let added = 0;
    for (const b of prePrev) {
      if (!existentes.has(b.categoria.toLowerCase())) {
        await upsertPresupuesto(target, b.categoria, b.tope);
        added++;
      }
    }
    await loadIncomeFields(); await renderPresupuestos(); await renderResumen();
    alert(`Importado desde ${prev}: ingresos + ${added} presupuesto(s).`);
  });

  // RESUMEN
  $('#r-cargar')?.addEventListener('click', async (e) => { e.preventDefault(); await renderResumen(); });

  // PERIODOS
  $('#btn-ir-mes-actual')?.addEventListener('click', async () => { setCurrentPeriod(systemMonth()); await onPeriodChange(); });
  $('#btn-cerrar-mes')    ?.addEventListener('click', async () => {
    const current = CURRENT_PERIOD;
    if (await isClosed(current)) { alert('Este mes ya está cerrado.'); return; }
    await markClosed(current);
    const next = nextMonth(current);
    const presActual = await listPresupuestos(current);
    for (const b of presActual) await upsertPresupuesto(next, b.categoria, b.tope);
    await setIncomes(next, await getIncomes(current));
    setCurrentPeriod(next);
    await onPeriodChange();
    alert(`Mes ${current} cerrado. Nuevo mes en curso: ${next}.`);
  });
  $('#btn-reabrir-mes')  ?.addEventListener('click', async () => {
    const current = CURRENT_PERIOD;
    if (!(await isClosed(current))) { alert('Este mes no está cerrado.'); return; }
    await unmarkClosed(current);
    await onPeriodChange();
    alert(`Mes ${current} reabierto.`);
  });
  $('#btn-ir-periodo')   ?.addEventListener('click', async () => {
    const target = $('#goto-period').value;
    if (!isYYYYMM(target)) { alert('Selecciona un mes válido.'); return; }
    setCurrentPeriod(target);
    await onPeriodChange();
  });
});

console.info('[firebase] conectado a', auth.app?.options?.projectId || '(desconocido)');
