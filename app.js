/**
 * app.js — Fő alkalmazás koordinátor
 * ============================================================
 * Összeköti a data, model, map, ui modulokat.
 * Kezeli a:
 *  - diatóma lista szerkesztését
 *  - JSON import/export-ot
 *  - LocalStorage mentést
 *  - Elemzés futtatását
 *  - Minta összehasonlítást
 * ============================================================
 */

'use strict';

import { loadSpeciesDB, PANNONIAN_INDICATORS } from './data.js';
import { estimateAge, assessWaterQuality } from './model.js';
import { initMap, setCoordinates, getCurrentCoords, invalidateMapSize } from './map.js';
import { renderAgeResult, renderWaterQuality, renderTaxaChart, showToast, initTheme, setLoading } from './ui.js';

// ─── Alkalmazás állapot ────────────────────────────────────────────────────────
const state = {
  taxa: [],          // [{name, abundance}]
  coords: null,      // {lat, lon}
  elevation: null,   // méter
  sampleMeta: {},    // opcionális metaadatok
  results: null,     // utolsó elemzés eredménye
  savedSamples: [],  // mentett minták (LocalStorage)
};

// ─── Inicializáció ─────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  await loadSpeciesDB();

  // Térkép inicializálás
  initMap('map-container', (lat, lon, elev) => {
    state.coords = { lat, lon };
    state.elevation = elev;
    document.getElementById('elevation-val').textContent =
      elev !== null ? `${elev} m` : '– (API nem elérhető)';
    showToast(`Koordináta: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'info', 2000);
  });

  loadSavedSamples();
  bindEvents();
  addDefaultTaxa();

  // Pannóniai fajok autocomplete-je
  buildAutocomplete();

  // Tab navigáció
  initTabs();
}

// ─── Alapértelmezett minta (bemutató) ──────────────────────────────────────────
function addDefaultTaxa() {
  const demo = [
    { name: 'Cyclotella balatonis', abundance: 28 },
    { name: 'Aulacoseira balatonis', abundance: 18 },
    { name: 'Cyclotella distinguenda', abundance: 12 },
    { name: 'Stephanodiscus niagarae', abundance: 10 },
    { name: 'Achnanthidium minutissimum', abundance: 8 },
    { name: 'Navicula radiosa', abundance: 7 },
    { name: 'Cyclotella meneghiniana', abundance: 6 },
    { name: 'Nitzschia dissipata', abundance: 5 },
    { name: 'Cocconeis placentula', abundance: 4 },
    { name: 'Gomphonema olivaceum', abundance: 2 },
  ];
  state.taxa = demo;
  refreshTaxaTable();
}

// ─── Eseménykezelők ────────────────────────────────────────────────────────────
function bindEvents() {
  // Koordináta kézi bevitel
  document.getElementById('btn-set-coords')?.addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('coord-lat').value);
    const lon = parseFloat(document.getElementById('coord-lon').value);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      showToast('Érvénytelen koordináta!', 'error'); return;
    }
    setCoordinates(lat, lon);
  });

  // Faj hozzáadás
  document.getElementById('btn-add-taxon')?.addEventListener('click', addTaxon);
  document.getElementById('taxon-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTaxon();
  });

  // JSON import
  document.getElementById('json-import-btn')?.addEventListener('click', importJSON);
  document.getElementById('json-file-input')?.addEventListener('change', importJSONFile);

  // JSON export
  document.getElementById('json-export-btn')?.addEventListener('click', exportJSON);

  // Elemzés futtatása
  document.getElementById('btn-analyze')?.addEventListener('click', runAnalysis);

  // Minta mentése
  document.getElementById('btn-save-sample')?.addEventListener('click', saveSample);

  // Minta törlése
  document.getElementById('btn-clear-taxa')?.addEventListener('click', () => {
    if (confirm('Törli az összes diatóma adatot?')) { state.taxa = []; refreshTaxaTable(); }
  });

  // Demo fajok
  document.getElementById('btn-demo-pannonian')?.addEventListener('click', () => {
    addDefaultTaxa();
    showToast('Pannóniai demo minta betöltve', 'success');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target)?.classList.add('active');
      if (target === 'tab-map') setTimeout(invalidateMapSize, 100);
    });
  });
}

// ─── Tab inicializálás ─────────────────────────────────────────────────────────
function initTabs() {
  const firstTab = document.querySelector('.tab-btn');
  if (firstTab) firstTab.classList.add('active');
  const firstPanel = document.querySelector('.tab-panel');
  if (firstPanel) firstPanel.classList.add('active');
}

// ─── Diatóma hozzáadás ─────────────────────────────────────────────────────────
function addTaxon() {
  const nameInput = document.getElementById('taxon-name');
  const abInput   = document.getElementById('taxon-abundance');
  const name = nameInput?.value.trim();
  const abundance = parseFloat(abInput?.value);

  if (!name) { showToast('Adja meg a fajnevet!', 'error'); return; }
  if (isNaN(abundance) || abundance <= 0) { showToast('Érvényes gyakorisági értéket adjon meg!', 'error'); return; }

  const existing = state.taxa.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.abundance += abundance;
    showToast(`${name} frissítve`, 'info');
  } else {
    state.taxa.push({ name, abundance });
  }

  nameInput.value = '';
  abInput.value = '';
  nameInput.focus();
  refreshTaxaTable();
}

// ─── Táblázat frissítés ────────────────────────────────────────────────────────
function refreshTaxaTable() {
  const tbody = document.getElementById('taxa-tbody');
  if (!tbody) return;

  const total = state.taxa.reduce((s, t) => s + t.abundance, 0);

  if (state.taxa.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.5;padding:1.5rem">Nincs megadott diatóma adat</td></tr>`;
    document.getElementById('taxa-count').textContent = '0 faj';
    return;
  }

  tbody.innerHTML = state.taxa.map((t, i) => {
    const pct = total > 0 ? ((t.abundance / total) * 100).toFixed(1) : '–';
    const isPannonian = !!PANNONIAN_INDICATORS[t.name];
    return `
      <tr class="${isPannonian ? 'row--indicator' : ''}">
        <td><em>${t.name}</em> ${isPannonian ? '<span class="badge badge--geo" title="Pannóniai indikátor">P</span>' : ''}</td>
        <td>
          <input type="number" class="inline-input" value="${t.abundance}" min="0" step="0.1"
            onchange="window.updateTaxonAbundance(${i}, this.value)">
        </td>
        <td>${pct}%</td>
        <td><button class="btn-icon btn-icon--del" onclick="window.removeTaxon(${i})" title="Törlés">✕</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById('taxa-count').textContent = `${state.taxa.length} faj`;

  // Összesítő sor
  const tfoot = document.getElementById('taxa-tfoot');
  if (tfoot) tfoot.innerHTML = `<tr><td><strong>Összesen</strong></td><td><strong>${total.toFixed(1)}</strong></td><td><strong>100%</strong></td><td></td></tr>`;

  // Quick chart preview
  if (state.taxa.length > 0) renderTaxaChart(state.taxa);
}

// Globális függvények a HTML inline handler-ekhez
window.removeTaxon = (i) => { state.taxa.splice(i, 1); refreshTaxaTable(); };
window.updateTaxonAbundance = (i, val) => {
  const v = parseFloat(val);
  if (!isNaN(v) && v >= 0) { state.taxa[i].abundance = v; refreshTaxaTable(); }
};

// ─── Autocomplete ──────────────────────────────────────────────────────────────
function buildAutocomplete() {
  const input = document.getElementById('taxon-name');
  const list = document.getElementById('taxon-autocomplete');
  if (!input || !list) return;

  // Összegyűjtjük az összes ismert fajnevet
  const allNames = Object.keys(PANNONIAN_INDICATORS);

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    list.innerHTML = '';
    if (q.length < 2) { list.style.display = 'none'; return; }

    const matches = allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) { list.style.display = 'none'; return; }

    matches.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = name;
        list.style.display = 'none';
      });
      list.appendChild(li);
    });
    list.style.display = 'block';
  });

  input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
}

// ─── JSON Import ───────────────────────────────────────────────────────────────
function importJSON() {
  const raw = document.getElementById('json-import-area')?.value.trim();
  if (!raw) { showToast('Illesszen be JSON adatot!', 'error'); return; }
  parseAndLoadJSON(raw);
}

function importJSONFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => parseAndLoadJSON(ev.target.result);
  reader.readAsText(file);
}

function parseAndLoadJSON(raw) {
  try {
    const data = JSON.parse(raw);
    let taxa = [];

    // Formátum 1: [{name, abundance}]
    if (Array.isArray(data)) {
      taxa = data.filter(d => d.name && typeof d.abundance === 'number');
    }
    // Formátum 2: {taxa: [...]}
    else if (data.taxa && Array.isArray(data.taxa)) {
      taxa = data.taxa;
      if (data.coords) { state.coords = data.coords; }
      if (data.meta) { state.sampleMeta = data.meta; }
    }
    // Formátum 3: {"FajNév": 25.0, ...}
    else if (typeof data === 'object') {
      taxa = Object.entries(data).map(([name, abundance]) => ({ name, abundance: Number(abundance) }));
    }

    if (taxa.length === 0) { showToast('Nem sikerült értelmezni az adatot!', 'error'); return; }
    state.taxa = taxa;
    refreshTaxaTable();
    showToast(`${taxa.length} faj importálva`, 'success');
  } catch (err) {
    showToast('JSON szintaktikai hiba: ' + err.message, 'error');
  }
}

// ─── JSON Export ───────────────────────────────────────────────────────────────
function exportJSON() {
  if (state.taxa.length === 0) { showToast('Nincs exportálható adat!', 'error'); return; }

  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0',
    coords: state.coords,
    elevation: state.elevation,
    meta: state.sampleMeta,
    taxa: state.taxa,
    results: state.results,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diatom-minta-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Minta exportálva!', 'success');
}

// ─── Elemzés futtatása ─────────────────────────────────────────────────────────
async function runAnalysis() {
  if (state.taxa.length === 0) { showToast('Adjon meg diatóma adatokat!', 'error'); return; }

  setLoading('age-result', true);
  setLoading('wq-result', true);

  const meta = {
    sampleDepthM: parseFloat(document.getElementById('meta-depth')?.value) || null,
    stratigraphicContext: document.getElementById('meta-strat')?.value || '',
  };

  // Kis késleltetés az UX miatt (spinner megjelenik)
  await new Promise(r => setTimeout(r, 50));

  try {
    const ageResult = estimateAge(state.taxa, state.elevation, meta);
    const wqResult  = assessWaterQuality(state.taxa);

    state.results = { age: ageResult, wq: wqResult };

    renderAgeResult(ageResult);
    renderWaterQuality(wqResult);

    // Ugrás az eredmény tabra
    document.querySelector('[data-tab="tab-results"]')?.click();

    showToast('Elemzés kész!', 'success');
  } catch (err) {
    showToast('Elemzési hiba: ' + err.message, 'error');
    console.error(err);
  }
}

// ─── Minta mentése LocalStorage-ba ────────────────────────────────────────────
function saveSample() {
  if (state.taxa.length === 0) { showToast('Nincs mentendő adat!', 'error'); return; }
  const label = prompt('Minta neve:', `Minta ${new Date().toLocaleString('hu-HU')}`) ?? '';
  if (!label) return;

  const sample = {
    id: Date.now(),
    label,
    savedAt: new Date().toISOString(),
    taxa: state.taxa,
    coords: state.coords,
    elevation: state.elevation,
    meta: state.sampleMeta,
    results: state.results,
  };

  state.savedSamples.unshift(sample);
  if (state.savedSamples.length > 20) state.savedSamples.pop();
  localStorage.setItem('diatom_samples', JSON.stringify(state.savedSamples));
  renderSavedSamples();
  showToast(`"${label}" elmentve!`, 'success');
}

function loadSavedSamples() {
  try {
    const raw = localStorage.getItem('diatom_samples');
    if (raw) state.savedSamples = JSON.parse(raw);
  } catch { state.savedSamples = []; }
  renderSavedSamples();
}

function renderSavedSamples() {
  const container = document.getElementById('saved-samples-list');
  if (!container) return;

  if (state.savedSamples.length === 0) {
    container.innerHTML = '<p class="empty-state">Nincsenek mentett minták</p>';
    return;
  }

  container.innerHTML = state.savedSamples.map(s => `
    <div class="saved-sample-card">
      <div class="saved-sample-info">
        <strong>${s.label}</strong>
        <span>${s.taxa.length} faj · ${s.savedAt ? new Date(s.savedAt).toLocaleDateString('hu-HU') : ''}</span>
        ${s.results?.age?.ageMid ? `<span class="age-badge">${s.results.age.ageMid} Ma</span>` : ''}
      </div>
      <div class="saved-sample-actions">
        <button class="btn btn--sm" onclick="window.loadSample(${s.id})">Betöltés</button>
        <button class="btn btn--sm btn--danger" onclick="window.deleteSample(${s.id})">Törlés</button>
      </div>
    </div>
  `).join('');
}

window.loadSample = (id) => {
  const s = state.savedSamples.find(x => x.id === id);
  if (!s) return;
  state.taxa = [...s.taxa];
  state.coords = s.coords;
  state.elevation = s.elevation;
  state.sampleMeta = s.meta ?? {};
  refreshTaxaTable();
  if (s.results) {
    renderAgeResult(s.results.age);
    renderWaterQuality(s.results.wq);
  }
  showToast(`"${s.label}" betöltve`, 'success');
};

window.deleteSample = (id) => {
  state.savedSamples = state.savedSamples.filter(x => x.id !== id);
  localStorage.setItem('diatom_samples', JSON.stringify(state.savedSamples));
  renderSavedSamples();
};

// ─── Indítás ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
