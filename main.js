/* =======================
   Importes Firebase
======================= */
import {
  db, auth, HOGAR_ID,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously,
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, setDoc, orderBy, limit
} from "./firebase.js";

/* =======================
   Utilidades
======================= */
const L = (n) => 'L ' + Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const monthOf = (dateStr) => (dateStr || today()).slice(0,7); // YYYY-MM
const systemMonth = () => new Date().toISOString().slice(0,7);
const isYYYYMM = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const nextMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`; };
const previousMonth = (p) => { const [y,m]=p.split('-').map(Number); const d=new Date(y,m-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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
   Auth mínima (dev)
   - Si estás logueado, sigue.
   - Si no, entra anónimo (para no bloquear).
   Luego puedes cambiar a Email/Password.
======================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try { await signInAnonymously(auth); } catch (e) { console.error(e); alert('Activa Authentication en Firebase.'); }
  }
});

/* =======================
   Datos: Ingresos / Cerrado
======================= */
async function getIncomes(period) {
  const snap = await getDoc(doc(colIngresos, period));
  if (snap.exists()) return { esposa:+(snap.data().esposa||0), esposo:+(snap.data().esposo||0) };
  // cascada: busca el anterior
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
   Datos: Gastos
======================= */
async function addGasto(g) { await addDoc(colGastos, g); }
async function listGastos(limitTo=60) {
  const q = query(colGastos, orderBy('creado_en','desc'), limit(limitTo));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function deleteG(id) { await deleteDoc(doc(colGastos, id)); }

/* =======================
   Datos: Presupuestos
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
   Meses conocidos (para dropdown)
======================= */
async function knownPeriods() {
  const set = new Set([CURRENT_PERIOD]);

  const [ing, pre] = await Promise.all([
    getDocs(colIngresos),
    getDocs(colPresupuestos),
  ]);
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
   DOM refs y Tabs
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
const formT = document.getElementById('form-tarea');
const listaT = document.getElementById('lista-tareas');
const tFiltroPersona = document.getElementById('t-filtro-persona');
const tFiltroEstado = document.getElementById('t-filtro-estado');
const tMetricas = document.getElementById('t-metricas');

formT.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tarea = {
    titulo: document.getElementById('t-titulo').value.trim(),
    descripcion: document.getElementById('t-desc').value.trim(),
    esfuerzo: +document.getElementById('t-esfuerzo').value,
    asignado: document.getElementById('t-asignado').value,
    estado: 'pendiente',
    fecha_limite: document.getElementById('t-fecha').value || null,
    creado_en: new Date().toISOString(),
    hecho_en: null,
  };
  if (!tarea.titulo) return;
  await addTarea(tarea);
  formT.reset(); await renderTareas();
});

tFiltroPersona.addEventListener('change', renderTareas);
tFiltroEstado.addEventListener('change', renderTareas);

async function renderTareas() {
  const persona = tFiltroPersona.value; // todas | esposa | esposo
  const estado = tFiltroEstado.value;   // todas | pendiente | hecha
  const tareas = await listTareas();
  listaT.innerHTML = '';

  // métricas semanales (últimos 7 días)
  const semanaMs = 7 * 24 * 3600 * 1000;
  const now = Date.now();
  const sem = tareas.filter(t => now - new Date(t.creado_en).getTime() < semanaMs);
  const puntosHechos = { esposa: 0, esposo: 0 }, puntosPend = { esposa: 0, esposo: 0 };
  sem.forEach(t => { (t.estado === 'hecha' ? puntosHechos : puntosPend)[t.asignado] += t.esfuerzo; });
  tMetricas.textContent =
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
      li.querySelector('[data-done]').onclick = async () => {
        await updateTarea(t.id, { estado: 'hecha', hecho_en: new Date().toISOString() }); renderTareas();
      };
      li.querySelector('[data-reasign]').onclick = async () => {
        const nuevo = t.asignado === 'esposo' ? 'esposa' : 'esposo';
        await updateTarea(t.id, { asignado: nuevo }); renderTareas();
      };
      li.querySelector('[data-del]').onclick = async () => {
        await deleteTarea(t.id); renderTareas();
      };
      listaT.appendChild(li);
    });
}

/* ---------- FINANZAS UI ---------- */
const formG = document.getElementById('form-gasto');
const listaG = document.getElementById('lista-gastos');
const formP = document.getElementById('form-presupuesto');
const listaP = document.getElementById('lista-presupuestos');
const rPeriodo = document.getElementById('r-periodo');
const rBtn = document.getElementById('r-cargar');
const rOut = document.getElementById('r-out');

const pPeriodo = document.getElementById('p-periodo');
const ingEsposa = document.getElementById('ing-esposa');
const ingEsposo = document.getElementById('ing-esposo');
const ingInfo = document.getElementById('ing-info');
const btnGuardarIngresos = document.getElementById('btn-guardar-ingresos');
const btnTraerAnterior = document.getElementById('btn-traer-anterior');

const currPeriodSpan = document.getElementById('curr-period');
const currEstado = document.getElementById('curr-estado');
const btnIrMesActual = document.getElementById('btn-ir-mes-actual');
const btnCerrarMes = document.getElementById('btn-cerrar-mes');
const btnReabrirMes = document.getElementById('btn-reabrir-mes');
const monthSelect = document.getElementById('goto-period');
const btnIrPeriodo = document.getElementById('btn-ir-periodo');

document.getElementById('g-fecha').value = today();

/* --- Inicio --- */
pPeriodo.value = CURRENT_PERIOD;
rPeriodo.value = CURRENT_PERIOD;
await onPeriodChange();   // pinta todo al cargar

/* Formularios */
formG.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = document.getElementById('g-fecha').value || today();
  const g = {
    fecha, periodo: monthOf(fecha),
    categoria: document.getElementById('g-categoria').value.trim(),
    descripcion: document.getElementById('g-desc').value.trim(),
    monto: +document.getElementById('g-monto').value,
    pagado_por: document.getElementById('g-pagado').value,
    creado_en: new Date().toISOString()
  };
  if (!g.categoria || !g.monto) return;
  await addGasto(g);
  formG.reset(); document.getElementById('g-fecha').value = today();
  await renderAllFinance();
});

formP.addEventListener('submit', async (e) => {
  e.preventDefault();
  const periodo = (pPeriodo.value || CURRENT_PERIOD);
  const categoria = document.getElementById('p-categoria').value.trim();
  const tope = +document.getElementById('p-tope').value;
  if (!periodo || !categoria) return;
  await upsertPresupuesto(periodo, categoria, tope);
  formP.reset(); pPeriodo.value = CURRENT_PERIOD;
  await renderAllFinance();
});

/* Ingresos */
btnGuardarIngresos.addEventListener('click', async () => {
  const periodo = pPeriodo.value || CURRENT_PERIOD;
  await setIncomes(periodo, { esposa: ingEsposa.value, esposo: ingEsposo.value });
  await loadIncomeFields();
  await renderAllFinance();
});

/* Traer del mes anterior */
btnTraerAnterior?.addEventListener('click', async () => {
  const target = pPeriodo.value || CURRENT_PERIOD;
  const prev = previousMonth(target);

  // Ingresos
  const prevInc = await getIncomes(prev);
  await setIncomes(target, prevInc);

  // Presupuestos (sin duplicar)
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

/* Resumen */
rBtn.addEventListener('click', async (e) => { e.preventDefault(); await renderResumen(); });

/* Mes en curso (cabecera) */
btnIrMesActual.addEventListener('click', async () => {
  setCurrentPeriod(systemMonth());
  await onPeriodChange();
});

btnCerrarMes.addEventListener('click', async () => {
  const current = CURRENT_PERIOD;
  if (await isClosed(current)) { alert('Este mes ya está cerrado.'); return; }

  await markClosed(current);

  // Copiar presupuestos e ingresos al siguiente
  const next = nextMonth(current);
  const presActual = await listPresupuestos(current);
  for (const b of presActual) await upsertPresupuesto(next, b.categoria, b.tope);
  await setIncomes(next, await getIncomes(current));

  setCurrentPeriod(next);
  await onPeriodChange();
  alert(`Mes ${current} cerrado. Nuevo mes en curso: ${next}.`);
});

/* Cambiar al mes seleccionado en el dropdown */
btnIrPeriodo.addEventListener('click', async () => {
  const target = monthSelect.value;
  if (!isYYYYMM(target)) { alert('Selecciona un mes válido.'); return; }
  setCurrentPeriod(target);
  await onPeriodChange();
});

/* Reabrir el mes actual */
btnReabrirMes.addEventListener('click', async () => {
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
    li.querySelector('[data-del]').onclick = async () => {
      await deleteG(g.id); await renderAllFinance();
    };
    listaG.appendChild(li);
  });
}

async function renderPresupuestos() {
  const p = (rPeriodo.value || CURRENT_PERIOD);
  const [gastos, presupuestos] = await Promise.all([
    listGastos(1000).then(arr => arr.filter(g => g.periodo === p)),
    listPresupuestos(p)
  ]);

  const porCat = gastos.reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] || 0) + g.monto; return acc; }, {});
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
    li.querySelector('[data-del]').onclick = async () => {
      await deletePresupuesto(b.periodo, b.categoria);
      await renderPresupuestos();
    };
    listaP.appendChild(li);
  });
}

async function renderResumen() {
  const p = (rPeriodo.value || CURRENT_PERIOD);
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
  const period = pPeriodo.value || CURRENT_PERIOD;
  const inc = await getIncomes(period);
  ingEsposa.value = inc.esposa;
  ingEsposo.value = inc.esposo;

  const sum = (+inc.esposa||0) + (+inc.esposo||0);
  const pe = sum>0 ? (inc.esposa/sum*100).toFixed(1) : '50.0';
  const po = sum>0 ? (inc.esposo/sum*100).toFixed(1) : '50.0';
  ingInfo.textContent = `Proporciones para ${period}: Esposa ${pe}% — Esposo ${po}%`;
}

async function updatePeriodHeader() {
  const current = CURRENT_PERIOD;
  currPeriodSpan.textContent = current;
  const closed = await isClosed(current);
  currEstado.textContent = closed
    ? 'Estado: CERRADO (puedes reabrirlo si necesitas editarlo).'
    : 'Estado: ABIERTO';
  btnReabrirMes.style.display = closed ? '' : 'none';
  btnCerrarMes.style.display  = closed ? 'none' : '';
}

async function refreshMonthDropdown() {
  let options = await knownPeriods();
  if (options.length === 0) options = monthsAround(CURRENT_PERIOD, 4, 2);
  else options = Array.from(new Set([...options, ...monthsAround(CURRENT_PERIOD, 2, 2)])).sort();

  monthSelect.innerHTML = '';
  options.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    if (p === CURRENT_PERIOD) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}

async function onPeriodChange() {
  pPeriodo.value = CURRENT_PERIOD; rPeriodo.value = CURRENT_PERIOD;
  await updatePeriodHeader();
  await loadIncomeFields();
  await renderAllFinance();
  await refreshMonthDropdown();
}
