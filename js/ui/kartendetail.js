import { renderChart, destroyChart } from './chart.js';
import { speichereSettings, navigiere, renderNavOnly } from '../app.js';

const SPRACHEN  = ['DE','EN','FR','IT','ES'];
const ZUSTAENDE = ['NM','EX','GD','LP','PL','PO'];
const RANGES    = ['1T','1W','1M','1J','Max'];

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]'); }
  catch { return []; }
}

function saveWatchlist(wl) {
  localStorage.setItem('kartenwert_watchlist', JSON.stringify(wl));
}

function isTracked(kartenId, sprache, zustand) {
  return getWatchlist().some(e => e.kartenId === kartenId && e.sprache === sprache && e.zustand === zustand);
}

function toggleTracking(karte, sprache, zustand) {
  const wl = getWatchlist();
  const idx = wl.findIndex(e => e.kartenId === karte.id && e.sprache === sprache && e.zustand === zustand);
  if (idx >= 0) {
    wl.splice(idx, 1);
  } else {
    wl.push({
      kartenId: karte.id,
      sprache,
      zustand,
      seit: new Date().toISOString(),
      basisPreisAtAdd: karte.basisPreis,
    });
  }
  saveWatchlist(wl);
}

function calcDelta(history) {
  if (!history || history.length < 2) return null;
  const first = history[0].preis;
  const last  = history[history.length - 1].preis;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

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
    preis   = await provider.getAktuellerPreis(state.selectedKarteId, state.sprache, state.zustand);
    history = await provider.getPreisHistorie(state.selectedKarteId, state.sprache, state.zustand, state.timeRange);
  } catch (err) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">⚠</div>
        <div>${err.message}</div>
        <div class="error-state-msg">Bitte versuche es erneut.</div>
      </div>`;
    return;
  }

  const delta     = calcDelta(history);
  const tracked   = isTracked(karte.id, state.sprache, state.zustand);
  const deltaClass = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
  const deltaStr   = delta === null
    ? '–'
    : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;

  container.innerHTML = `
    <div class="kartendetail">

      <!-- Top: image + info -->
      <div class="detail-top">
        <img class="detail-bild" src="${karte.bild}" alt="${karte.name}" loading="lazy">
        <div class="detail-info">
          <div class="detail-name">${karte.name}</div>
          <div class="detail-set">${karte.set}</div>
          <div class="detail-nr">Nr. ${karte.nr}</div>
          <div class="detail-rarity">${karte.rarity}</div>
        </div>
      </div>

      <!-- Language selector -->
      <div class="config-section">
        <div class="btn-group-label">Sprache</div>
        <div class="btn-group" id="sprache-btns">
          ${SPRACHEN.map(s => `
            <button class="config-btn${state.sprache === s ? ' btn-active' : ''}" data-sprache="${s}">${s}</button>
          `).join('')}
        </div>
      </div>

      <!-- Condition selector -->
      <div class="config-section">
        <div class="btn-group-label">Zustand</div>
        <div class="btn-group" id="zustand-btns">
          ${ZUSTAENDE.map(z => `
            <button class="config-btn${state.zustand === z ? ' btn-active' : ''}" data-zustand="${z}">${z}</button>
          `).join('')}
        </div>
      </div>

      <!-- Price + Delta -->
      <div>
        <div class="btn-group-label">Aktueller Preis</div>
        <div class="preis-bereich">
          <div class="preis-aktuell" id="preis-display">
            ${preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </div>
          <span class="preis-delta ${deltaClass}" id="preis-delta">${deltaStr}</span>
        </div>
      </div>

      <!-- Track button -->
      <div>
        <button class="track-btn${tracked ? ' tracked' : ''}" id="track-btn">
          ${tracked ? '✓ Beobachtet' : '+ Beobachten'}
        </button>
      </div>

      <!-- Time range selector -->
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
        <canvas id="preis-chart"></canvas>
      </div>

    </div>`;

  // Render chart
  renderChart('preis-chart', history);

  // Wire up language buttons
  container.querySelectorAll('[data-sprache]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.sprache = btn.dataset.sprache;
      speichereSettings();
      await refreshPreisAndChart(container, state, provider, karte);
    });
  });

  // Wire up condition buttons
  container.querySelectorAll('[data-zustand]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.zustand = btn.dataset.zustand;
      speichereSettings();
      await refreshPreisAndChart(container, state, provider, karte);
    });
  });

  // Wire up range buttons
  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.timeRange = btn.dataset.range;
      await refreshChart(container, state, provider);
    });
  });

  // Wire up track button
  const trackBtn = container.querySelector('#track-btn');
  trackBtn.addEventListener('click', () => {
    toggleTracking(karte, state.sprache, state.zustand);
    const nowTracked = isTracked(karte.id, state.sprache, state.zustand);
    trackBtn.className = `track-btn${nowTracked ? ' tracked' : ''}`;
    trackBtn.textContent = nowTracked ? '✓ Beobachtet' : '+ Beobachten';
    // Update nav badge
    renderNavOnly();
  });
}

async function refreshPreisAndChart(container, state, provider, karte) {
  // Update active buttons
  container.querySelectorAll('[data-sprache]').forEach(b => {
    b.classList.toggle('btn-active', b.dataset.sprache === state.sprache);
  });
  container.querySelectorAll('[data-zustand]').forEach(b => {
    b.classList.toggle('btn-active', b.dataset.zustand === state.zustand);
  });

  try {
    const [newPreis, newHistory] = await Promise.all([
      provider.getAktuellerPreis(karte.id, state.sprache, state.zustand),
      provider.getPreisHistorie(karte.id, state.sprache, state.zustand, state.timeRange),
    ]);

    const preisEl = container.querySelector('#preis-display');
    const deltaEl = container.querySelector('#preis-delta');
    if (preisEl) {
      preisEl.textContent = newPreis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }
    const delta = calcDelta(newHistory);
    if (deltaEl) {
      const deltaClass = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
      const deltaStr   = delta === null
        ? '–'
        : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;
      deltaEl.className = `preis-delta ${deltaClass}`;
      deltaEl.textContent = deltaStr;
    }

    // Update track button
    const trackBtn = container.querySelector('#track-btn');
    if (trackBtn) {
      const tracked = isTracked(karte.id, state.sprache, state.zustand);
      trackBtn.className = `track-btn${tracked ? ' tracked' : ''}`;
      trackBtn.textContent = tracked ? '✓ Beobachtet' : '+ Beobachten';
    }

    // Re-render chart
    const chartContainer = container.querySelector('.chart-container');
    if (chartContainer) {
      chartContainer.innerHTML = '<canvas id="preis-chart"></canvas>';
    }
    renderChart('preis-chart', newHistory);
  } catch (err) {
    console.error('Preis-Update fehlgeschlagen:', err);
  }
}

async function refreshChart(container, state, provider) {
  container.querySelectorAll('[data-range]').forEach(b => {
    b.classList.toggle('btn-active', b.dataset.range === state.timeRange);
  });
  try {
    const karte = await provider.getKarte(state.selectedKarteId);
    const newHistory = await provider.getPreisHistorie(karte.id, state.sprache, state.zustand, state.timeRange);

    const delta = calcDelta(newHistory);
    const deltaEl = container.querySelector('#preis-delta');
    if (deltaEl) {
      const deltaClass = delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down';
      const deltaStr   = delta === null
        ? '–'
        : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (${state.timeRange})`;
      deltaEl.className = `preis-delta ${deltaClass}`;
      deltaEl.textContent = deltaStr;
    }

    const chartContainer = container.querySelector('.chart-container');
    if (chartContainer) {
      chartContainer.innerHTML = '<canvas id="preis-chart"></canvas>';
    }
    renderChart('preis-chart', newHistory);
  } catch (err) {
    console.error('Chart-Update fehlgeschlagen:', err);
  }
}
