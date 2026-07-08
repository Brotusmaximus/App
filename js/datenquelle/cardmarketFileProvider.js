import { Provider } from './provider.js';

/**
 * CardmarketFileProvider
 *
 * Liest Daten aus den von GitHub Actions täglich aktualisierten JSON-Dateien:
 *   data/catalog.json      – Produktkatalog (alle Pokémon-Singles)
 *   data/latest.json       – Aktuelle Preise beobachteter Karten
 *   data/history/{id}.json – Täglicher Preisverlauf je Karte
 *
 * Preisfeld-Schema in latest.json und history/*.json:
 *   trend, low, avg, avg1, avg7, avg30          – Normal-Version
 *   holoTrend, holoLow, holoAvg, holoAvg7, ...  – Holo-Version
 *   (abgeleitet aus CM-Feldern trend-holo, low-holo, avg-holo etc.)
 */
export class CardmarketFileProvider extends Provider {
  constructor() {
    super();
    this._catalog      = null;
    this._catalogIndex = null;
    this._latest       = null;
    this._historyCache = {};
  }

  // ── Loader ───────────────────────────────────────────────────────────────

  async _ladeCatalog() {
    if (!this._catalog) {
      const res = await fetch('data/catalog.json');
      if (!res.ok) throw new Error(`Katalog nicht verfügbar (HTTP ${res.status})`);
      this._catalog = await res.json();
      this._catalogIndex = {};
      for (const k of this._catalog) this._catalogIndex[String(k.idProduct)] = k;
    }
    return this._catalog;
  }

  async _ladeLatest() {
    if (!this._latest) {
      const res = await fetch('data/latest.json');
      this._latest = res.ok ? await res.json() : {};
    }
    return this._latest;
  }

  async _ladeHistory(id) {
    const key = String(id);
    if (!this._historyCache[key]) {
      const res = await fetch(`data/history/${key}.json`);
      this._historyCache[key] = res.ok ? await res.json() : [];
    }
    return this._historyCache[key];
  }

  // ── Provider-Interface ───────────────────────────────────────────────────

  async sucheKarten(query) {
    const catalog = await this._ladeCatalog();
    if (!query || !query.trim()) return catalog;
    const q = query.trim().toLowerCase();
    return catalog.filter(k =>
      k.name.toLowerCase().includes(q)        ||
      (k.expansion || '').toLowerCase().includes(q) ||
      (k.number || '').toLowerCase().includes(q)    ||
      (k.rarity  || '').toLowerCase().includes(q)
    );
  }

  async getKarte(id) {
    await this._ladeCatalog();
    const karte = this._catalogIndex?.[String(id)];
    if (!karte) throw new Error(`Karte nicht gefunden: ${id}`);
    return { ...karte, bild: karte.bild || 'assets/karten/placeholder.svg' };
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getAktuellerPreis(id, sprache, zustand)
  async getAktuellerPreis(id, preisbasis = 'trend', holo = false) {
    const latest  = await this._ladeLatest();
    const eintrag = latest[String(id)];
    if (!eintrag) return null;
    return eintrag[_preisbasisFeld(preisbasis, holo)] ?? null;
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getPreisHistorie(id, sprache, zustand, range)
  async getPreisHistorie(id, preisbasis = 'trend', holo = false, range = '1M') {
    const history = await this._ladeHistory(id);
    if (!history || history.length === 0) return [];
    const feld = _preisbasisFeld(preisbasis, holo);
    return _filterByRange(history, range)
      .filter(p => p[feld] != null)
      .map(p => ({ t: p.datum, preis: p[feld] }));
  }
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Mappt preisbasis + holo → konkreter Feldname in latest.json / history.json
 *
 * Normal-Felder: trend | low | avg | avg1 | avg7 | avg30
 * Holo-Felder:  holoTrend | holoLow | holoAvg | holoAvg1 | holoAvg7 | holoAvg30
 * (CM-Quelle:   trend-holo, low-holo, avg-holo, avg1-holo, avg7-holo, avg30-holo)
 */
function _preisbasisFeld(preisbasis, holo) {
  if (!holo) return preisbasis;
  const HOLO_MAP = {
    trend: 'holoTrend',
    low:   'holoLow',
    avg:   'holoAvg',
    avg1:  'holoAvg1',
    avg7:  'holoAvg7',
    avg30: 'holoAvg30',
  };
  return HOLO_MAP[preisbasis] ?? preisbasis;
}

function _filterByRange(history, range) {
  const now = new Date();
  let cutoff;
  switch (range) {
    case '1T': { const d = new Date(now); d.setDate(d.getDate() - 1);       cutoff = d; break; }
    case '1W': { const d = new Date(now); d.setDate(d.getDate() - 7);       cutoff = d; break; }
    case '1M': { const d = new Date(now); d.setMonth(d.getMonth() - 1);     cutoff = d; break; }
    case '1J': { const d = new Date(now); d.setFullYear(d.getFullYear()-1); cutoff = d; break; }
    default:  return history;
  }
  const cutStr = cutoff.toISOString().slice(0, 10);
  return history.filter(p => p.datum >= cutStr);
}
