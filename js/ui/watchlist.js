import { navigiere, state } from '../app.js';
import { destroyChart } from './chart.js';

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]'); }
  catch { return []; }
}

function saveWatchlist(wl) {
  localStorage.setItem('kartenwert_watchlist', JSON.stringify(wl));
}

function formatDatum(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return '–'; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderWatchlist(container, provider) {
  destroyChart();
  const wl = getWatchlist();

  if (wl.length === 0) {
    container.innerHTML = `
      <div class="watchlist-view">
        <div class="watchlist-header">
          <div class="watchlist-title">Watchlist</div>
          <div class="watchlist-sub">Karten die du beobachtest</div>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🔖</div>
          <div class="empty-state-title">Noch keine Karten beobachtet</div>
          <div class="empty-state-sub">Suche eine Karte und klicke &laquo;+ Beobachten&raquo;, um sie hier zu sehen.</div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="watchlist-view">
      <div class="watchlist-header">
        <div class="watchlist-title">Watchlist</div>
        <div class="watchlist-sub">${wl.length} Karte${wl.length !== 1 ? 'n' : ''} beobachtet</div>
      </div>
      <div class="loading" id="wl-loading"><div class="spinner"></div> Lade Preise…</div>
      <div id="wl-table-wrapper" style="display:none;"></div>
    </div>`;

  // Load all prices in parallel
  const entries = await Promise.all(wl.map(async entry => {
    try {
      const karte = await provider.getKarte(entry.kartenId);
      const preis = await provider.getAktuellerPreis(entry.kartenId, entry.sprache, entry.zustand);
      // Compute delta vs. history first point approximation using basisPreis * multipliers
      const SPRACHE_MULTI = {DE:1.0,EN:0.88,FR:0.82,IT:0.77,ES:0.75};
      const ZUSTAND_MULTI = {NM:1.0,EX:0.78,GD:0.58,LP:0.42,PL:0.28,PO:0.14};
      const refPreis = karte.basisPreis * (SPRACHE_MULTI[entry.sprache]||1) * (ZUSTAND_MULTI[entry.zustand]||1);
      const delta = refPreis > 0 ? ((preis - refPreis) / refPreis) * 100 : null;
      return { entry, karte, preis, delta, error: null };
    } catch (err) {
      return { entry, karte: null, preis: null, delta: null, error: err.message };
    }
  }));

  const loadingEl = container.querySelector('#wl-loading');
  const tableWrapper = container.querySelector('#wl-table-wrapper');
  if (loadingEl) loadingEl.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  tableWrapper.innerHTML = `
    <div class="watchlist-table-wrapper">
      <table class="watchlist-table">
        <thead>
          <tr>
            <th>Bild</th>
            <th>Name</th>
            <th>Sprache</th>
            <th>Zustand</th>
            <th>Preis</th>
            <th>Änderung</th>
            <th>Seit</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="wl-tbody">
          ${entries.map((e, idx) => {
            if (e.error || !e.karte) {
              return `<tr>
                <td colspan="8" style="color:var(--down);font-size:13px;padding:12px 14px;">
                  ⚠ Fehler beim Laden von ${escapeHtml(e.entry.kartenId)}: ${escapeHtml(e.error || 'Unbekannt')}
                </td>
              </tr>`;
            }
            const deltaClass = e.delta === null ? 'neutral' : e.delta >= 0 ? 'up' : 'down';
            const deltaStr   = e.delta === null ? '–' : `${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(1)}%`;
            const deltaColor = e.delta === null ? 'var(--text-muted)' : e.delta >= 0 ? 'var(--up)' : 'var(--down)';
            return `<tr class="wl-row" data-idx="${idx}" data-karten-id="${escapeHtml(e.entry.kartenId)}" data-sprache="${escapeHtml(e.entry.sprache)}" data-zustand="${escapeHtml(e.entry.zustand)}">
              <td><img class="wl-thumb" src="${escapeHtml(e.karte.bild)}" alt="${escapeHtml(e.karte.name)}" loading="lazy"></td>
              <td>
                <div class="wl-name">${escapeHtml(e.karte.name)}</div>
                <div class="wl-set">${escapeHtml(e.karte.set)} · ${escapeHtml(e.karte.nr)}</div>
              </td>
              <td><span class="wl-tag">${escapeHtml(e.entry.sprache)}</span></td>
              <td><span class="wl-tag">${escapeHtml(e.entry.zustand)}</span></td>
              <td class="wl-preis">${e.preis.toLocaleString('de-DE', {style:'currency',currency:'EUR'})}</td>
              <td style="color:${deltaColor};font-family:monospace;font-weight:600;">${deltaStr}</td>
              <td class="wl-seit">${formatDatum(e.entry.seit)}</td>
              <td>
                <button class="wl-remove-btn" data-idx="${idx}" title="Aus Watchlist entfernen" aria-label="Aus Watchlist entfernen">×</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire row clicks (navigate to card detail)
  tableWrapper.querySelectorAll('.wl-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.wl-remove-btn')) return;
      const kartenId = row.dataset.kartenId;
      state.sprache  = row.dataset.sprache;
      state.zustand  = row.dataset.zustand;
      state.selectedKarteId = kartenId;
      navigiere('suche', kartenId);
    });
  });

  // Wire remove buttons
  tableWrapper.querySelectorAll('.wl-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const currentWl = getWatchlist();
      // Find the matching entry by index
      const entryToRemove = entries[idx]?.entry;
      if (entryToRemove) {
        const newWl = currentWl.filter(e =>
          !(e.kartenId === entryToRemove.kartenId &&
            e.sprache  === entryToRemove.sprache &&
            e.zustand  === entryToRemove.zustand)
        );
        saveWatchlist(newWl);
      }
      // Re-render
      renderWatchlist(container, provider);
    });
  });
}
