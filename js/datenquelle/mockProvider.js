import { Provider } from './provider.js';

// PHASE-3-REAKTIVIERUNG: Sprach-/Zustandsmultiplikatoren reaktivieren,
// sobald die granulare Cardmarket-API verfügbar ist.
//
// const SPRACHE_MULTI = { DE: 1.0, EN: 0.88, FR: 0.82, IT: 0.77, ES: 0.75 };
// const ZUSTAND_MULTI = { NM: 1.0, EX: 0.78, GD: 0.58, LP: 0.42, PL: 0.28, PO: 0.14 };

// Phase 2: preisbasis-Varianten simulieren leicht unterschiedliche Preise
const PREISBASIS_MULTI = {
  trend:        1.00,
  lowPrice:     0.87,
  lowPriceEx:   0.96,
  germanProLow: 0.92,
  avg7:         0.99,
  avg30:        0.97,
};

// Simple seeded pseudo-random number generator (mulberry32)
function seededRandom(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function strToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export class MockProvider extends Provider {
  constructor() {
    super();
    this._karten = null;
  }

  async _ladeKarten() {
    if (!this._karten) {
      const res = await fetch('daten/karten.json');
      if (!res.ok) throw new Error('Karten konnten nicht geladen werden');
      this._karten = await res.json();
    }
    return this._karten;
  }

  async sucheKarten(query) {
    const karten = await this._ladeKarten();
    if (!query || query.trim() === '') return karten;
    const q = query.trim().toLowerCase();
    return karten.filter(k =>
      k.name.toLowerCase().includes(q) ||
      k.set.toLowerCase().includes(q) ||
      k.nr.toLowerCase().includes(q) ||
      k.rarity.toLowerCase().includes(q)
    );
  }

  async getKarte(id) {
    const karten = await this._ladeKarten();
    const karte = karten.find(k => k.id === id);
    if (!karte) throw new Error(`Karte nicht gefunden: ${id}`);
    return karte;
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getAktuellerPreis(id, sprache, zustand)
  async getAktuellerPreis(id, preisbasis = 'trend', foil = false) {
    const karte = await this.getKarte(id);
    const pMulti = PREISBASIS_MULTI[preisbasis] ?? 1.0;
    const fMulti = foil ? 1.85 : 1.0;
    const basis  = karte.basisPreis * pMulti * fMulti;
    const rng    = seededRandom(strToSeed(`${id}-${preisbasis}-${foil}-current`));
    const noise  = 1 + (rng() - 0.5) * 0.04;
    return Math.round(basis * noise * 100) / 100;
  }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getPreisHistorie(id, sprache, zustand, range)
  async getPreisHistorie(id, preisbasis = 'trend', foil = false, range = '1M') {
    const aktuellerPreis = await this.getAktuellerPreis(id, preisbasis, foil);
    const seedKey = `${id}-${preisbasis}-${foil}-${range}`;
    const rng = seededRandom(strToSeed(seedKey));

    let labels = [];
    let count = 0;

    switch (range) {
      case '1T':
        count = 24;
        labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
        break;
      case '1W':
        count = 7;
        labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
        break;
      case '1M':
        count = 30;
        labels = Array.from({ length: 30 }, (_, i) => `T-${29 - i}`);
        break;
      case '1J':
        count = 12;
        {
          const monate = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
          const now = new Date();
          labels = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now);
            d.setMonth(d.getMonth() - (11 - i));
            return monate[d.getMonth()];
          });
        }
        break;
      case 'Max':
        count = 36;
        labels = Array.from({ length: 36 }, (_, i) => `M-${35 - i}`);
        break;
      default:
        count = 30;
        labels = Array.from({ length: 30 }, (_, i) => `T-${29 - i}`);
    }

    // Generate realistic price walk
    // Start at ~70% of current price, trend upward with sin-based noise
    const startPreis = aktuellerPreis * 0.70;
    const endPreis = aktuellerPreis;
    const punkte = [];

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); // 0..1
      // Linear trend from start to end
      const trend = startPreis + (endPreis - startPreis) * t;
      // Sin-based noise wave
      const sinNoise = Math.sin(t * Math.PI * 4 + rng() * Math.PI) * aktuellerPreis * 0.05;
      // Additional random noise (±3%)
      const randomNoise = (rng() - 0.5) * aktuellerPreis * 0.06;
      const preis = Math.max(trend + sinNoise + randomNoise, aktuellerPreis * 0.1);
      punkte.push({
        t: labels[i],
        preis: Math.round(preis * 100) / 100,
      });
    }

    // Ensure last point matches current price closely
    punkte[punkte.length - 1].preis = aktuellerPreis;

    return punkte;
  }
}
