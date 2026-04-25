/**
 * model.js — Korbecslő és vízminőség-értékelő modell
 * ============================================================
 * Tartalom:
 *  1. estimateAge()        – Szabályalapú + súlyozott korbecslés
 *  2. assessWaterQuality() – IPS, DI-TP, DI-pH, SPEAR, trofikus indexek
 *  3. computeTrophicIndex()– Trofikus összetétel elemzés
 *  4. computeHazardScore() – Káros fajok értékelése
 *
 * A korbecslő modell működése:
 *  - Minden megadott diatóma fajt összehasonlít a PANNONIAN_INDICATORS-szal
 *  - Súlyozott konfidencia-intervallumot számol (kor minimum/maximum)
 *  - A becsült kort a relatív gyakorisággal és az indikátor súlyával korrigálja
 *  - Az elevációs korrekció az izosztatikus emelkedési rátán alapul (~180 m/Ma)
 *
 * Bővítési pontok:
 *  - Bayes-i prior hozzáadása a PANNONIAN_INDICATORS-ban megadott tartományokhoz
 *  - Litológiai kontextus (CaCO3 %, TOC) bevonása
 *  - Több lelőhely összehasonlítása clusteringgel
 * ============================================================
 */

'use strict';

import {
  getIPSSensitivity,
  getDiTpOptimum,
  getDiPhOptimum,
  isSpearSensitive,
  getTrophicCategory,
  getHazardProfile,
  PANNONIAN_INDICATORS,
  AGE_RANGES,
  ELEVATION_UPLIFT_RATE_M_PER_MA,
} from './data.js';

// ─── Konstansok ────────────────────────────────────────────────────────────────

/** IPS index értelmezési küszöbök */
const IPS_CLASSES = [
  { label: 'Kiváló',   min: 17, max: 20, color: '#2a9d8f', badge: 'I' },
  { label: 'Jó',       min: 13, max: 17, color: '#57cc99', badge: 'II' },
  { label: 'Közepes',  min: 9,  max: 13, color: '#f4a261', badge: 'III' },
  { label: 'Gyenge',   min: 5,  max: 9,  color: '#e76f51', badge: 'IV' },
  { label: 'Rossz',    min: 0,  max: 5,  color: '#c1121f', badge: 'V' },
];

/** DI-TP kategóriák (µg/L totalfoszfor) */
const DITP_CLASSES = [
  { label: 'Oligotróf',        max: 10,  color: '#2a9d8f' },
  { label: 'Mezotróf',         max: 25,  color: '#57cc99' },
  { label: 'Eutróf',           max: 75,  color: '#f4a261' },
  { label: 'Hipertróf',        max: 999, color: '#c1121f' },
];

/** DI-pH kategóriák */
const DIPH_CLASSES = [
  { label: 'Savas (pH<6)',        max: 6.0,  color: '#e76f51' },
  { label: 'Enyhén savas',        max: 6.8,  color: '#f4a261' },
  { label: 'Semleges',            max: 7.5,  color: '#57cc99' },
  { label: 'Lúgos',               max: 8.5,  color: '#2a9d8f' },
  { label: 'Erősen lúgos (>8.5)', max: 14,   color: '#e9c46a' },
];

// ─── 1. Korbecslő modell ───────────────────────────────────────────────────────

/**
 * Megbecsüli a minta korát a diatóma asszociáció és az eleváció alapján.
 *
 * @param {Array<{name: string, abundance: number}>} taxa – Diatóma lista
 * @param {number|null} elevationM – Magasság tengerszint felett (méter)
 * @param {Object} opts – Opcionális metaadatok
 * @param {number} [opts.sampleDepthM] – Mintamélység
 * @param {string} [opts.stratigraphicContext] – Szöveges rétegtani kontextus
 * @returns {Object} Korbecslési eredmény
 */
