// Vertrag: jede Datenquelle muss diese vier Methoden implementieren.
export class Provider {
  async sucheKarten(query) { throw new Error('Not implemented'); }
  async getKarte(id) { throw new Error('Not implemented'); }
  async getAktuellerPreis(id, sprache, zustand) { throw new Error('Not implemented'); }
  async getPreisHistorie(id, sprache, zustand, range) { throw new Error('Not implemented'); }
}
