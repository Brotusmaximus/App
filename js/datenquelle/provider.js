/**
 * Provider-Vertrag v2
 *
 * Phase 2: Signatur nutzt preisbasis + foil statt sprache + zustand.
 * Phase 3: Reaktivierung der alten Signatur sobald granulare API verfügbar.
 *          Suche nach: PHASE-3-REAKTIVIERUNG
 *
 * preisbasis: 'trend' | 'lowPrice' | 'lowPriceEx' | 'germanProLow' | 'avg7' | 'avg30'
 */
export class Provider {
  /** @param {string} query @returns {Promise<Karte[]>} */
  async sucheKarten(query) { throw new Error('Not implemented'); }

  /** @param {string} id @returns {Promise<Karte>} */
  async getKarte(id) { throw new Error('Not implemented'); }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getAktuellerPreis(id, sprache, zustand)
  /** @param {string} id @param {string} preisbasis @param {boolean} foil @returns {Promise<number|null>} */
  async getAktuellerPreis(id, preisbasis, foil) { throw new Error('Not implemented'); }

  // PHASE-3-REAKTIVIERUNG: alte Signatur → getPreisHistorie(id, sprache, zustand, range)
  /** @param {string} id @param {string} preisbasis @param {boolean} foil @param {string} range @returns {Promise<Array<{t:string,preis:number}>>} */
  async getPreisHistorie(id, preisbasis, foil, range) { throw new Error('Not implemented'); }
}