function estimateAge(taxa, elevationM = null, opts = {}) {
  if (!taxa || taxa.length === 0) {
    return { error: 'Nincs diatóma adat a korbecsléshez.' };
  }

  const totalAbundance = taxa.reduce((s, t) => s + t.abundance, 0);
  if (totalAbundance === 0) return { error: 'Az összes relatív gyakoriság nulla.' };

  // ── Súlyozott intervallum számítás ──────────────────────────────────────────
  let weightedMinSum = 0;
  let weightedMaxSum = 0;
  let totalWeight = 0;
  const matchedSpecies = [];
  const unmatchedSpecies = [];

  for (const taxon of taxa) {
    const rel = taxon.abundance / totalAbundance; // relatív arány (0–1)
    const indicator = PANNONIAN_INDICATORS[taxon.name];

    if (indicator) {
      const w = indicator.weight * rel;
      weightedMinSum += indicator.ageRange[0] * w;
      weightedMaxSum += indicator.ageRange[1] * w;
      totalWeight += w;
      matchedSpecies.push({ ...taxon, indicator, rel });
    } else {
      unmatchedSpecies.push(taxon);
    }
  }

  // Nincs egyező indikátor faj → nem meghatározható
  if (totalWeight === 0) {
    return {
      ageMin: null, ageMax: null, ageMid: null,
      uncertainty: null,
      matchedSpecies: [],
      unmatchedSpecies,
      matchRatio: 0,
      geoEpoch: null,
      elevationCorrection: null,
      warning: 'Egy ismert Pannon-indikátor sem található a mintában. A korbecslés nem lehetséges.',
    };
  }

  let ageMin = weightedMinSum / totalWeight;
  let ageMax = weightedMaxSum / totalWeight;

  // Belső konzisztencia
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];

  // ── Elevációs korrekció ──────────────────────────────────────────────────────
  let elevationCorrection = null;
  let elevCorrMa = 0;
  if (elevationM !== null && elevationM > 0) {
    // Szimplifikált izosztatikus korrekció:
    // magasabb pont → régebben üledékképződés → korábbi kor
    elevCorrMa = elevationM / ELEVATION_UPLIFT_RATE_M_PER_MA;
    ageMin = Math.max(0, ageMin + elevCorrMa * 0.5);
    ageMax = ageMax + elevCorrMa * 0.5;
    elevationCorrection = {
      elevationM,
      correctionMa: elevCorrMa,
      note: `+${elevCorrMa.toFixed(2)} Ma korrekció a ~${elevationM}m magasság alapján`,
    };
  }

  const ageMid = (ageMin + ageMax) / 2;
  const uncertainty = (ageMax - ageMin) / 2;

  // ── Geokronológiai egység hozzárendelés ─────────────────────────────────────
  const geoEpoch = AGE_RANGES.find(r => ageMid >= r.min && ageMid < r.max) ?? AGE_RANGES[AGE_RANGES.length - 1];

  // ── Megbízhatóság (match ratio) ─────────────────────────────────────────────
  const matchedAbundance = matchedSpecies.reduce((s, t) => s + t.abundance, 0);
  const matchRatio = matchedAbundance / totalAbundance;

  // ── Konfidencia szint ───────────────────────────────────────────────────────
  let confidence = 'alacsony';
  if (matchRatio > 0.5 && matchedSpecies.length >= 3) confidence = 'közepes';
  if (matchRatio > 0.7 && matchedSpecies.length >= 5) confidence = 'magas';

  return {
    ageMin: +ageMin.toFixed(2),
    ageMax: +ageMax.toFixed(2),
    ageMid: +ageMid.toFixed(2),
    uncertainty: +uncertainty.toFixed(2),
    geoEpoch,
    matchedSpecies,
    unmatchedSpecies,
    matchRatio: +matchRatio.toFixed(3),
    confidence,
    elevationCorrection,
    totalWeight: +totalWeight.toFixed(4),
  };
}

// ─── 2. Vízminőség értékelés ──────────────────────────────────────────────────

/**
 * Átfogó vízminőség értékelést végez.
 * @param {Array<{name: string, abundance: number}>} taxa
 * @returns {Object} Vízminőségi eredmény objektum
 */
