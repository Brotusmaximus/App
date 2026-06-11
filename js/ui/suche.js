import { state, navigiere } from '../app.js';
import { renderKartendetail } from './kartendetail.js';

export async function renderSuche(container, provider) {
  container.innerHTML = `
    <div class="suche-layout">
      <div class="suche-left" id="suche-left-panel">
        <div class="search-input-wrapper">
          <svg class="search-icon nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" id="search-input" placeholder="Karte suchen…" value="${escapeHtml(state.searchQuery)}" autocomplete="off" spellcheck="false">
        </div>
        <div class="ergebnisse-header" id="ergebnisse-header">Lädt…</div>
        <ul class="ergebnisse-liste" id="ergebnisse-liste"></ul>
      </div>
      <div class="suche-right" id="suche-right-panel"></div>
    </div>`;

  const input         = container.querySelector('#search-input');
  const listeEl       = container.querySelector('#ergebnisse-liste');
  const headerEl      = container.querySelector('#ergebnisse-header');
  const rightPanel    = container.querySelector('#suche-right-panel');

  // Initial load
  await ladeUndRendereErgebnisse(listeEl, headerEl, rightPanel, provider, state.searchQuery, state);

  // Wire search input
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      state.searchQuery = input.value;
      await ladeUndRendereErgebnisse(listeEl, headerEl, rightPanel, provider, state.searchQuery, state);
    }, 180);
  });

  input.focus();
}

async function ladeUndRendereErgebnisse(listeEl, headerEl, rightPanel, provider, query, state) {
  headerEl.textContent = 'Suche…';
  let ergebnisse;
  try {
    ergebnisse = await provider.sucheKarten(query);
  } catch (err) {
    listeEl.innerHTML = `<li><div class="error-state"><div class="error-state-icon">⚠</div><div>${escapeHtml(err.message)}</div></div></li>`;
    headerEl.textContent = 'Fehler';
    return;
  }

  const count = ergebnisse.length;
  headerEl.textContent = query.trim()
    ? `${count} Ergebnis${count !== 1 ? 'se' : ''} für „${query}"`
    : `Alle ${count} Karten`;

  if (count === 0) {
    listeEl.innerHTML = `
      <li>
        <div class="empty-state" style="padding:32px 16px;">
          <div class="empty-state-icon" style="font-size:32px">◎</div>
          <div class="empty-state-sub">Keine Karten gefunden.</div>
        </div>
      </li>`;
    return;
  }

  listeEl.innerHTML = ergebnisse.map(karte => `
    <li class="ergebnis-item${state.selectedKarteId === karte.id ? ' selected' : ''}"
        data-id="${karte.id}"
        tabindex="0"
        role="button"
        aria-label="${escapeHtml(karte.name)}, ${escapeHtml(karte.set)}">
      <img class="ergebnis-thumb" src="${karte.bild}" alt="${escapeHtml(karte.name)}" loading="lazy">
      <div class="ergebnis-info">
        <div class="ergebnis-name">${escapeHtml(karte.name)}</div>
        <div class="ergebnis-meta">${escapeHtml(karte.set)} · ${escapeHtml(karte.nr)} · ${escapeHtml(karte.rarity)}</div>
      </div>
    </li>`).join('');

  // Wire clicks and keyboard
  listeEl.querySelectorAll('.ergebnis-item').forEach(item => {
    const waehle = async () => {
      state.selectedKarteId = item.dataset.id;
      // Update selected styling
      listeEl.querySelectorAll('.ergebnis-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      // Render detail
      await renderKartendetail(rightPanel, state, provider);
    };
    item.addEventListener('click', waehle);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); waehle(); }
    });
  });

  // Auto-show detail for selected card
  if (state.selectedKarteId) {
    await renderKartendetail(rightPanel, state, provider);
  } else {
    await renderKartendetail(rightPanel, state, provider);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
