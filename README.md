# Kartenwert

Pokemon-Karten Preistracker — Phase 1 (Mock-Daten)

## Starten

Da die App ES-Module verwendet, muss sie über einen lokalen Server geöffnet werden:

```bash
npx serve .
# oder
npx http-server .
```

Dann im Browser: http://localhost:3000

> Direkte Datei-Öffnung (file://) funktioniert nicht durch Browser-Sicherheitsregeln für ES-Module.

## Funktionen

- Kartensuche mit Echtzeit-Filter
- Preis nach Sprache (DE/EN/FR/IT/ES) und Zustand (NM/EX/GD/LP/PL/PO)
- Preisverlauf-Chart (1T/1W/1M/1J/Max)
- Watchlist mit Persistenz (localStorage)
- Einstellungen
- Account-Mock (Demo)

## Architektur: Provider-Vertrag

Alle Daten laufen durch `js/datenquelle/provider.js`. In Phase 1 liefert `MockProvider` erfundene Daten.

**Phase 2 — API anbinden:**
1. Neue Datei `js/datenquelle/cardmarketProvider.js` anlegen
2. Die Klasse `CardmarketProvider extends Provider` implementieren
3. In `js/app.js` eine Zeile ändern:
   ```js
   // Phase 1:
   import { MockProvider } from './datenquelle/mockProvider.js';
   export const provider = new MockProvider();

   // Phase 2:
   import { CardmarketProvider } from './datenquelle/cardmarketProvider.js';
   export const provider = new CardmarketProvider({ apiKey: '...' });
   ```

Der Rest der App bleibt unverändert.

## Datenstruktur

Karten: `daten/karten.json`  
Watchlist, Einstellungen: localStorage des Browsers

## Bilder

`assets/karten/` enthält SVG-Platzhalter. Echte Kartenbilder gehören Nintendo/The Pokémon Company und dürfen nicht ohne weiteres genutzt werden.

## Roadmap

- [ ] Phase 2: Cardmarket API anbinden
- [ ] PWA: Manifest + Service Worker
- [ ] APK: Capacitor-Wrapper
