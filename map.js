/**
 * map.js — Térképes integráció és magasság-lekérdezés
 * ============================================================
 * - OpenStreetMap + Leaflet.js térkép
 * - Kattintásra koordináta kiolvasás
 * - Open-Elevation API (ingyenes) magasságadathoz
 * - Fallback: kézi magasságbevitel
 *
 * Bővítési pont: Google Maps Elevation API kulcs megadásával
 *   cseréld le a fetchElevation() belső URL-jét.
 * ============================================================
 */

'use strict';

let map = null;
let marker = null;
let currentCoords = null;
let onCoordsChangeCallback = null;

const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';

/**
 * Inicializálja a Leaflet térképet.
 * @param {string} containerId – A DOM elem azonosítója
 * @param {Function} onCoordsChange – Callback(lat, lon, elevationM)
 */
function initMap(containerId, onCoordsChange) {
  onCoordsChangeCallback = onCoordsChange;

  // Közép-Európa (Pannon-medence) alapnézet
  map = L.map(containerId, {
    center: [47.1, 18.0],
    zoom: 7,
    zoomControl: true,
  });

  // OpenStreetMap tile réteg
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  // Egyedi marker ikon
  const customIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="marker-pin"><div class="marker-pulse"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  // Kattintás eseménykezelő
  map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    setMarker(lat, lng, customIcon);
    await updateCoords(lat, lng);
  });
}

/**
 * Markert helyez a térképre.
 */
function setMarker(lat, lon, icon) {
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lon], { icon: icon ?? L.Icon.Default.prototype }).addTo(map);
  map.panTo([lat, lon]);
}

/**
 * Frissíti a koordinátát és lekérdezi a magasságot.
 */
async function updateCoords(lat, lon) {
  currentCoords = { lat, lon };

  // UI frissítés
  document.getElementById('coord-lat').value = lat.toFixed(5);
  document.getElementById('coord-lon').value = lon.toFixed(5);

  // Magasság lekérdezése
  let elevation = null;
  try {
    elevation = await fetchElevation(lat, lon);
    const elField = document.getElementById('elevation-display');
    if (elField) elField.textContent = elevation !== null ? `${elevation} m` : '–';
  } catch (err) {
    console.warn('[map.js] Magasság lekérdezés sikertelen:', err.message);
  }

  if (onCoordsChangeCallback) {
    onCoordsChangeCallback(lat, lon, elevation);
  }
}

/**
 * Magasság lekérdezése az Open-Elevation API-ból.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<number|null>} méter
 */
async function fetchElevation(lat, lon) {
  const url = `${OPEN_ELEVATION_URL}?locations=${lat},${lon}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data?.results?.[0]?.elevation ?? null;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Időtúllépés (8s)');
    throw err;
  }
}

/**
 * Koordináta beállítása programozottan (pl. kézi bevitel).
 * @param {number} lat
 * @param {number} lon
 */
async function setCoordinates(lat, lon) {
  const customIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="marker-pin"><div class="marker-pulse"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  setMarker(lat, lon, customIcon);
  map.setView([lat, lon], 10);
  await updateCoords(lat, lon);
}

/**
 * Visszaadja az aktuális koordinátát.
 */
function getCurrentCoords() {
  return currentCoords;
}

/**
 * A térkép újramérése, ha a konténer mérete megváltozott.
 */
function invalidateMapSize() {
  if (map) map.invalidateSize();
}

export { initMap, setCoordinates, getCurrentCoords, fetchElevation, invalidateMapSize };
