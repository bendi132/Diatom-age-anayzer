/**
 * data.js — Adatbázis kezelő modul
 * ============================================================
 * Feladatok:
 *  - A species.json betöltése és lokálisan elérhetővé tétele
 *  - Pannon-specifikus indikátor fajok definíciója (korbecsléshez)
 *  - Segédfüggvények az adatbázis lekérdezéséhez
 *
 * Bővítési pontok:
 *  - Új fajlisták hozzáadása a PANNONIAN_INDICATORS-hoz
 *  - Új korintervallumaok definiálása az AGE_RANGES-ben
 * ============================================================
 */

'use strict';

// ─── Pannon-specifikus indikátor fajok ────────────────────────────────────────
// Forrás: Magyar Természettudományi Múzeum, Pannoniai rétegtan
// Minden fajhoz: ageRange [Ma min, Ma max], weight (fontosság 1–3)
const PANNONIAN_INDICATORS = {
  // ── Pannon-endemikus fajok (csak a Pannon-tengerből ismertek) ──────────────
  'Cyclotella balatonis':          { ageRange: [5.3, 11.6], weight: 3, habitat: 'lake', note: 'Pannon-endemikus; tipikus tavi forma' },
  'Cyclotella pannonicoides':      { ageRange: [5.3, 10.0], weight: 3, habitat: 'lake', note: 'Pannon-endemikus; mélyvízi indikátor' },
  'Aulacoseira balatonis':         { ageRange: [5.3, 11.6], weight: 3, habitat: 'lake', note: 'Pannon-endemikus láncos koova' },
  'Actinocyclus ingens':           { ageRange: [5.3, 13.8], weight: 2, habitat: 'brackish', note: 'Szarmata–Pannon átmenet' },

  // ── Szarmata–Pannon átmenet (félsósvízi fajok visszahúzódása) ─────────────
  'Cyclotella comta':              { ageRange: [5.3, 23.0], weight: 2, habitat: 'lake', note: 'Oligocéntől Pannoniáig jelen' },
  'Melosira granulata':            { ageRange: [0.0, 23.0],  weight: 1, habitat: 'river', note: 'Hosszú tartományú; gyenge indikátor' },
  'Stephanodiscus niagarae':       { ageRange: [1.8, 11.6], weight: 2, habitat: 'lake', note: 'Neogén tavi faj' },
  'Stephanodiscus hantzschii':     { ageRange: [0.0, 5.3],  weight: 2, habitat: 'eutrophic', note: 'Fiatal eutrof tavak' },
  'Stephanodiscus parvus':         { ageRange: [0.0, 2.6],  weight: 2, habitat: 'eutrophic', note: 'Kvarter indikátor' },

  // ── Neogén széles tartományú formák ───────────────────────────────────────
  'Aulacoseira ambigua':           { ageRange: [0.0, 11.6], weight: 1, habitat: 'river', note: 'Neogén folyóvízi alak' },
  'Aulacoseira granulata':         { ageRange: [0.0, 11.6], weight: 1, habitat: 'lake', note: 'Neogén tavi alak' },
  'Aulacoseira islandica':         { ageRange: [0.0, 2.6],  weight: 2, habitat: 'lake', note: 'Kvarter hideg tavi forma' },
  'Cyclotella ocellata':           { ageRange: [0.0, 5.3],  weight: 1, habitat: 'lake', note: 'Plio–Kvarter tavi forma' },
  'Cyclotella distinguenda':       { ageRange: [0.0, 11.6], weight: 1, habitat: 'lake', note: 'Neogén oligotróf tavi alak' },

  // ── Miocén–Oligocén formák (idősebb üledékekben) ──────────────────────────
  'Coscinodiscus radiatus':        { ageRange: [11.6, 33.9], weight: 3, habitat: 'marine', note: 'Eocén–Miocén tengeri alak' },
  'Coscinodiscus granii':          { ageRange: [5.3, 33.9],  weight: 2, habitat: 'marine', note: 'Tengeri; Oligocéntől' },
  'Rhizosolenia styliformis':      { ageRange: [11.6, 33.9], weight: 2, habitat: 'marine', note: 'Kora-Miocén tengeri' },
  'Chaetoceros messanensis':       { ageRange: [5.3, 23.0],  weight: 2, habitat: 'marine', note: 'Oligocén–Pannon tengeri' },
  'Pyxilla gracilis':              { ageRange: [23.0, 55.8], weight: 3, habitat: 'marine', note: 'Eocén–Oligocén tengeri rétegek' },

  // ── Általános édesvízi formák (nem specifikus korindeikátorok) ─────────────
  'Navicula radiosa':              { ageRange: [0.0, 23.0], weight: 1, habitat: 'river', note: 'Általános édesvízi alak' },
  'Achnanthidium minutissimum':    { ageRange: [0.0, 23.0], weight: 1, habitat: 'stream', note: 'Általános indikátor' },
};

