import { destroyChart } from './chart.js';

function getAccount() {
  try { return JSON.parse(localStorage.getItem('kartenwert_account') || 'null'); }
  catch { return null; }
}

function saveAccount(data) {
  localStorage.setItem('kartenwert_account', JSON.stringify(data));
}

function getWatchlistCount() {
  try { return JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]').length; }
  catch { return 0; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDatum(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '–'; }
}

export function renderAccount(container) {
  destroyChart();
  const account = getAccount();

  if (account && account.loggedIn) {
    renderLoggedIn(container, account);
  } else {
    renderLoggedOut(container, 'anmelden');
  }
}

function renderLoggedOut(container, activeTab) {
  container.innerHTML = `
    <div class="account-view">
      <div class="account-title">Account</div>

      <div class="demo-banner">
        <span class="demo-banner-icon">ℹ</span>
        <div>Dies ist ein Demo-Account. Kein echtes Backend. Deine Daten bleiben lokal auf deinem Gerät.</div>
      </div>

      <div class="tab-bar">
        <button class="tab-btn${activeTab === 'anmelden' ? ' active' : ''}" id="tab-anmelden">Anmelden</button>
        <button class="tab-btn${activeTab === 'registrieren' ? ' active' : ''}" id="tab-registrieren">Registrieren</button>
      </div>

      <div class="panel" id="tab-content">
        ${activeTab === 'anmelden' ? renderAnmeldenForm() : renderRegistrierenForm()}
      </div>
    </div>`;

  container.querySelector('#tab-anmelden').addEventListener('click', () => renderLoggedOut(container, 'anmelden'));
  container.querySelector('#tab-registrieren').addEventListener('click', () => renderLoggedOut(container, 'registrieren'));

  if (activeTab === 'anmelden') {
    container.querySelector('#anmelden-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = container.querySelector('#anmelden-email').value.trim();
      if (!email) return;
      const account = {
        email,
        loggedIn: true,
        seit: new Date().toISOString(),
      };
      saveAccount(account);
      renderLoggedIn(container, account);
    });
  } else {
    container.querySelector('#registrieren-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = container.querySelector('#reg-email').value.trim();
      const pass  = container.querySelector('#reg-pass').value;
      const pass2 = container.querySelector('#reg-pass2').value;
      const errEl = container.querySelector('#reg-error');
      if (!email) { errEl.textContent = 'Bitte E-Mail eingeben.'; return; }
      if (pass !== pass2) { errEl.textContent = 'Passwörter stimmen nicht überein.'; return; }
      errEl.textContent = '';
      const account = {
        email,
        loggedIn: true,
        seit: new Date().toISOString(),
      };
      saveAccount(account);
      renderLoggedIn(container, account);
    });
  }
}

function renderAnmeldenForm() {
  return `
    <form id="anmelden-form">
      <div class="form-group">
        <label class="form-label" for="anmelden-email">E-Mail</label>
        <input class="form-input" id="anmelden-email" type="email" placeholder="deine@email.de" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="anmelden-pass">Passwort</label>
        <input class="form-input" id="anmelden-pass" type="password" placeholder="••••••••" autocomplete="current-password">
      </div>
      <button type="submit" class="form-submit-btn">Anmelden</button>
    </form>`;
}

function renderRegistrierenForm() {
  return `
    <form id="registrieren-form">
      <div class="form-group">
        <label class="form-label" for="reg-email">E-Mail</label>
        <input class="form-input" id="reg-email" type="email" placeholder="deine@email.de" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-pass">Passwort</label>
        <input class="form-input" id="reg-pass" type="password" placeholder="Mindestens 8 Zeichen" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-pass2">Passwort wiederholen</label>
        <input class="form-input" id="reg-pass2" type="password" placeholder="Passwort bestätigen" autocomplete="new-password">
      </div>
      <div id="reg-error" style="color:var(--down);font-size:13px;margin-bottom:8px;min-height:18px;"></div>
      <button type="submit" class="form-submit-btn">Registrieren</button>
    </form>`;
}

function renderLoggedIn(container, account) {
  const wlCount = getWatchlistCount();
  container.innerHTML = `
    <div class="account-view">
      <div class="account-title">Account</div>

      <div class="demo-banner">
        <span class="demo-banner-icon">ℹ</span>
        <div>Dies ist ein Demo-Account. Kein echtes Backend. Deine Daten bleiben lokal auf deinem Gerät.</div>
      </div>

      <div class="account-panel">
        <div class="account-email">${escapeHtml(account.email)}</div>
        <div class="verify-badge">⚠ Verifizierung ausstehend</div>
        <div class="account-verify-text">
          Wir haben eine Bestätigungsmail an <strong>${escapeHtml(account.email)}</strong> gesendet.
        </div>

        <div class="account-stats">
          <div class="stat-item">
            <div class="stat-value">${wlCount}</div>
            <div class="stat-label">Karten beobachtet</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${formatDatum(account.seit)}</div>
            <div class="stat-label">Mitglied seit</div>
          </div>
        </div>

        <button class="logout-btn" id="logout-btn">Abmelden</button>
      </div>
    </div>`;

  container.querySelector('#logout-btn').addEventListener('click', () => {
    saveAccount(null);
    renderLoggedOut(container, 'anmelden');
  });
}
