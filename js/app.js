import { MockProvider } from './datenquelle/mockProvider.js';
import { renderMenue } from './ui/menue.js';
import { renderSuche } from './ui/suche.js';
import { renderWatchlist } from './ui/watchlist.js';
import { renderEinstellungen } from './ui/einstellungen.js';
import { renderAccount } from './ui/account.js';
import { destroyChart } from './ui/chart.js';

// === Provider singleton ===
export const provider = new MockProvider();

// === Global state ===
export const state = {
  view: 'suche',
  selectedKarteId: null,
  sprache: 'DE',
  zustand: 'NM',
  timeRange: '1M',
  searchQuery: '',
};

// === Settings persistence ===
export function ladeSettings() {
  try {
    const raw = localStorage.getItem('kartenwert_settings');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.sprache) state.sprache = saved.sprache;
      if (saved.zustand) state.zustand = saved.zustand;
      // Apply font size if stored
      if (saved.fontSize === 'gross') {
        document.body.classList.add('font-gross');
      }
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
      sprache: state.sprache,
      zustand: state.zustand,
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
