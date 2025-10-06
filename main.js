/* =======================
   Importes Firebase
======================= */
import {
  db, auth, HOGAR_ID,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, setDoc, orderBy, limit
} from "./firebase.js";

/* =======================
   Utils
======================= */
const $ = (id) => document.getElementById(id);
const L = (n) => 'L ' + Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const monthOf = (dateStr) => (dateStr || today()).slice(0,7);
const systemMonth = () => new Date().toISOString().slice(0,7);
const isYYYYMM = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const nextMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`; };
const previousMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };

const DEFAULT_INCOME = { esposa: 18800, esposo: 27000 };

/* =======================
   Estado Periodo
======================= */
let CURRENT_PERIOD = localStorage.getItem("hogar_periodo_actual") || systemMonth();
function setCurrentPeriod(p) {
  CURRENT_PERIOD = p;
  localStorage.setItem("hogar_periodo_actual", p);
}

/* =======================
   Refs Firestore
======================= */
const colTareas       = collection(db, 'hogares', HOGAR_ID, 'tareas');
const colGastos       = collection(db, 'hogares', HOGAR_ID, 'gastos');
const colPresupuestos = collection(db, 'hogares', HOGAR_ID, 'presupuestos');
const colIngresos     = collection(db, 'hogares', HOGAR_ID, 'ingresos');   // docId = YYYY-MM
const colCerrados     = collection(db, 'hogares', HOGAR_ID, 'cerrados');   // docId = YYYY-MM {cerrado:true}

/* =======================
   Guard UI (login vs app)
======================= */
const guard = {
  loginCard:   $('auth-guard'),
  appPrivate:  $('app-private'),
  sessionLbl:  $('session-state'),
  btnLogout:   $('btn-logout'),
  showApp(authenticated) {
    if (authenticated) {
      this.loginCard.style.display = 'none';
      this.appPrivate.style.display = '';
      this.btnLogout.disabled = false;
    } else {
      this.loginCard.style.display = '';
      this.appPrivate.style.display = 'none';
      this.btnLogout.disabled = true;
    }
  },
  setSessionText(t) { this.sessionLbl.textContent = t; }
};

/* =======================
   Auth listeners
======================= */
$('btn-auth-login')?.addEventListener('click', async () => {
  const email = $('auth-email')?.value?.trim();
  const pass  = $('auth-pass')?.value || '';
  if (!email || !pass) { alert('Ingresa correo y contraseña'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error(e);
    alert('No se pudo iniciar sesión. Revisa correo/contraseña y reglas de Firestore.');
  }
});

$('btn-logout')?.addEventListener('click', async () => {
  try { await signOut(auth); } catch(e) { console.error(e); }
});

/* =======================
   onAuthStateChanged
======================= */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    guard.setSessionText('Activa');
    guard.showApp(true);
    // Carga inicial de datos
    try {
      await onPeriodChange();
    } catch(e) {
      console.error('Inicialización post-login', e);
    }
  } else {
    guard.setSessionText('No iniciada');
    guard.showApp(false);
  }
});

/* =======================
   Ingresos / Cerrados
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
   Tareas
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
   Gastos
======================= */
async function addGasto(g) { await addDoc(colGastos, g); }
async function listGastos(limitTo=60) {
  const q = query(colGastos, orderBy('creado_en','desc'), limit(limitTo));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function deleteG(id) { await deleteDoc(doc(colGastos, id)); }

/* =======================
   Presupuestos
======================= */
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
   Meses conocidos
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
const tabs = document.querySelectorAll('.tabs button');
const sections = document.querySelectorAll('.tab');
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(b => b.classList.remove('active'));
  sections.forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
}));

/* ---------- TAREAS UI ---------- */
const formT = $('form-tarea');
const listaT = $('lista-tareas');
const tFiltroPersona = $('t-filtro-persona');
const tFiltroEstado = $('t-filtro-estado');
const tMetricas = $('t-metricas');

formT?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tarea = {
    titulo: $('t-titulo').value.trim(),
    descripcion: $('t-desc').value.trim(),
    esfuerzo: +$('t-esfuerzo').value,
    asignado: $('t-asignado').value,
    estado: 'pendiente',
    fecha_limite: $('t-fecha').value || null,
    creado_en: new Date().toISOString(),
    hecho_en: null,
  };
  if (!tarea.titulo) return;
  await addTarea(tarea);
  formT.reset(); await renderTareas();
});

tFiltroPersona?.addEventListener('change', renderTareas);
tFiltroEstado?.addEventListener('change', renderTareas);

async function renderTareas() {
  const persona = tFiltroPersona?.value || 'todas';
  const estado  = tFiltroEstado?.value || 'todas';
  const tareas = await listTareas();
  if (!listaT) return;
  listaT.innerHTML = '';

  const semanaMs = 7 * 24 * 3600 * 1000;
  const now = Date.now();
  const sem = tareas.filter(t => now - new Date(t.creado_en).getTime() < semanaMs);
  const puntosHechos = { esposa: 0, esposo: 0 }, puntosPend = { esposa: 0, esposo: 0 };
  sem.forEach(t => { (t.estado === 'hecha' ? puntosHechos : puntosPend)[t.asignado] += t.esfuerzo; });
  if (tMetricas) {
    tMetricas.textContent =
`Hechos (7 días)  →  Esposa: ${puntosHechos.esposa} | Esposo: ${puntosHechos.esposo}
Pendientes        →  Esposa: ${puntosPend.esposa}  | Esposo: ${puntosPend.esposo}`;
  }

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
      li.querySelector('[data-done]')?.addEventListener('click', async () => {
        await updateTarea(t.id, { estado: 'hecha', hecho_en: new Date().toISOString() }); renderTareas();
      });
      li.querySelector('[data-reasign]')?.addEventListener('click', async () => {
        const nuevo = t.asignado === 'esposo' ? 'esposa' : 'esposo';
        await updateTarea(t.id, { asignado: nuevo }); renderTareas();
      });
      li.querySelector('[data-del]')?.addEventListener('click', async () => {
        await deleteTarea(t.id); renderTareas();
      });
      listaT.appendChild(li);
    });
}

/* ---------- FINANZAS UI ---------- */
const formG = $('form-gasto');
const listaG = $('lista-gastos');
const formP = $('form-presupuesto');
const listaP = $('lista-presupuestos');
const rPeriodo = $('r-periodo');
const rBtn = $('r-cargar');
const rOut = $('r-out');

const pPeriodo = $('p-periodo');
const ingEsposa = $('ing-esposa');
const ingEsposo = $('ing-esposo');
const ingInfo = $('ing-info');
const btnGuardarIngresos = $('btn-guardar-ingresos');
const btnTraerAnterior = $('btn-traer-anterior');

const currPeriodSpan = $('curr-period');
const currEstado = $('curr-estado');
const btnIrMesActual = $('btn-ir-mes-actual');
const btnCerrarMes = $('btn-cerrar-mes');
const btnReabrirMes = $('btn-reabrir-mes');
const monthSelect = $('goto-period');
const btnIrPeriodo = $('btn-ir-periodo');

$('g-fecha') && ($('g-fecha').value = today());

pPeriodo && (pPeriodo.value = CURRENT_PERIOD);
rPeriodo && (rPeriodo.value = CURRENT_PERIOD);

/* Formularios */
formG?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = $('g-fecha').value || today();
  const g = {
    fecha, periodo: monthOf(fecha),
    categoria: $('g-categoria').value.trim(),
    descripcion: $('g-desc').value.trim(),
    monto: +$('g-monto').value,
    pagado_por: $('g-pagado').value,
    creado_en: new Date().toISOString()
  };
  if (!g.categoria || !g.monto) return;
  await addGasto(g);
  formG.reset(); $('g-fecha').value = today();
  await renderAllFinance();
});

formP?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const periodo = (pPeriodo.value || CURRENT_PERIOD);
  const categoria = $('p-categoria').value.trim();
  const tope = +$('p-tope').value;
  if (!periodo || !categoria) return;
  await upsertPresupuesto(periodo, categoria, tope);
  formP.reset(); pPeriodo.value = CURRENT_PERIOD;
  await renderAllFinance();
});

btnGuardarIngresos?.addEventListener('click', async () => {
  const periodo = pPeriodo.value || CURRENT_PERIOD;
  await setIncomes(periodo, { esposa: ingEsposa.value, esposo: ingEsposo.value });
  await loadIncomeFields();
  await renderAllFinance();
});

btnTraerAnterior?.addEventListener('click', async () => {
  const target = pPeriodo.value || CURRENT_PERIOD;
  const prev = previousMonth(target);
  const prevInc = await getIncomes(prev);
  await setIncomes(target, prevInc);

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

rBtn?.addEventListener('click', async (e) => { e.preventDefault(); await renderResumen(); });

btnIrMesActual?.addEventListener('click', async () => {
  setCurrentPeriod(systemMonth());
  await onPeriodChange();
});

btnCerrarMes?.addEventListener('click', async () => {
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

btnIrPeriodo?.addEventListener('click', async () => {
  const target = monthSelect.value;
  if (!isYYYYMM(target)) { alert('Selecciona un mes válido.'); return; }
  setCurrentPeriod(target);
  await onPeriodChange();
});

btnReabrirMes?.addEventListener('click', async () => {
  const current = CURRENT_PERIOD;
  if (!(await isClosed(current))) { alert('Este mes no está cerrado.'); return; }
  await unmarkClosed(current);
  await onPeriodChange();
  alert(`Mes ${current} reabierto.`);
});

/* ----- Render helpers ----- */
async function renderAllFinance() { await renderGastos(); await renderPresupuestos(); await renderResumen(); }

async function renderGastos() {
  const gastos = await listGastos();
  if (!listaG) return;
  listaG.innerHTML = '';
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
    li.querySelector('[data-del]')?.addEventListener('click', async () => {
      await deleteG(g.id); await renderAllFinance();
    });
    listaG.appendChild(li);
  });
}

async function renderPresupuestos() {
  const p = (rPeriodo?.value || CURRENT_PERIOD);
  const [gastos, presupuestos] = await Promise.all([
    listGastos(1000).then(arr => arr.filter(g => g.periodo === p)),
    listPresupuestos(p)
  ]);

  const porCat = gastos.reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] || 0) + g.monto; return acc; }, {});
  if (!listaP) return;
  listaP.innerHTML = '';
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
    li.querySelector('[data-del]')?.addEventListener('click', async () => {
      await deletePresupuesto(b.periodo, b.categoria);
      await renderPresupuestos();
    });
    listaP.appendChild(li);
  });
}

async function renderResumen() {
  const p = (rPeriodo?.value || CURRENT_PERIOD);
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

  if (!rOut) return;
  const cerrado = await isClosed(p);
  rOut.textContent =
`Periodo ${p}  ${cerrado ? '— [CERRADO]' : ''}
Ingresos →  Esposa: ${L(inc.esposa)} | Esposo: ${L(inc.esposo)}  (proporciones: ${sum>0?(inc.esposa/sum*100).toFixed(1):50}% / ${sum>0?(inc.esposo/sum*100).toFixed(1):50}%)
Total Gastos: ${L(total)}
Cuotas teóricas →  Esposa: ${L(cuotas.esposa)} | Esposo: ${L(cuotas.esposo)}
Pagado           →  Esposa: ${L(pagado.esposa)} | Esposo: ${L(pagado.esposo)}
Balance          →  Esposa: ${balance.esposa>=0?'a favor':'en contra'} ${L(Math.abs(balance.esposa))}
                    Esposo: ${balance.esposo>=0?'a favor':'en contra'} ${L(Math.abs(balance.esposo))}`;
}

async function loadIncomeFields() {
  const period = pPeriodo?.value || CURRENT_PERIOD;
  const inc = await getIncomes(period);
  if (ingEsposa) ingEsposa.value = inc.esposa;
  if (ingEsposo) ingEsposo.value = inc.esposo;

  const sum = (+inc.esposa||0) + (+inc.esposo||0);
  const pe = sum>0 ? (inc.esposa/sum*100).toFixed(1) : '50.0';
  const po = sum>0 ? (inc.esposo/sum*100).toFixed(1) : '50.0';
  if (ingInfo) ingInfo.textContent = `Proporciones para ${period}: Esposa ${pe}% — Esposo ${po}%`;
}

async function updatePeriodHeader() {
  const current = CURRENT_PERIOD;
  if (currPeriodSpan) currPeriodSpan.textContent = current;
  const closed = await isClosed(current);
  if (currEstado) currEstado.textContent = closed
    ? 'Estado: CERRADO (puedes reabrirlo si necesitas editarlo).'
    : 'Estado: ABIERTO';
  if (btnReabrirMes) btnReabrirMes.style.display = closed ? '' : 'none';
  if (btnCerrarMes)  btnCerrarMes.style.display  = closed ? 'none' : '';
}

async function refreshMonthDropdown() {
  let options = await knownPeriods();
  if (options.length === 0) options = monthsAround(CURRENT_PERIOD, 4, 2);
  else options = Array.from(new Set([...options, ...monthsAround(CURRENT_PERIOD, 2, 2)])).sort();

  if (!monthSelect) return;
  monthSelect.innerHTML = '';
  options.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    if (p === CURRENT_PERIOD) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}

export async function onPeriodChange() {
  if (pPeriodo) pPeriodo.value = CURRENT_PERIOD;
  if (rPeriodo) rPeriodo.value = CURRENT_PERIOD;
  await updatePeriodHeader();
  await loadIncomeFields();
  await renderAllFinance();
  await refreshMonthDropdown();
}