function assessWaterQuality(taxa) {
  if (!taxa || taxa.length === 0) {
    return { error: 'Nincs diatóma adat a vízminőség értékeléshez.' };
  }

  const totalAbundance = taxa.reduce((s, t) => s + t.abundance, 0);
  if (totalAbundance === 0) return { error: 'Az összes relatív gyakoriság nulla.' };

  return {
    ips: computeIPS(taxa, totalAbundance),
    diTp: computeDiTP(taxa, totalAbundance),
    diPh: computeDiPH(taxa, totalAbundance),
    spear: computeSPEAR(taxa, totalAbundance),
    trophic: computeTrophicIndex(taxa, totalAbundance),
    hazard: computeHazardScore(taxa),
    overall: computeOverallScore(taxa, totalAbundance),
  };
}

/**
 * IPS (Indice de Polluosensibilité Spécifique) index számítás.
 * Képlet: IPS = (Σ(si * vi * Ai)) / (Σ(vi * Ai)) × 20
 * ahol si = érzékenység (1–5), vi = variancia súly (1–3), Ai = relatív arány
 */
function computeIPS(taxa, total) {
  let numerator = 0;
  let denominator = 0;
  let coverage = 0;
  const details = [];

  for (const taxon of taxa) {
    const sens = getIPSSensitivity(taxon.name);
    if (!sens) continue;
    const rel = taxon.abundance / total;
    const contrib = sens.s * sens.v * rel;
    numerator += contrib;
    denominator += sens.v * rel;
    coverage += rel;
    details.push({ name: taxon.name, abundance: taxon.abundance, rel, s: sens.s, v: sens.v, contrib });
  }

  if (denominator === 0) return { score: null, class: null, coverage: 0, details: [] };

  const score = (numerator / denominator) * 20;
  const cls = IPS_CLASSES.find(c => score >= c.min && score <= c.max) ?? IPS_CLASSES[IPS_CLASSES.length - 1];

  return {
    score: +score.toFixed(2),
    class: cls,
    coverage: +coverage.toFixed(3),
    details: details.sort((a, b) => b.contrib - a.contrib).slice(0, 10),
  };
}

/**
 * DI-TP index (diátoma-alapú totalfoszfor becslés, µg/L).
 * Súlyozott átlag a diTpOptima értékeken.
 */
function computeDiTP(taxa, total) {
  let numerator = 0;
  let denominator = 0;

  for (const taxon of taxa) {
    const opt = getDiTpOptimum(taxon.name);
    if (opt === null) continue;
    const rel = taxon.abundance / total;
    numerator += opt * rel;
    denominator += rel;
  }

  if (denominator === 0) return { value: null, class: null, coverage: 0 };

  const value = numerator / denominator;
  const cls = DITP_CLASSES.find(c => value <= c.max) ?? DITP_CLASSES[DITP_CLASSES.length - 1];

  return { value: +value.toFixed(1), class: cls, coverage: +denominator.toFixed(3) };
}

/**
 * DI-pH index (diátoma-alapú pH becslés).
 */
function computeDiPH(taxa, total) {
  let numerator = 0;
  let denominator = 0;

  for (const taxon of taxa) {
    const opt = getDiPhOptimum(taxon.name);
    if (opt === null) continue;
    const rel = taxon.abundance / total;
    numerator += opt * rel;
    denominator += rel;
  }

  if (denominator === 0) return { value: null, class: null, coverage: 0 };

  const value = numerator / denominator;
  const cls = DIPH_CLASSES.find(c => value <= c.max) ?? DIPH_CLASSES[DIPH_CLASSES.length - 1];

  return { value: +value.toFixed(2), class: cls, coverage: +denominator.toFixed(3) };
}

/**
 * SPEAR_diatoms – peszticid-terhelés indikátor.
 * SPEAR% = (Σ relatív abundance a SPEAR-érzékeny fajoknál) × 100
 * Küszöbök: >33% = erős terhelés, 11–33% = közepes, <11% = alacsony
 */
