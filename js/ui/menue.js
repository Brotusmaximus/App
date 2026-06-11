import { navigiere } from '../app.js';

const NAV_ITEMS = [
  { view: 'suche',         label: 'Suche',        icon: searchIcon() },
  { view: 'watchlist',     label: 'Watchlist',    icon: bookmarkIcon(), badge: true },
  { view: 'einstellungen', label: 'Einstellungen',icon: gearIcon() },
  { view: 'account',       label: 'Account',      icon: personIcon() },
];

function searchIcon() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>`;
}

function bookmarkIcon() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>`;
}

function gearIcon() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
}

function personIcon() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

function getWatchlistCount() {
  try {
    const wl = JSON.parse(localStorage.getItem('kartenwert_watchlist') || '[]');
    return wl.length;
  } catch {
    return 0;
  }
}

export function renderMenue(state) {
  const nav = document.getElementById('nav-bar');
  const wlCount = getWatchlistCount();

  nav.innerHTML = `
    <div class="nav-logo">◈ Kartenwert</div>
    <div class="nav-spacer"></div>
    ${NAV_ITEMS.map(item => {
      const isActive = state.view === item.view;
      const badge = item.badge && wlCount > 0
        ? `<span class="nav-badge">${wlCount}</span>`
        : '';
      return `
        <button class="nav-item${isActive ? ' active' : ''}" data-view="${item.view}" aria-label="${item.label}">
          ${item.icon}
          <span class="nav-label">${item.label}</span>
          ${badge}
        </button>`;
    }).join('')}
  `;

  nav.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigiere(btn.dataset.view));
  });
}
