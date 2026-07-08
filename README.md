# Kartenwert

Pokemon-Karten Preistracker — Phase 2 (echte Cardmarket-Preisdaten via GitHub Actions)

## Starten

Da die App ES-Module verwendet, muss sie über einen lokalen Server geöffnet werden:

```bash
npx serve .
# oder
npx http-server .
```

Dann im Browser: http://localhost:3000

> Direkte Datei-Öffnung (`file://`) funktioniert nicht (Browser-Sicherheitsregeln für ES-Module).

## Funktionen

- Kartensuche mit Echtzeit-Filter (aus `data/catalog.json`)
- Preis-Basis-Selektor: Trend / Low / Low EX+ / DE Pro Low / Ø7 / Ø30
- Normal/Foil-Umschalter
- Preisverlauf-Chart (1T / 1W / 1M / 1J / Max) – aus täglicher Historien-Datenbank
- Watchlist mit localStorage-Persistenz
- „idProducts exportieren"-Button für `config/watchlist.json`
- Einstellungen & Account-Mock (Demo)

## Provider-Wechsel (Einzeiler in js/app.js)

```js
// Phase 1 – Mock-Daten (Standard):
import { MockProvider } from './datenquelle/mockProvider.js';
export const provider = new MockProvider();

// Phase 2 – echte CM-Daten → Kommentar tauschen:
// import { CardmarketFileProvider } from './datenquelle/cardmarketFileProvider.js';
// export const provider = new CardmarketFileProvider();
```

## Phase 2: Cardmarket-Daten einrichten

### 1. Karten-IDs ermitteln
Suche deine Karten auf cardmarket.com. Die `idProduct` steht in der URL:
`/en/Pokemon/Products/Singles/Basis-Set/Glurak?idProduct=394064`

### 2. config/watchlist.json aktualisieren
Ersetze die Beispiel-IDs durch echte Cardmarket-IDs:
```json
[
  { "idProduct": "394064", "name": "Glurak Basis-Set" },
  { "idProduct": "394066", "name": "Bisaflor Basis-Set" }
]
```

### 3. GitHub Secrets setzen
Gehe zu: Repository → Settings → Secrets and variables → Actions

| Secret | Inhalt |
|---|---|
| `CARDMARKET_COOKIE` | Session-Cookie nach Login (aus Browser DevTools) |
| `CM_CATALOG_URL` | Download-URL des Katalog-ZIP (nach Login auf der CM Download-Seite) |
| `CM_PRICEGUIDE_URL` | Download-URL des Preisguide-ZIP |

Ausführliche Anleitung: **docs/datenquelle.md**

### 4. GitHub Action auslösen
Repository → Actions → „Update Cardmarket Prices" → „Run workflow"

### 5. Provider aktivieren
In `js/app.js` die zwei Kommentarzeilen tauschen (siehe oben).

## Datenstruktur

```
data/
├─ catalog.json          # Produktkatalog (alle Pokémon-Singles)
├─ latest.json           # Aktuelle Preise der beobachteten Karten
└─ history/{id}.json     # Täglicher Preisverlauf je Karte

config/
└─ watchlist.json        # idProducts die der Hintergrund-Job trackt
```

Watchlist der App, Einstellungen: `localStorage` des Browsers.

## Bilder

`assets/karten/` enthält SVG-Platzhalter. Echte Kartenbilder gehören Nintendo/The Pokémon Company
und dürfen nicht ohne weiteres genutzt werden. Cardmarket-Bild-URLs werden nicht gespiegelt.

## Bekannte Einschränkungen (Phase 2)

- **Kein Preis nach Sprache:** CM-Dateien liefern keinen sprachspezifischen Preis (kein EN/FR etc.)
- **Kein Zustand (NM/EX/...):** Nur Low (alle Zustände) und Low EX+ verfügbar
- **Historie startet bei Null:** Der Chart füllt sich täglich; vor dem ersten Job-Lauf keine Daten
- **Login erforderlich:** CM-Download benötigt eine gültige Session (Cookie läuft nach ~60 Tagen ab)

Die Sprach-/Zustandsbuttons sind im Code auskommentiert (Marker: `PHASE-3-REAKTIVIERUNG`)
und können für Phase 3 reaktiviert werden, sobald granulare CM-API verfügbar ist.

## Roadmap

- [x] Phase 1: Mock-Daten, vollständige UI
- [x] Phase 2: Cardmarket Preisguide via GitHub Actions
- [ ] Phase 3: Direkte Cardmarket-API (Sprache/Zustand granular)
- [ ] PWA: Manifest + Service Worker
- [ ] APK: Capacitor-Wrapper