function computeSPEAR(taxa, total) {
  let sensitiveAbundance = 0;
  const sensitiveSpecies = [];

  for (const taxon of taxa) {
    if (isSpearSensitive(taxon.name)) {
      sensitiveAbundance += taxon.abundance;
      sensitiveSpecies.push(taxon.name);
    }
  }

  const pct = (sensitiveAbundance / total) * 100;
  let pressureLevel, color;
  if (pct > 33) { pressureLevel = 'Alacsony peszticidterhelés'; color = '#2a9d8f'; }
  else if (pct > 11) { pressureLevel = 'Közepes peszticidterhelés'; color = '#f4a261'; }
  else { pressureLevel = 'Magas peszticidterhelés'; color = '#c1121f'; }

  return { pct: +pct.toFixed(1), pressureLevel, color, sensitiveSpecies };
}

/**
 * Trofikus összetétel elemzés.
 * O = oligotróf, M = mezotróf, E = eutróf
 */
function computeTrophicIndex(taxa, total) {
  const counts = { O: 0, M: 0, E: 0, unknown: 0 };
  const abund  = { O: 0, M: 0, E: 0, unknown: 0 };

  for (const taxon of taxa) {
    const cat = getTrophicCategory(taxon.name) ?? 'unknown';
    const key = counts.hasOwnProperty(cat) ? cat : 'unknown';
    counts[key]++;
    abund[key] += taxon.abundance;
  }

  const pct = {};
  for (const k of ['O', 'M', 'E', 'unknown']) {
    pct[k] = +((abund[k] / total) * 100).toFixed(1);
  }

  // Trofikus state meghatározás
  let state;
  if (pct.O > 50) state = 'Oligotróf';
  else if (pct.E > 50) state = 'Eutróf';
  else if (pct.M > 40) state = 'Mezotróf';
  else state = 'Átmeneti';

  return { counts, abundance: abund, pct, state };
}

/**
 * Káros fajok elemzése.
 */
function computeHazardScore(taxa) {
  const hazardous = [];
  let hazardScore = 0;

  for (const taxon of taxa) {
    const h = getHazardProfile(taxon.name);
    if (h.toxic || h.gillDamage || h.bloom) {
      const severity = h.toxicHigh ? 3 : h.toxic ? 2 : h.gillDamage ? 2 : 1;
      hazardous.push({ name: taxon.name, abundance: taxon.abundance, ...h, severity });
      hazardScore += severity * (taxon.abundance / 100);
    }
  }

  let riskLevel;
  if (hazardScore === 0) riskLevel = 'Elhanyagolható';
  else if (hazardScore < 1) riskLevel = 'Alacsony';
  else if (hazardScore < 3) riskLevel = 'Közepes';
  else riskLevel = 'Magas';

  return { hazardous, hazardScore: +hazardScore.toFixed(2), riskLevel };
}

/**
 * Összesített vízminőségi pontszám (0–100).
 */
function computeOverallScore(taxa, total) {
  const ips = computeIPS(taxa, total);
  const diTp = computeDiTP(taxa, total);
  const spear = computeSPEAR(taxa, total);

  let score = 0;
  let count = 0;

  if (ips.score !== null) {
    score += (ips.score / 20) * 100;
    count++;
  }
  if (diTp.value !== null) {
    // DI-TP: alacsonyabb = jobb, normalizálva 0–100 µg/L skálán
    const tpScore = Math.max(0, 100 - diTp.value);
    score += tpScore;
    count++;
  }
  if (spear.pct !== null) {
    score += spear.pct; // SPEAR% = magasabb érzékeny faj arány = jobb
    count++;
  }

  if (count === 0) return { score: null, label: 'Ismeretlen' };
  const finalScore = score / count;

  let label, color;
  if (finalScore >= 75) { label = 'Jó ökológiai állapot'; color = '#2a9d8f'; }
  else if (finalScore >= 50) { label = 'Közepes ökológiai állapot'; color = '#f4a261'; }
  else if (finalScore >= 25) { label = 'Gyenge ökológiai állapot'; color = '#e76f51'; }
  else { label = 'Rossz ökológiai állapot'; color = '#c1121f'; }

  return { score: +finalScore.toFixed(1), label, color };
}

export {
  estimateAge,
  assessWaterQuality,
  computeIPS,
  computeDiTP,
  computeDiPH,
  computeSPEAR,
  computeTrophicIndex,
  computeHazardScore,
  IPS_CLASSES,
  DITP_CLASSES,
  DIPH_CLASSES,
};
