import { state, speichereSettings } from '../app.js';
import { destroyChart } from './chart.js';

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 350);
  }, 2200);
}

function getExtraSettings() {
  try {
    const raw = localStorage.getItem('kartenwert_settings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function applyFontSize(size) {
  document.body.classList.remove('font-normal', 'font-gross');
  if (size === 'gross') document.body.classList.add('font-gross');
}

export function renderEinstellungen(container) {
  destroyChart();
  const extra = getExtraSettings();
  const tracking  = extra.tracking  || '1x';
  const fontSize  = extra.fontSize  || 'normal';

  applyFontSize(fontSize);

  const SPRACHEN  = ['DE','EN','FR','IT','ES'];
  const ZUSTAENDE = ['NM','EX','GD','LP','PL','PO'];

  container.innerHTML = `
    <div class="einstellungen-view">
      <div class="einstellungen-title">Einstellungen</div>

      <!-- 1. Preisanzeige -->
      <div class="settings-section">
        <div class="settings-section-title">Preisanzeige</div>

        <div class="settings-row">
          <div>
            <div class="settings-label">Standardsprache</div>
            <div class="settings-desc">Preise werden in dieser Sprache angezeigt</div>
          </div>
          <div class="btn-group" id="spr-btns">
            ${SPRACHEN.map(s => `
              <button class="config-btn${state.sprache === s ? ' btn-active' : ''}" data-spr="${s}">${s}</button>
            `).join('')}
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-label">Standardzustand</div>
            <div class="settings-desc">Vorausgewählter Kartenzustand</div>
          </div>
          <div class="btn-group" id="zus-btns">
            ${ZUSTAENDE.map(z => `
              <button class="config-btn${state.zustand === z ? ' btn-active' : ''}" data-zus="${z}">${z}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 2. Tracking -->
      <div class="settings-section">
        <div class="settings-section-title">Tracking</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Abfrage-Häufigkeit</div>
            <div class="settings-desc">Wie oft Preise im Hintergrund abgerufen werden (Phase 2)</div>
          </div>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="tracking" value="1x" ${tracking === '1x' ? 'checked' : ''}>
              1× täglich
            </label>
            <label class="radio-label">
              <input type="radio" name="tracking" value="2x" ${tracking === '2x' ? 'checked' : ''}>
              2× täglich
            </label>
          </div>
        </div>
      </div>

      <!-- 3. Darstellung -->
      <div class="settings-section">
        <div class="settings-section-title">Darstellung</div>

        <div class="settings-row">
          <div>
            <div class="settings-label">Theme</div>
            <div class="settings-desc">Weitere Optionen in Phase 2</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn active" disabled>Dunkel</button>
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-label">Schriftgröße</div>
          </div>
          <div class="toggle-group" id="font-btns">
            <button class="toggle-btn${fontSize === 'normal' ? ' active' : ''}" data-font="normal">Normal</button>
            <button class="toggle-btn${fontSize === 'gross' ? ' active' : ''}" data-font="gross">Groß</button>
          </div>
        </div>
      </div>

      <!-- 4. Währung -->
      <div class="settings-section">
        <div class="settings-section-title">Währung</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Währung</div>
            <div class="settings-desc">Weitere Währungen in Phase 2</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn active" disabled>EUR €</button>
          </div>
        </div>
      </div>

      <!-- Save button -->
      <div style="margin-top:8px;">
        <button class="settings-save-btn" id="save-btn">Einstellungen speichern</button>
      </div>
    </div>`;

  // Wire language buttons
  container.querySelectorAll('[data-spr]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sprache = btn.dataset.spr;
      container.querySelectorAll('[data-spr]').forEach(b => b.classList.toggle('btn-active', b.dataset.spr === state.sprache));
    });
  });

  // Wire condition buttons
  container.querySelectorAll('[data-zus]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.zustand = btn.dataset.zus;
      container.querySelectorAll('[data-zus]').forEach(b => b.classList.toggle('btn-active', b.dataset.zus === state.zustand));
    });
  });

  // Wire font size buttons
  let currentFontSize = fontSize;
  container.querySelectorAll('[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFontSize = btn.dataset.font;
      container.querySelectorAll('[data-font]').forEach(b => b.classList.toggle('active', b.dataset.font === currentFontSize));
      applyFontSize(currentFontSize);
    });
  });

  // Wire save button
  container.querySelector('#save-btn').addEventListener('click', () => {
    const trackingVal = container.querySelector('input[name="tracking"]:checked')?.value || '1x';
    speichereSettings({ tracking: trackingVal, fontSize: currentFontSize });
    showToast('Einstellungen gespeichert ✓');
  });
}
