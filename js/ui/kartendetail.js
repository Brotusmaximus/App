import { renderChart, destroyChart } from './chart.js';
import { speichereSettings, navigiere, renderNavOnly } from '../app.js';

// PHASE-3-REAKTIVIERUNG: Sprach-/Zustandslisten reaktivieren
// const SPRACHEN  = ['DE','EN','FR','IT','ES'];
// const ZUSTAENDE = ['NM','EX','GD','LP','PL','PO'];

const PREISBASEN = [
  { id: 'trend',        label: 'Trend'        },
  { id: 'lowPrice',     label: 'Low'          },
  { id: 'lowPriceEx',   label: 'Low EX+'      },
  { id: 'germanProLow', label: 'DE Pro Low'   },
  { id: 'avg7',         label: 'Ø 7 Tage'     },
  { id: 'avg30',        label: 'Ø 30 Tage'    },
];

const RANGES = ['1T', '1W', '1M', '1J', 'Max'];

// ── Watchlist-Hilfsfunktionen ────────────────────────────────────────────────

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]'); }
  catch { return []; }
}

function saveWatchlist(wl) {
  localStorage.setItem('kartenwert_watchlist', JSON.stringify(wl));
}

function migrateEntry(e) {
  if (e.preisbasis !== undefined) return e;
  // Phase-1-Eintrag migrieren: sprache/zustand → preisbasis/foil
  return { kartenId: e.kartenId, preisbasis: 'trend', foil: false, seit: e.seit };
}

function isTracked(kartenId, preisbasis, foil) {
  return getWatchlist().some(e => {
    const m = migrateEntry(e);
    return m.kartenId === kartenId && m.preisbasis === preisbasis && m.foil === foil;
  });
}

function toggleTracking(karte, preisbasis, foil) {
  const wl  = getWatchlist();
  const idx = wl.findIndex(e => {
    const m = migrateEntry(e);
    return m.kartenId === karte.id && m.preisbasis === preisbasis && m.foil === foil;
  });
  if (idx >= 0) {
    wl.splice(idx, 1);
  } else {
    wl.push({ kartenId: karte.id, preisbasis, foil, seit: new Date().toISOString() });
  }
  saveWatchlist(wl);
}

