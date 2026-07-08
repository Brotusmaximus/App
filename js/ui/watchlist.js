import { navigiere, state } from '../app.js';
import { destroyChart } from './chart.js';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]'); }
  catch { return []; }
}

function saveWatchlist(wl) {
  localStorage.setItem('kartenwert_watchlist', JSON.stringify(wl));
}

function migrateEntry(e) {
  if (e.holo !== undefined) return e;                        // Phase 2.1+ (holo)
  if (e.preisbasis !== undefined)                            // Phase 2.0 (foil → holo)
    return { kartenId: e.kartenId, preisbasis: e.preisbasis, holo: e.foil ?? false, seit: e.seit };
  return { kartenId: e.kartenId, preisbasis: 'trend', holo: false, seit: e.seit }; // Phase 1
}

function formatDatum(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return '–'; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function preisbasisLabel(preisbasis) {
  const MAP = {
    trend: 'Trend', low: 'Low', avg: 'Ø Avg',
    avg7: 'Ø7T', avg30: 'Ø30T',
    // PHASE-3-REAKTIVIERUNG: lowPriceEx, germanProLow hier ergänzen
  };
  return MAP[preisbasis] ?? preisbasis;
}

// ── idProducts exportieren ────────────────────────────────────────────────────

function zeigeExportModal(ids) {
  const bestehend = document.getElementById('export-modal');
  if (bestehend) bestehend.remove();

  const modal = document.createElement('div');
  modal.id = 'export-modal';
  modal.className = 'export-modal-overlay';
  modal.innerHTML = `
    <div class="export-modal">
      <div class="export-modal-header">
        <span>idProducts für config/watchlist.json</span>
        <button class="export-modal-close" id="export-close">×</button>
      </div>
      <p class="export-modal-hint">
        Kopiere diese IDs in <code>config/watchlist.json</code>, damit der
        GitHub Action die Preise für diese Karten abruft.
      </p>
      <textarea class="export-textarea" id="export-ta" readonly>${ids.join('\n')}</textarea>
      <div class="export-modal-actions">
        <button class="config-btn btn-active" id="export-copy">In Zwischenablage kopieren</button>
        <button class="config-btn" id="export-cancel">Schließen</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('export-copy').addEventListener('click', () => {
    const ta = document.getElementById('export-ta');
    ta.select();
    try {
      navigator.clipboard.writeText(ta.value).catch(() => document.execCommand('copy'));
    } catch {
      document.execCommand('copy');
    }
    document.getElementById('export-copy').textContent = '✓ Kopiert!';
    setTimeout(() => { document.getElementById('export-copy').textContent = 'In Zwischenablage kopieren'; }, 2000);
  });

  const close = () => modal.remove();
  document.getElementById('export-close').addEventListener('click', close);
  document.getElementById('export-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ── Haupt-Render ─────────────────────────────────────────────────────────────

export async function renderWatchlist(container, provider) {
  destroyChart();
  const rawWl = getWatchlist();
  const wl    = rawWl.map(migrateEntry);

  // ── Leer-Zustand ──────────────────────────────────────────────────────────

  if (wl.length === 0) {
    container.innerHTML = `
      <div class="watchlist-view">
        <div class="watchlist-header">
          <div>
            <div class="watchlist-title">Watchlist</div>
            <div class="watchlist-sub">Karten die du beobachtest</div>
          </div>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🔖</div>
          <div class="empty-state-title">Noch keine Karten beobachtet</div>
          <div class="empty-state-sub">Suche eine Karte und klicke &laquo;+ Beobachten&raquo;, um sie hier zu sehen.</div>
        </div>
      </div>`;
    return;
  }

  // ── Laderahmen ────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="watchlist-view">
      <div class="watchlist-header">
        <div>
          <div class="watchlist-title">Watchlist</div>
          <div class="watchlist-sub">${wl.length} Karte${wl.length !== 1 ? 'n' : ''} beobachtet</div>
        </div>
        <button class="config-btn" id="export-btn" title="idProducts für config/watchlist.json exportieren">
          ↗ IDs exportieren
        </button>
      </div>
      <div class="loading" id="wl-loading"><div class="spinner"></div> Lade Preise…</div>
      <div id="wl-kacheln" style="display:none;"></div>
    </div>`;

  // ── Preise laden ──────────────────────────────────────────────────────────

  const entries = await Promise.all(wl.map(async (entry, idx) => {
    try {
      const karte = await provider.getKarte(entry.kartenId);
      const preis = await provider.getAktuellerPreis(entry.kartenId, entry.preisbasis, entry.holo);

      // Delta: Vergleich mit ersten verfügbaren Historienpunkt (letzte 30T)
      let delta = null;
      try {
        const hist = await provider.getPreisHistorie(entry.kartenId, entry.preisbasis, entry.holo, '1M');
        if (hist && hist.length >= 2 && preis !== null) {
          delta = ((preis - hist[0].preis) / hist[0].preis) * 100;
        }
      } catch {}

      return { entry, karte, preis, delta, error: null, idx };
    } catch (err) {
      return { entry, karte: null, preis: null, delta: null, error: err.message, idx };
    }
  }));

  const loadingEl = container.querySelector('#wl-loading');
  const kachelnEl = container.querySelector('#wl-kacheln');
  if (loadingEl) loadingEl.style.display = 'none';
  if (kachelnEl) kachelnEl.style.display = 'block';

  // ── Kachel-Layout (funktioniert auf Desktop & Mobil) ──────────────────────

  kachelnEl.innerHTML = `<div class="wl-grid">
    ${entries.map(e => {
      if (e.error || !e.karte) {
        return `
          <div class="wl-kachel wl-kachel--error">
            <div class="wl-kachel-id">${escapeHtml(e.entry.kartenId)}</div>
            <div class="wl-kachel-fehler">⚠ ${escapeHtml(e.error || 'Fehler beim Laden')}</div>
          </div>`;
      }

      const deltaClass = e.delta === null ? 'neutral' : e.delta >= 0 ? 'up' : 'down';
      const deltaStr   = e.delta === null ? '–' : `${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(1)}%`;
      const deltaColor = e.delta === null ? 'var(--text-muted)' : e.delta >= 0 ? 'var(--up)' : 'var(--down)';

      return `
        <div class="wl-kachel" data-idx="${e.idx}"
             data-karten-id="${escapeHtml(e.entry.kartenId)}"
             data-preisbasis="${escapeHtml(e.entry.preisbasis)}"
             data-holo="${e.entry.holo ? 'true' : 'false'}"
             role="button" tabindex="0" title="${escapeHtml(e.karte.name)} anzeigen">
          <div class="wl-kachel-top">
            <img class="wl-thumb" src="${escapeHtml(e.karte.bild || 'assets/karten/placeholder.svg')}"
                 alt="${escapeHtml(e.karte.name)}" loading="lazy"
                 onerror="this.src='assets/karten/placeholder.svg'">
            <div class="wl-kachel-info">
              <div class="wl-name">${escapeHtml(e.karte.name)}</div>
              <div class="wl-set">${escapeHtml(e.karte.expansion ?? e.karte.set ?? '')} · ${escapeHtml(e.karte.number ?? e.karte.nr ?? '')}</div>
              <div class="wl-tags">
                <span class="wl-tag">${escapeHtml(preisbasisLabel(e.entry.preisbasis))}</span>
                ${e.entry.holo ? '<span class="wl-tag wl-tag--holo">Foil</span>' : ''}
              </div>
            </div>
            <button class="wl-remove-btn" data-idx="${e.idx}" title="Aus Watchlist entfernen" aria-label="Entfernen">×</button>
          </div>
          <div class="wl-kachel-bottom">
            <div class="wl-preis">
              ${e.preis !== null
                ? e.preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                : '<span style="color:var(--text-muted);font-size:13px;">Kein Preis (noch nicht getrackt)</span>'}
            </div>
            <div class="wl-kachel-meta">
              <span style="color:${deltaColor};font-family:monospace;font-weight:600;">${deltaStr}</span>
              <span class="wl-seit">seit ${formatDatum(e.entry.seit)}</span>
            </div>
          </div>
        </div>`;
    }).join('')}
  </div>`;

  // ── Event-Listener ────────────────────────────────────────────────────────

  // Kachel klicken → zur Karte navigieren
  kachelnEl.querySelectorAll('.wl-kachel[data-karten-id]').forEach(kachel => {
    kachel.addEventListener('click', e => {
      if (e.target.closest('.wl-remove-btn')) return;
      state.preisbasis        = kachel.dataset.preisbasis || 'trend';
      state.holo              = kachel.dataset.holo === 'true';
      state.selectedKarteId   = kachel.dataset.kartenId;
      navigiere('suche', kachel.dataset.kartenId);
    });
    kachel.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kachel.click(); }
    });
  });

  // Entfernen-Button
  kachelnEl.querySelectorAll('.wl-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const entry = entries[idx]?.entry;
      if (entry) {
        const currentWl = getWatchlist().map(migrateEntry);
        const newWl     = currentWl.filter(x =>
          !(x.kartenId === entry.kartenId && x.preisbasis === entry.preisbasis && x.holo === entry.holo)
        );
        saveWatchlist(newWl);
        renderWatchlist(container, provider);
      }
    });
  });

  // Export-Button
  const exportBtn = container.querySelector('#export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const ids = [...new Set(wl.map(e => e.kartenId))];
      zeigeExportModal(ids);
    });
  }
}
