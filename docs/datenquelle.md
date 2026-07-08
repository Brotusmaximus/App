# Datenquelle: Cardmarket Preisguide-Download

## Ergebnis der Prüfung (Abschnitt 1 der UEBERGABE Phase 2)

**Datum:** 2026-07-08  
**Geprüfte URL:** `https://www.cardmarket.com/en/Pokemon/Data/Download`

### Befund

| Test | Ergebnis |
|---|---|
| Unauth. HTTP-GET auf Download-Seite | **HTTP 403** (Cloudflare-Block) |
| Unauth. GET auf S3-Bucket (`downloads.s3.cardmarket.com`) | **HTTP 403** (AccessDenied, XML) |
| Bekannte S3-Pfade (`Pokemon.zip`, `PokemonSingles.zip`) | **HTTP 403** |

**Fazit: Login ist zwingend erforderlich.** Ohne gültige Cardmarket-Session liefern alle Endpunkte 403.

### Datei-Format (laut Cardmarket-Dokumentation und Community-Berichten)

- **Format:** ZIP-Archiv mit einer oder mehreren CSV-Dateien darin
- **Trennzeichen:** Vermutlich Semikolon (`;`) — in der echten Datei nachprüfen!
- **Encoding:** UTF-8
- **Preisguide-Felder (bekannt):** `idProduct`, `Avg. Sell Price`, `Low Price`, `Trend Price`, `German Pro Low`, `Suggested Price`, `Foil Sell`, `Foil Low`, `Foil Trend`, `Avg. 1 Day Ago`, `Avg. 7 Days Ago`, `Avg. 30 Days Ago`
- **Katalog-Felder (bekannt):** `idProduct`, `Name`, `Expansion`, `Number`, `Rarity`

> ⚠ Die tatsächlichen Spaltenbezeichnungen können von den obigen abweichen. Das Build-Skript (`scripts/update-prices.js`) versucht mehrere bekannte Varianten; nach dem ersten erfolgreichen Download bitte `data/raw/field-log.txt` prüfen und ggf. anpassen.

---

## Zwei Fallback-Optionen (Auftraggeber wählt)

### Option A: Session-Cookie als GitHub Secret (empfohlen)

1. In Cardmarket einloggen (Browser)
2. DevTools öffnen → Application → Cookies → `www.cardmarket.com`
3. Alle Cookie-Werte als einen String zusammenbauen:
   ```
   SESSION=abc123; user_id=12345; ...
   ```
4. In GitHub Repository → Settings → Secrets → Actions:
   - `CARDMARKET_COOKIE` = der Cookie-String von oben
5. Download-URLs der Dateien ermitteln (nach Login auf die Download-Seite gehen, Download-Button mit DevTools → Network interceptieren):
   - `CM_CATALOG_URL` = URL des Katalog-Downloads
   - `CM_PRICEGUIDE_URL` = URL des Preisguide-Downloads

**Achtung:** Session-Cookies laufen ab (typisch nach 30–90 Tagen). Das Secret muss dann erneuert werden. Der Workflow loggt einen Fehler wenn der Cookie abgelaufen ist.

**Achtung:** Pre-Signed S3-URLs können ebenfalls ablaufen. Falls der Download fehlschlägt, auf der Download-Seite neue URLs generieren.

### Option B: Manueller Upload

Kein GitHub Secret nötig. Dateien werden manuell hochgeladen:

1. Auf `www.cardmarket.com/en/Pokemon/Data/Download` einloggen
2. Katalog-ZIP und Preisguide-ZIP herunterladen
3. CSVs aus den ZIPs extrahieren
4. Als `data/raw/catalog.csv` und `data/raw/priceguide.csv` in das Repo commiten
5. GitHub Action manuell via `workflow_dispatch` auslösen

Das Skript erkennt die manuellen Uploads automatisch, wenn keine Download-URLs gesetzt sind.

---

## Bekannte Risiken

| Risiko | Wahrscheinlichkeit | Maßnahme |
|---|---|---|
| Login-Wall (Hauptrisiko) | Bestätigt | Siehe Optionen A/B oben |
| Session-Cookie läuft ab | Hoch | Alle 30–60 Tage erneuern |
| S3-URL läuft ab | Mittel | URL neu generieren nach Login |
| Feldnamen weichen ab | Mittel | Skript unterstützt Varianten; `field-log.txt` prüfen |
| Katalog zu groß (>5 MB) | Mittel | Pro-Set aufteilen (→ Phase 3) |
| Cardmarket ändert Format | Niedrig | `scripts/update-prices.js` anpassen |

---

## Daten-Einschränkungen (Phase 2)

| Feature | Phase 1 (Mock) | Phase 2 (CM-Dateien) |
|---|---|---|
| Sprache pro Angebot | Simuliert | ❌ Nicht verfügbar (kein Feld) |
| Zustand (NM/EX/...) | Simuliert | Teilweise: Low (alle) + Low EX+ |
| Echte Preishistorie | Generiert | Wird täglich aufgebaut (startet bei 0) |
| Foil-Preise | Simuliert | ✓ Separate Felder |
| Trend/Durchschnitte | Generiert | ✓ AVG1/AVG7/AVG30 |

Die Sprach- und Zustandsbuttons wurden in der UI auskommentiert (Marker: `PHASE-3-REAKTIVIERUNG`). Sie bleiben reaktivierbar für Phase 3 (direkte API).

---

## Erste Inbetriebnahme (Schritt für Schritt)

1. Echte `idProduct`-Werte für die gewünschten Karten in `config/watchlist.json` eintragen  
   (IDs aus dem Cardmarket-Katalog oder von der Produktseite einer Karte)
2. GitHub Secrets setzen (Option A) oder Dateien hochladen (Option B)
3. GitHub Action manuell auslösen: Repository → Actions → „Update Cardmarket Prices" → „Run workflow"
4. In `data/` prüfen ob `catalog.json`, `latest.json` und `data/history/*.json` entstanden sind
5. App öffnen: Karten aus der Watchlist zeigen jetzt echte Preise

---

## Provider-Wechsel (app.js)

```js
// Phase 1 (Mock-Daten):
import { MockProvider } from './datenquelle/mockProvider.js';
export const provider = new MockProvider();

// Phase 2 (echte CM-Daten):
import { CardmarketFileProvider } from './datenquelle/cardmarketFileProvider.js';
export const provider = new CardmarketFileProvider();
```

Nur diese eine Zeile ändern. Der Rest der App bleibt unberührt.
