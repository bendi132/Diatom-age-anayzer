/**
 * ui.js — Felhasználói felület megjelenítő modul
 * ============================================================
 * Funkciók:
 *  - renderAgeResult()         – Korbecslés megjelenítés
 *  - renderWaterQuality()      – Vízminőség dashboard
 *  - renderTaxaChart()         – Diatóma eloszlás chart
 *  - renderIndicatorChart()    – Indikátor értékek radar chart
 *  - showToast()               – Értesítések
 *  - toggleTheme()             – Sötét/világos mód
 * ============================================================
 */

'use strict';

import { AGE_RANGES } from './data.js';

let ageChart = null;
let taxaChart = null;
let radarChart = null;
let trophicChart = null;

// ─── Téma váltó ────────────────────────────────────────────────────────────────
export function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = next === 'dark'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Világos`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Sötét`;
}

export function initTheme() {
  const saved = localStorage.getItem('theme') ?? 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
    toggleTheme(); toggleTheme(); // sync icon
  }
}

// ─── Toast értesítések ─────────────────────────────────────────────────────────
export function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container') ?? createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--show'));
  setTimeout(() => { toast.classList.remove('toast--show'); setTimeout(() => toast.remove(), 300); }, duration);
}

function createToastContainer() {
  const div = document.createElement('div');
  div.id = 'toast-container';
  document.body.appendChild(div);
  return div;
}