function calcDelta(history) {
  if (!history || history.length < 2) return null;
  const first = history[0].preis;
  const last  = history[history.length - 1].preis;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

function formatPreis(preis) {
  if (preis === null || preis === undefined) return '– €';
  return preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ── Haupt-Render ─────────────────────────────────────────────────────────────

export async function renderKartendetail(container, state, provider) {
  if (!state.selectedKarteId) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">◈</div>
        <div class="empty-state-title">Karte auswählen</div>
        <div class="empty-state-sub">← Wähle eine Karte aus der Liste, um Details zu sehen.</div>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="loading"><div class="spinner"></div> Lade Kartendaten…</div>`;

  let karte, preis, history;
  try {
    karte   = await provider.getKarte(state.selectedKarteId);
    preis   = await provider.getAktuellerPreis(state.selectedKarteId, state.preisbasis, state.foil);
    history = await provider.getPreisHistorie(state.selectedKarteId, state.preisbasis, state.foil, state.timeRange);
  } catch (err) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">⚠</div>
        <div>${err.message}</div>
        <div class="error-state-msg">Bitte versuche es erneut.</div>
      </div>`;
    return;
  }

  const delta      = calcDelta(history);
  const tracked    = isTracked(karte.id, state.preisbasis, state.foil);
  const deltaClass = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
  const deltaStr   = delta === null
    ? '–'
    : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;

  const keineHistorie = !history || history.length === 0;

  container.innerHTML = `
    <div class="kartendetail">

      <!-- Bild + Info -->
      <div class="detail-top">
        <img class="detail-bild" src="${karte.bild || 'assets/karten/placeholder.svg'}"
             alt="${karte.name}" loading="lazy"
             onerror="this.src='assets/karten/placeholder.svg'">
        <div class="detail-info">
          <div class="detail-name">${karte.name}</div>
          <div class="detail-set">${karte.expansion ?? karte.set ?? ''}</div>
          <div class="detail-nr">Nr. ${karte.number ?? karte.nr ?? ''}</div>
          <div class="detail-rarity">${karte.rarity ?? ''}</div>
        </div>
      </div>

      <!-- PHASE-3-REAKTIVIERUNG: Sprach- und Zustandsbuttons reaktivieren
      <div class="config-section">
        <div class="btn-group-label">Sprache</div>
        <div class="btn-group" id="sprache-btns">
          ${/* SPRACHEN.map(s => `<button class="config-btn${state.sprache===s?' btn-active':''}" data-sprache="${s}">${s}</button>`).join('') */ ''}
        </div>
      </div>
      <div class="config-section">
        <div class="btn-group-label">Zustand</div>
        <div class="btn-group" id="zustand-btns">
          ${/* ZUSTAENDE.map(z => `<button class="config-btn${state.zustand===z?' btn-active':''}" data-zustand="${z}">${z}</button>`).join('') */ ''}
        </div>
      </div>
      -->

      <!-- Preis-Basis-Selektor (Phase 2) -->
      <div class="config-section">
        <div class="btn-group-label">Preis-Basis</div>
        <div class="btn-group" id="preisbasis-btns">
          ${PREISBASEN.map(p => `
            <button class="config-btn${state.preisbasis === p.id ? ' btn-active' : ''}" data-preisbasis="${p.id}">${p.label}</button>
          `).join('')}
        </div>
      </div>

      <!-- Foil-Umschalter (Phase 2) -->
      <div class="config-section config-section--inline">
        <div class="btn-group-label">Variante</div>
        <div class="btn-group foil-group">
          <button class="config-btn${!state.foil ? ' btn-active' : ''}" data-foil="false">Normal</button>
          <button class="config-btn${state.foil  ? ' btn-active' : ''}" data-foil="true">Foil</button>
        </div>
      </div>

      <!-- Preis + Delta -->
      <div>
        <div class="btn-group-label">Aktueller Preis</div>
        <div class="preis-bereich">
          <div class="preis-aktuell" id="preis-display">${formatPreis(preis)}</div>
          <span class="preis-delta ${deltaClass}" id="preis-delta">${deltaStr}</span>
        </div>
        ${preis === null ? `
          <div class="hinweis-leer">
            Diese Karte ist noch nicht in der Tracking-Watchlist des Hintergrund-Jobs.
            Trage die idProduct in <code>config/watchlist.json</code> ein und starte die GitHub Action.
          </div>` : ''}
      </div>

      <!-- Track-Button -->
      <div>
        <button class="track-btn${tracked ? ' tracked' : ''}" id="track-btn">
          ${tracked ? '✓ Beobachtet' : '+ Beobachten'}
        </button>
      </div>

      <!-- Zeitraum-Selektor -->
      <div class="config-section">
        <div class="btn-group-label">Zeitraum</div>
        <div class="btn-group" id="range-btns">
          ${RANGES.map(r => `
            <button class="config-btn${state.timeRange === r ? ' btn-active' : ''}" data-range="${r}">${r}</button>
          `).join('')}
        </div>
      </div>

      <!-- Chart -->
      <div class="chart-container">
        ${keineHistorie
          ? `<div class="empty-state empty-state--chart">
               <div class="empty-state-icon">📈</div>
               <div class="empty-state-title">Historie wird aufgebaut</div>
               <div class="empty-state-sub">Ab jetzt wird täglich ein Preis gespeichert. Nach ein paar Tagen erscheint hier der Chart.</div>
             </div>`
          : '<canvas id="preis-chart"></canvas>'
        }
      </div>

    </div>`;

  if (!keineHistorie) renderChart('preis-chart', history);

  // Event-Listener: Preis-Basis
  container.querySelectorAll('[data-preisbasis]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.preisbasis = btn.dataset.preisbasis;
      speichereSettings();
      await refreshPreisAndChart(container, state, provider, karte);
    });
  });

  // Event-Listener: Foil
  container.querySelectorAll('[data-foil]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.foil = btn.dataset.foil === 'true';
      speichereSettings();
      await refreshPreisAndChart(container, state, provider, karte);
    });
  });

  // Event-Listener: Zeitraum
  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.timeRange = btn.dataset.range;
      await refreshChart(container, state, provider);
    });
  });

  // Event-Listener: Track-Button
  const trackBtn = container.querySelector('#track-btn');
  trackBtn.addEventListener('click', () => {
    toggleTracking(karte, state.preisbasis, state.foil);
    const nowTracked = isTracked(karte.id, state.preisbasis, state.foil);
    trackBtn.className = `track-btn${nowTracked ? ' tracked' : ''}`;
    trackBtn.textContent = nowTracked ? '✓ Beobachtet' : '+ Beobachten';
    renderNavOnly();
  });
}

