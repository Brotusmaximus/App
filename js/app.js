// ── Provider-Wechsel ──────────────────────────────────────────────────────────
// Phase 1 (Mock-Daten):
import { MockProvider } from './datenquelle/mockProvider.js';
// Phase 2 (echte CM-Daten) → Zeile unten einkommentieren + MockProvider-Zeile auskommentieren:
// import { CardmarketFileProvider } from './datenquelle/cardmarketFileProvider.js';

import { renderMenue } from './ui/menue.js';
import { renderSuche } from './ui/suche.js';
import { renderWatchlist } from './ui/watchlist.js';
import { renderEinstellungen } from './ui/einstellungen.js';
import { renderAccount } from './ui/account.js';
import { destroyChart } from './ui/chart.js';

// === Provider singleton (Phase 1) ===
export const provider = new MockProvider();
// === Provider singleton (Phase 2) → aktivieren wenn CardmarketFileProvider importiert:
// export const provider = new CardmarketFileProvider();

// === Global state ===
export const state = {
  view: 'suche',
  selectedKarteId: null,
  // PHASE-3-REAKTIVIERUNG: sprache + zustand reaktivieren, sobald granulare API verfügbar
  // sprache: 'DE',
  // zustand: 'NM',
  preisbasis: 'trend',   // Phase 2: 'trend'|'low'|'avg'|'avg7'|'avg30'
  holo: false,           // Phase 2: Normal (false) vs. Holo (true)
  timeRange: '1M',
  searchQuery: '',
};

// === Settings persistence ===
export function ladeSettings() {
  try {
    const raw = localStorage.getItem('kartenwert_settings');
    if (raw) {
      const saved = JSON.parse(raw);
      // PHASE-3-REAKTIVIERUNG: sprache + zustand laden
      // if (saved.sprache) state.sprache = saved.sprache;
      // if (saved.zustand) state.zustand = saved.zustand;
      if (saved.preisbasis) state.preisbasis = saved.preisbasis;
      if (saved.holo !== undefined) state.holo = saved.holo;
      if (saved.fontSize === 'gross') document.body.classList.add('font-gross');
    }
  } catch (e) {
    console.warn('Settings konnten nicht geladen werden:', e);
  }
}

export function speichereSettings(extra = {}) {
  try {
    const raw = localStorage.getItem('kartenwert_settings');
    const existing = raw ? JSON.parse(raw) : {};
    const updated = {
      ...existing,
      // PHASE-3-REAKTIVIERUNG: sprache + zustand speichern
      // sprache: state.sprache,
      // zustand: state.zustand,
      preisbasis: state.preisbasis,
      holo: state.holo,
      ...extra,
    };
    localStorage.setItem('kartenwert_settings', JSON.stringify(updated));
  } catch (e) {
    console.warn('Settings konnten nicht gespeichert werden:', e);
  }
}

// === Navigation ===
export function navigiere(view, karteId = null) {
  // Destroy any existing chart when navigating away
  if (state.view !== view) {
    destroyChart();
  }
  state.view = view;
  if (karteId !== null) {
    state.selectedKarteId = karteId;
  }
  render();
}

// === Render nav only (for badge updates) ===
export function renderNavOnly() {
  renderMenue(state);
}

// === Main render ===
export async function render() {
  renderMenue(state);

  const main = document.getElementById('main-content');

  switch (state.view) {
    case 'suche':
      await renderSuche(main, provider);
      break;
    case 'watchlist':
      await renderWatchlist(main, provider);
      break;
    case 'einstellungen':
      renderEinstellungen(main);
      break;
    case 'account':
      renderAccount(main);
      break;
    default:
      main.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">◎</div>
        <div class="empty-state-title">Ansicht nicht gefunden</div>
      </div>`;
  }
}

// === Init ===
ladeSettings();
render();