// ── Korintervallumok nevei (geokronológiai skála) ─────────────────────────────
const AGE_RANGES = [
  { name: 'Kvarter',        min: 0,    max: 2.6,  color: '#a8d8a8', note: 'Pleisztocén–Holocén' },
  { name: 'Pliocén',        min: 2.6,  max: 5.3,  color: '#f0c989', note: 'Zanclean–Piacenzian' },
  { name: 'Késő-Miocén',    min: 5.3,  max: 11.6, color: '#e0956e', note: 'Pannóniai emelet' },
  { name: 'Közép-Miocén',   min: 11.6, max: 16.0, color: '#c97752', note: 'Szarmata–Badeni' },
  { name: 'Kora-Miocén',    min: 16.0, max: 23.0, color: '#b05030', note: 'Burdigalian–Aquitanian' },
  { name: 'Oligocén',       min: 23.0, max: 33.9, color: '#8a3520', note: 'Rupelian–Chattian' },
  { name: 'Eocén',          min: 33.9, max: 55.8, color: '#5a1505', note: 'Ypresian–Priabonian' },
];

// ── Magassági korrekciós tényező (Bakony–Mecsek–Dunántúli-dombság) ────────────
// Kalibrálás: ~200m / Ma emelkedési ráta a Pannon-medencében (közelítő érték)
const ELEVATION_UPLIFT_RATE_M_PER_MA = 180; // m / millió év

// ─── Globális adatbázis tároló ─────────────────────────────────────────────────
let SPECIES_DB = null;
let DB_LOAD_PROMISE = null;

/**
 * Betölti a species.json-t és eltárolja a SPECIES_DB-be.
 * @returns {Promise<Object>} Az adatbázis objektum
 */
async function loadSpeciesDB() {
  if (SPECIES_DB) return SPECIES_DB;
  if (DB_LOAD_PROMISE) return DB_LOAD_PROMISE;

  DB_LOAD_PROMISE = fetch('./data/species.json')
    .then(r => {
      if (!r.ok) throw new Error('Nem sikerült betölteni a species.json-t');
      return r.json();
    })
    .then(data => {
      SPECIES_DB = data;
      console.info('[data.js] Species DB betöltve:', Object.keys(data));
      return data;
    });

  return DB_LOAD_PROMISE;
}

/**
 * Lekérdezi egy faj IPS érzékenységi értékeit.
 * @param {string} name - Fajnév
 * @returns {{ s: number, v: number }|null}
 */
function getIPSSensitivity(name) {
  if (!SPECIES_DB) return null;
  return SPECIES_DB.sensitivityDB?.[name] ?? null;
}

/**
 * Lekérdezi egy faj DI-TP optimumát (µg/L).
 * @param {string} name - Fajnév
 * @returns {number|null}
 */
function getDiTpOptimum(name) {
  if (!SPECIES_DB) return null;
  return SPECIES_DB.diTpOptima?.[name] ?? null;
}

/**
 * Lekérdezi egy faj DI-pH optimumát.
 * @param {string} name - Fajnév
 * @returns {number|null}
 */
function getDiPhOptimum(name) {
  if (!SPECIES_DB) return null;
  return SPECIES_DB.diPhOptima?.[name] ?? null;
}

/**
 * Megállapítja, hogy egy faj SPEAR-érzékeny-e.
 * @param {string} name - Fajnév
 * @returns {boolean}
 */
function isSpearSensitive(name) {
  if (!SPECIES_DB) return false;
  return SPECIES_DB.spearSensitive?.includes(name) ?? false;
}

/**
 * Megállapítja, hogy egy faj trofikus kategóriája.
 * O = oligotróf, M = mezotróf, E = eutróf
 * @param {string} name
 * @returns {string|null}
 */
function getTrophicCategory(name) {
  if (!SPECIES_DB) return null;
  return SPECIES_DB.trophicDB?.[name] ?? null;
}

/**
 * Megállapítja, hogy a faj káros-e (mérgező / kopoltyú-károsító / virágzást okozó).
 * @param {string} name
 * @returns {{ toxic: boolean, gillDamage: boolean, bloom: boolean, toxicHigh: boolean }}
 */
function getHazardProfile(name) {
  if (!SPECIES_DB) return { toxic: false, gillDamage: false, bloom: false, toxicHigh: false };
  return {
    toxic:      SPECIES_DB.toxicDB?.includes(name) ?? false,
    gillDamage: SPECIES_DB.gillDamageDB?.includes(name) ?? false,
    bloom:      SPECIES_DB.gillBloomDB?.includes(name) ?? false,
    toxicHigh:  SPECIES_DB.toxicHighDB?.includes(name) ?? false,
  };
}

/**
 * Visszaadja a faj wEFRF habitat és funkcionális adatait.
 * @param {string} name
 * @returns {{ habitat: string, wH: number, type: string, wT: number }|null}
 */
function getWefrfData(name) {
  if (!SPECIES_DB) return null;
  const h = SPECIES_DB.wefrfHabitatDB?.[name];
  const f = SPECIES_DB.wefrfFunctionalDB?.[name];
  if (!h || !f) return null;
  return { habitat: h.h, wH: h.wH, type: f.t, wT: f.wT };
}

export {
  loadSpeciesDB,
  getIPSSensitivity,
  getDiTpOptimum,
  getDiPhOptimum,
  isSpearSensitive,
  getTrophicCategory,
  getHazardProfile,
  getWefrfData,
  PANNONIAN_INDICATORS,
  AGE_RANGES,
  ELEVATION_UPLIFT_RATE_M_PER_MA,
};
