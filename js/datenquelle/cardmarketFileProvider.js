import { Provider } from './provider.js';

/**
 * CardmarketFileProvider
 *
 * Liest Daten aus den von GitHub Actions täglich aktualisierten JSON-Dateien:
 *   data/catalog.json      – Produktkatalog (alle Pokémon-Singles)
 *   data/latest.json       – Aktuelle Preise beobachteter Karten
 *   data/history/{id}.json – Täglicher Preisverlauf je Karte
 *
 * Implementiert den Provider-Vertrag v2 (preisbasis + foil).
 */
export class CardmarketFileProvider extends Provider {
  constructor() {
    super();
    this._catalog      = null;
    this._catalogIndex = null; // {idProduct → karte}
    this._latest       = null;
    this._historyCache = {};
  }

  // ── Interner Loader ──────────────────────────────────────────────────────

  async _ladeCatalog() {
    if (!this._catalog) {
      const res = await fetch('data/catalog.json');
      if (!res.ok) throw new Error(`Katalog nicht verfügbar (HTTP ${res.status})`);
      this._catalog = await res.json();
      this._catalogIndex = {};
      for (const karte of this._catalog) {
        this._catalogIndex[String(karte.idProduct)] = karte;
      }
    }
    return this._catalog;
  }

  async _ladeLatest() {
    if (!this._latest) {
      const res = await fetch('data/latest.json');
      if (!res.ok) {
        this._latest = {};
        return this._latest;
      }
      this._latest = await res.json();
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
      k.name.toLowerCase().includes(q)      ||
      k.expansion.toLowerCase().includes(q) ||
      k.number?.toLowerCase().includes(q)   ||
      k.rarity?.toLowerCase().includes(q)
    );
  }

  async getKarte(id) {
    await this._ladeCatalog();
    const karte = this._catalogIndex?.[String(id)];
    if (!karte) throw new Error(`Karte nicht gefunden: ${id}`);
    // Fallback für fehlendes Bild
    return { ...karte, bild: karte.bild || 'assets/karten/placeholder.svg' };
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getAktuellerPreis(id, sprache, zustand)
  async getAktuellerPreis(id, preisbasis = 'trend', foil = false) {
    const latest  = await this._ladeLatest();
    const eintrag = latest[String(id)];
    if (!eintrag) return null; // Noch nicht in der Watchlist des Hintergrund-Jobs

    const feld = _preisbasisFeld(preisbasis, foil);
    return eintrag[feld] ?? null;
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getPreisHistorie(id, sprache, zustand, range)
  async getPreisHistorie(id, preisbasis = 'trend', foil = false, range = '1M') {
    const history = await this._ladeHistory(id);
    if (!history || history.length === 0) return [];

    const feld     = _preisbasisFeld(preisbasis, foil);
    const gefiltert = _filterByRange(history, range);

    return gefiltert
      .filter(punkt => punkt[feld] != null)
      .map(punkt => ({ t: punkt.datum, preis: punkt[feld] }));
  }
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Mappt preisbasis + foil auf das JSON-Feldnamen aus latest.json / history.json
 */
function _preisbasisFeld(preisbasis, foil) {
  if (!foil) return preisbasis;
  const FOIL_MAP = {
    trend:        'foilTrend',
    lowPrice:     'foilLow',
    lowPriceEx:   'foilLow',    // kein separates foilLowEx – nächste Entsprechung
    germanProLow: 'germanProLow', // kein Foil-Äquivalent bei CM
    avg7:         'foilAvg7',
    avg30:        'foilAvg30',
  };
  return FOIL_MAP[preisbasis] ?? preisbasis;
}

/**
 * Filtert die tägliche Historien-Liste nach Zeitraum.
 * history-Einträge haben ein ISO-Date-Feld "datum" (YYYY-MM-DD).
 */
function _filterByRange(history, range) {
  const jetzt = new Date();
  let cutoff;

  switch (range) {
    case '1T': { const d = new Date(jetzt); d.setDate(d.getDate() - 1);       cutoff = d; break; }
    case '1W': { const d = new Date(jetzt); d.setDate(d.getDate() - 7);       cutoff = d; break; }
    case '1M': { const d = new Date(jetzt); d.setMonth(d.getMonth() - 1);     cutoff = d; break; }
    case '1J': { const d = new Date(jetzt); d.setFullYear(d.getFullYear()-1); cutoff = d; break; }
    case 'Max': default: cutoff = null;
  }

  if (!cutoff) return history;
  const cutStr = cutoff.toISOString().slice(0, 10);
  return history.filter(p => p.datum >= cutStr);
}