// ─── Korbecslés megjelenítés ───────────────────────────────────────────────────
export function renderAgeResult(result) {
  const container = document.getElementById('age-result');
  if (!container) return;

  if (result.error) {
    container.innerHTML = `<div class="result-error">${result.error}</div>`;
    return;
  }

  if (result.ageMid === null) {
    container.innerHTML = `<div class="result-warning">${result.warning ?? 'Nem meghatározható.'}</div>`;
    return;
  }

  const epoch = result.geoEpoch;
  const matchPct = (result.matchRatio * 100).toFixed(1);
  const confClass = { 'magas': 'conf--high', 'közepes': 'conf--mid', 'alacsony': 'conf--low' }[result.confidence] ?? 'conf--low';

  container.innerHTML = `
    <div class="age-hero">
      <div class="age-value-block">
        <span class="age-number">${result.ageMid.toFixed(1)}</span>
        <span class="age-unit">millió év</span>
      </div>
      <div class="age-range-block">
        <span class="age-range-label">Tartomány</span>
        <span class="age-range-val">${result.ageMin} – ${result.ageMax} Ma</span>
        <span class="age-uncert">± ${result.uncertainty} Ma</span>
      </div>
    </div>

    <div class="epoch-badge" style="background:${epoch.color}22; border-color:${epoch.color}; color:${epoch.color}">
      <strong>${epoch.name}</strong>
      <span>${epoch.note}</span>
    </div>

    <div class="age-uncertainty-bar">
      ${renderUncertaintyBar(result)}
    </div>

    <div class="age-meta">
      <div class="meta-item">
        <span class="meta-label">Egyező indikátorok</span>
        <span class="meta-value">${result.matchedSpecies.length} faj (${matchPct}%)</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Konfidencia</span>
        <span class="meta-value badge ${confClass}">${result.confidence}</span>
      </div>
      ${result.elevationCorrection ? `
      <div class="meta-item">
        <span class="meta-label">Elevációs korrekció</span>
        <span class="meta-value">+${result.elevationCorrection.correctionMa.toFixed(2)} Ma</span>
      </div>` : ''}
    </div>

    ${result.matchedSpecies.length > 0 ? `
    <details class="matched-species-details">
      <summary>Egyező indikátor fajok (${result.matchedSpecies.length})</summary>
      <table class="species-table">
        <thead><tr><th>Faj</th><th>Relatív %</th><th>Kor tartomány (Ma)</th><th>Súly</th></tr></thead>
        <tbody>
          ${result.matchedSpecies.map(s => `
            <tr>
              <td><em>${s.name}</em></td>
              <td>${(s.rel * 100).toFixed(1)}%</td>
              <td>${s.indicator.ageRange[0]} – ${s.indicator.ageRange[1]}</td>
              <td>${s.indicator.weight}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </details>` : ''}
  `;

  renderAgeTimelineChart(result);
}

/**
 * Bizonytalansági sáv SVG
 */
function renderUncertaintyBar(result) {
  const totalSpan = 60; // Ma skála max
  const barW = 400;
  const x = (v) => (v / totalSpan) * barW;

  const zones = AGE_RANGES.map(r => ({
    ...r,
    x1: x(Math.min(r.min, totalSpan)),
    x2: x(Math.min(r.max, totalSpan)),
  }));

  return `
    <svg viewBox="0 0 ${barW} 48" class="uncert-bar-svg" preserveAspectRatio="xMidYMid meet">
      <!-- Geokronológiai zónák -->
      ${zones.map(z => `<rect x="${z.x1}" y="8" width="${z.x2-z.x1}" height="20" fill="${z.color}" opacity="0.35"/>`).join('')}
      <!-- Bizonytalansági sáv -->
      <rect x="${x(result.ageMin)}" y="10" width="${x(result.ageMax)-x(result.ageMin)}" height="16" fill="${result.geoEpoch?.color ?? '#e0956e'}" opacity="0.7" rx="3"/>
      <!-- Középvonal -->
      <line x1="${x(result.ageMid)}" y1="6" x2="${x(result.ageMid)}" y2="38" stroke="#fff" stroke-width="2"/>
      <!-- Korjelzők -->
      ${[0,5,10,20,30,40,50].map(v => `
        <text x="${x(v)}" y="46" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.6">${v}</text>
        <line x1="${x(v)}" y1="29" x2="${x(v)}" y2="34" stroke="currentColor" opacity="0.3" stroke-width="1"/>
      `).join('')}
      <text x="${barW-2}" y="46" text-anchor="end" font-size="8" fill="currentColor" opacity="0.5">Ma</text>
    </svg>
  `;
}

function renderAgeTimelineChart(result) {
  const ctx = document.getElementById('age-chart');
  if (!ctx) return;
  if (ageChart) { ageChart.destroy(); ageChart = null; }

  const matched = result.matchedSpecies.slice(0, 8);
  ageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matched.map(s => s.name.split(' ').slice(0, 2).join(' ')),
      datasets: [
        {
          label: 'Kor minimum (Ma)',
          data: matched.map(s => s.indicator.ageRange[0]),
          backgroundColor: 'rgba(42, 157, 143, 0.4)',
          borderColor: '#2a9d8f',
          borderWidth: 1,
        },
        {
          label: 'Kor maximum (Ma)',
          data: matched.map(s => s.indicator.ageRange[1]),
          backgroundColor: 'rgba(224, 149, 110, 0.4)',
          borderColor: '#e0956e',
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'var(--text-primary)', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} Ma` } },
      },
      scales: {
        x: {
          title: { display: true, text: 'Millió év (Ma)', color: 'var(--text-secondary)' },
          ticks: { color: 'var(--text-secondary)' },
          grid: { color: 'var(--border-color)' },
        },
        y: {
          ticks: { color: 'var(--text-secondary)', font: { style: 'italic', size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Vízminőség megjelenítés ───────────────────────────────────────────────────
export function renderWaterQuality(wq) {
  const container = document.getElementById('wq-result');
  if (!container) return;

  if (wq.error) {
    container.innerHTML = `<div class="result-error">${wq.error}</div>`;
    return;
  }

  const { ips, diTp, diPh, spear, trophic, hazard, overall } = wq;

  container.innerHTML = `
    <div class="wq-overall" style="border-color:${overall.color}">
      <div class="wq-score" style="color:${overall.color}">${overall.score ?? '–'}</div>
      <div class="wq-label">${overall.label}</div>
    </div>

    <div class="wq-grid">
      ${renderIndexCard('IPS Index',
        ips.score !== null ? ips.score.toFixed(1) + ' / 20' : '–',
        ips.class?.label ?? '–',
        ips.class?.color ?? '#888',
        'Fajspecifikus szennyezésérzékenységi index. Minél magasabb, annál jobb a vízminőség.',
        ips.coverage !== null ? `Lefedettség: ${(ips.coverage*100).toFixed(0)}%` : ''
      )}

      ${renderIndexCard('DI-TP',
        diTp.value !== null ? diTp.value + ' µg/L' : '–',
        diTp.class?.label ?? '–',
        diTp.class?.color ?? '#888',
        'Diátoma-alapú totalfoszfor becslés. Alacsonyabb érték = oligotrofikusabb víz.',
        diTp.coverage !== null ? `Lefedettség: ${(diTp.coverage*100).toFixed(0)}%` : ''
      )}

      ${renderIndexCard('DI-pH',
        diPh.value !== null ? diPh.value : '–',
        diPh.class?.label ?? '–',
        diPh.class?.color ?? '#888',
        'Diátoma-alapú pH becslés a víz savasságáról.',
        diPh.coverage !== null ? `Lefedettség: ${(diPh.coverage*100).toFixed(0)}%` : ''
      )}

      ${renderIndexCard('SPEAR%',
        spear.pct + '%',
        spear.pressureLevel,
        spear.color,
        'Peszticidérzékeny fajok aránya. Magasabb % = kisebb peszticidterhelés.',
        `${spear.sensitiveSpecies.length} érzékeny faj`
      )}
    </div>

    <div class="trophic-section">
      <h4>Trofikus összetétel <span class="tooltip-icon" title="O=oligotróf, M=mezotróf, E=eutróf">ⓘ</span></h4>
      <div class="trophic-state">${trophic.state}</div>
      <div class="trophic-bars">
        ${renderTrophicBars(trophic.pct)}
      </div>
    </div>

    ${hazard.hazardous.length > 0 ? `
    <div class="hazard-section">
      <h4 class="hazard-title">⚠ Káros fajok (${hazard.hazardous.length})</h4>
      <div class="hazard-risk">Kockázati szint: <strong>${hazard.riskLevel}</strong></div>
      <div class="hazard-list">
        ${hazard.hazardous.map(h => `
          <div class="hazard-item sev-${h.severity}">
            <em>${h.name}</em>
            <span class="hazard-tags">
              ${h.toxicHigh ? '<span class="tag tag--danger">Toxikus (magas)</span>' : ''}
              ${h.toxic && !h.toxicHigh ? '<span class="tag tag--warn">Toxikus</span>' : ''}
              ${h.gillDamage ? '<span class="tag tag--warn">Kopoltyú-károsító</span>' : ''}
              ${h.bloom ? '<span class="tag tag--info">Virágzás-kockázat</span>' : ''}
            </span>
          </div>
        `).join('')}
      </div>
    </div>` : '<div class="no-hazard">✓ Nem azonosítottak ismert káros fajt</div>'}
  `;

  renderRadarChart(wq);
  renderTrophicChart(trophic.pct);
}

function renderIndexCard(title, value, label, color, tooltip, sub) {
  return `
    <div class="index-card" style="--card-accent:${color}">
      <div class="index-card__header">
        <span class="index-card__title">${title}</span>
        <span class="tooltip-icon" title="${tooltip}">ⓘ</span>
      </div>
      <div class="index-card__value">${value}</div>
      <div class="index-card__label" style="color:${color}">${label}</div>
      ${sub ? `<div class="index-card__sub">${sub}</div>` : ''}
    </div>
  `;
}

function renderTrophicBars(pct) {
  const cats = [
    { key: 'O', label: 'Oligotróf', color: '#2a9d8f' },
    { key: 'M', label: 'Mezotróf', color: '#f4a261' },
    { key: 'E', label: 'Eutróf', color: '#c1121f' },
    { key: 'unknown', label: 'Ismeretlen', color: '#666' },
  ];
  return cats.map(c => `
    <div class="trophic-bar-row">
      <span class="trophic-bar-label">${c.label}</span>
      <div class="trophic-bar-track">
        <div class="trophic-bar-fill" style="width:${pct[c.key]}%;background:${c.color}"></div>
      </div>
      <span class="trophic-bar-pct">${pct[c.key]}%</span>
    </div>
  `).join('');
}

function renderRadarChart(wq) {
  const ctx = document.getElementById('radar-chart');
  if (!ctx) return;
  if (radarChart) { radarChart.destroy(); radarChart = null; }

  const ipsNorm = wq.ips.score !== null ? (wq.ips.score / 20) * 100 : 0;
  const tpNorm = wq.diTp.value !== null ? Math.max(0, 100 - wq.diTp.value) : 0;
  const phNorm = wq.diPh.value !== null ? (wq.diPh.value <= 8.5 && wq.diPh.value >= 6.5 ? 100 : 50) : 0;
  const spearNorm = wq.spear.pct ?? 0;
  const hazardNorm = Math.max(0, 100 - wq.hazard.hazardScore * 20);

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['IPS', 'DI-TP', 'DI-pH', 'SPEAR', 'Kockázatmentesség'],
      datasets: [{
        label: 'Vízminőség profil',
        data: [ipsNorm, tpNorm, phNorm, spearNorm, hazardNorm],
        backgroundColor: 'rgba(42, 157, 143, 0.2)',
        borderColor: '#2a9d8f',
        pointBackgroundColor: '#2a9d8f',
        borderWidth: 2,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { color: 'var(--text-secondary)', backdropColor: 'transparent', stepSize: 25 },
          grid: { color: 'var(--border-color)' },
          pointLabels: { color: 'var(--text-primary)', font: { size: 11 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.raw.toFixed(1)}` } },
      },
    },
  });
}

function renderTrophicChart(pct) {
  const ctx = document.getElementById('trophic-chart');
  if (!ctx) return;
  if (trophicChart) { trophicChart.destroy(); trophicChart = null; }

  trophicChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Oligotróf', 'Mezotróf', 'Eutróf', 'Ismeretlen'],
      datasets: [{
        data: [pct.O, pct.M, pct.E, pct.unknown],
        backgroundColor: ['#2a9d8f', '#f4a261', '#c1121f', '#555'],
        borderColor: 'var(--surface-2)',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { color: 'var(--text-primary)', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.raw}%` } },
      },
    },
  });
}

// ─── Diatóma eloszlás chart ────────────────────────────────────────────────────
export function renderTaxaChart(taxa) {
  const ctx = document.getElementById('taxa-chart');
  if (!ctx) return;
  if (taxaChart) { taxaChart.destroy(); taxaChart = null; }

  const sorted = [...taxa].sort((a, b) => b.abundance - a.abundance).slice(0, 15);
  const palette = [
    '#2a9d8f','#e9c46a','#e76f51','#264653','#57cc99',
    '#f4a261','#023e8a','#48cae4','#b5838d','#6d6875',
    '#c77dff','#80b918','#fb5607','#ffbe0b','#3a86ff',
  ];

  taxaChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(t => t.name.split(' ').slice(0, 2).join(' ')),
      datasets: [{
        label: 'Relatív gyakoriság (%)',
        data: sorted.map(t => t.abundance),
        backgroundColor: sorted.map((_, i) => palette[i % palette.length] + 'bb'),
        borderColor: sorted.map((_, i) => palette[i % palette.length]),
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.raw.toFixed(1)}%` } },
      },
      scales: {
        x: {
          ticks: { color: 'var(--text-secondary)', font: { style: 'italic', size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: '%', color: 'var(--text-secondary)' },
          ticks: { color: 'var(--text-secondary)' },
          grid: { color: 'var(--border-color)' },
        },
      },
    },
  });
}

// ─── Betöltési állapot ─────────────────────────────────────────────────────────
export function setLoading(sectionId, isLoading) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  if (isLoading) {
    el.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><span>Számítás folyamatban…</span></div>`;
  }
}