// ── Refresh-Funktionen ───────────────────────────────────────────────────────

async function refreshPreisAndChart(container, state, provider, karte) {
  // Aktive Buttons aktualisieren
  container.querySelectorAll('[data-preisbasis]').forEach(b => {
    b.classList.toggle('btn-active', b.dataset.preisbasis === state.preisbasis);
  });
  container.querySelectorAll('[data-foil]').forEach(b => {
    b.classList.toggle('btn-active', (b.dataset.foil === 'true') === state.foil);
  });

  try {
    const [newPreis, newHistory] = await Promise.all([
      provider.getAktuellerPreis(karte.id, state.preisbasis, state.foil),
      provider.getPreisHistorie(karte.id, state.preisbasis, state.foil, state.timeRange),
    ]);

    const preisEl = container.querySelector('#preis-display');
    const deltaEl = container.querySelector('#preis-delta');

    if (preisEl) preisEl.textContent = formatPreis(newPreis);

    const delta = calcDelta(newHistory);
    if (deltaEl) {
      const cls = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
      const str = delta === null ? '–' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;
      deltaEl.className = `preis-delta ${cls}`;
      deltaEl.textContent = str;
    }

    const trackBtn = container.querySelector('#track-btn');
    if (trackBtn) {
      const tracked = isTracked(karte.id, state.preisbasis, state.foil);
      trackBtn.className = `track-btn${tracked ? ' tracked' : ''}`;
      trackBtn.textContent = tracked ? '✓ Beobachtet' : '+ Beobachten';
    }

    const chartContainer = container.querySelector('.chart-container');
    if (chartContainer) {
      destroyChart();
      if (!newHistory || newHistory.length === 0) {
        chartContainer.innerHTML = `
          <div class="empty-state empty-state--chart">
            <div class="empty-state-icon">📈</div>
            <div class="empty-state-title">Historie wird aufgebaut</div>
            <div class="empty-state-sub">Ab jetzt wird täglich ein Preis gespeichert.</div>
          </div>`;
      } else {
        chartContainer.innerHTML = '<canvas id="preis-chart"></canvas>';
        renderChart('preis-chart', newHistory);
      }
    }
  } catch (err) {
    console.error('Preis-Update fehlgeschlagen:', err);
  }
}

async function refreshChart(container, state, provider) {
  container.querySelectorAll('[data-range]').forEach(b => {
    b.classList.toggle('btn-active', b.dataset.range === state.timeRange);
  });
  try {
    const karte      = await provider.getKarte(state.selectedKarteId);
    const newHistory = await provider.getPreisHistorie(karte.id, state.preisbasis, state.foil, state.timeRange);

    const delta  = calcDelta(newHistory);
    const deltaEl = container.querySelector('#preis-delta');
    if (deltaEl) {
      const cls = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
      const str = delta === null ? '–' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;
      deltaEl.className = `preis-delta ${cls}`;
      deltaEl.textContent = str;
    }

    const chartContainer = container.querySelector('.chart-container');
    if (chartContainer) {
      destroyChart();
      if (!newHistory || newHistory.length === 0) {
        chartContainer.innerHTML = `
          <div class="empty-state empty-state--chart">
            <div class="empty-state-icon">📈</div>
            <div class="empty-state-title">Keine Daten für diesen Zeitraum</div>
            <div class="empty-state-sub">Historie reicht nicht weit genug zurück.</div>
          </div>`;
      } else {
        chartContainer.innerHTML = '<canvas id="preis-chart"></canvas>';
        renderChart('preis-chart', newHistory);
      }
    }
  } catch (err) {
    console.error('Chart-Update fehlgeschlagen:', err);
  }
}
