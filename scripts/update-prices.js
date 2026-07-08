#!/usr/bin/env node
/**
 * Kartenwert – Cardmarket Preisguide Updater (Phase 2.1)
 *
 * Verarbeitet JSON-Exporte von Cardmarket aus data/raw/:
 *   price_guide*.json      – Preisguide  (Struktur: { priceGuides: [...] })
 *   products_singles*.json – Katalog Einzelkarten
 *   products_nonsingles*.json – Katalog Sealed/Zubehör (optional)
 *
 * Dateien werden per Präfix erkannt, nicht per festem Namen.
 * Leerzeichen und Klammern im Dateinamen (z. B. "products_singles_6 (1).json") kein Problem.
 *
 * Optional: Download via CARDMARKET_COOKIE + CM_*_URL Secrets (ZIP → JSON/CSV).
 * Robustheit: null-Werte im Preisguide sind normal, niemals abbrechen wegen einzelner
 * fehlender Karte.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const { execSync } = require('child_process');

// ── Pfade ────────────────────────────────────────────────────────────────────

const ROOT        = path.join(__dirname, '..');
const DATA_DIR    = path.join(ROOT, 'data');
const RAW_DIR     = path.join(DATA_DIR, 'raw');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const CONFIG_DIR  = path.join(ROOT, 'config');

fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Umgebung ──────────────────────────────────────────────────────────────────

const COOKIE         = process.env.CARDMARKET_COOKIE  || '';
const CATALOG_URL    = process.env.CM_CATALOG_URL     || '';
const PRICEGUIDE_URL = process.env.CM_PRICEGUIDE_URL  || '';

// ── Datei-Erkennung per Präfix ────────────────────────────────────────────────

/**
 * Sucht in RAW_DIR nach einer Datei deren Name mit `prefix` beginnt (case-insensitiv)
 * und mit `.json` endet. Gibt den vollständigen Pfad zurück oder null.
 */
function findRawFile(prefix) {
  if (!fs.existsSync(RAW_DIR)) return null;
  const lower = prefix.toLowerCase();
  const match = fs.readdirSync(RAW_DIR).find(f =>
    f.toLowerCase().startsWith(lower) && f.toLowerCase().endsWith('.json')
  );
  return match ? path.join(RAW_DIR, match) : null;
}

// ── Zahlparser ────────────────────────────────────────────────────────────────

function parseNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// ── Root-Array aus JSON-Dokument finden ───────────────────────────────────────

/**
 * Cardmarket-JSONs haben typischerweise einen Wrapper-Schlüssel.
 * Preisguide: { "priceGuides": [...] }
 * Katalog:    { "products": [...] } oder direkt ein Array.
 * Gibt das enthaltene Array zurück.
 */
function rootArray(data) {
  if (Array.isArray(data)) return data;
  // Erster Array-Wert im Objekt
  const arrayVal = Object.values(data).find(v => Array.isArray(v));
  return arrayVal || [];
}

// ── Preisguide-Parser ──────────────────────────────────────────────────────────

/**
 * Verarbeitet die Preisguide-JSON und gibt ein Mapping { idProduct → Preisfelder } zurück.
 *
 * Bekannte Felder der Cardmarket-Preisguide-JSON (Stand 2026):
 *   idProduct   – int, Primärschlüssel
 *   avg         – Durchschnittlicher Verkaufspreis
 *   low         – Niedrigster Angebotspreis
 *   trend       – Trend-Preis (CM-eigene Berechnung)
 *   avg1        – Ø 1 Tag (oft null)
 *   avg7        – Ø 7 Tage (oft null)
 *   avg30       – Ø 30 Tage (oft null)
 *   avg-holo    – Ø Holo-Version
 *   low-holo    – Low Holo-Version
 *   trend-holo  – Trend Holo-Version
 *   avg1-holo, avg7-holo, avg30-holo – (teils null)
 *
 * Felder mit Bindestrich müssen über Klammerschreibweise gelesen werden:
 *   entry["trend-holo"]  (nicht entry.trend-holo)
 */
function parsePreisguideJSON(content) {
  const data = JSON.parse(content);
  const entries = rootArray(data);

  console.log(`  Preisguide: ${entries.length.toLocaleString()} Einträge`);

  if (entries.length > 0) {
    const keys = Object.keys(entries[0]);
    console.log(`  Felder (erste Eintrags-Keys): ${keys.slice(0, 15).join(', ')}`);
    fs.writeFileSync(
      path.join(RAW_DIR, 'field-log-priceguide.txt'),
      `Erkannte Felder (${TODAY}):\n${keys.join('\n')}\n\nBeispiel-Eintrag:\n${JSON.stringify(entries[0], null, 2)}\n`,
    );
  }

  const priceMap = {};
  for (const e of entries) {
    const id = String(e.idProduct);
    if (!id || id === 'undefined') continue;
    priceMap[id] = {
      trend:     parseNum(e.trend),
      low:       parseNum(e.low),
      avg:       parseNum(e.avg),
      avg1:      parseNum(e.avg1),
      avg7:      parseNum(e.avg7),
      avg30:     parseNum(e.avg30),
      // Holo-Varianten (Bindestrich-Felder)
      holoTrend: parseNum(e['trend-holo']),
      holoLow:   parseNum(e['low-holo']),
      holoAvg:   parseNum(e['avg-holo']),
      holoAvg1:  parseNum(e['avg1-holo']),
      holoAvg7:  parseNum(e['avg7-holo']),
      holoAvg30: parseNum(e['avg30-holo']),
    };
  }
  return priceMap;
}

// ── Katalog-Parser ────────────────────────────────────────────────────────────

/**
 * Verarbeitet eine Katalog-JSON (Singles oder Non-Singles).
 *
 * Bekannte Felder der Cardmarket-Katalog-JSON (werden beim ersten Run geloggt):
 *   idProduct     – int, Primärschlüssel
 *   Name          – Kartenname
 *   Expansion Name – Set/Expansion
 *   Number        – Kartennummer (z. B. "4")
 *   Rarity Name   – Seltenheit
 *   idCategory    – Kategorie-ID innerhalb des Spiels
 *                   (z. B. 52/53 für Pokémon-Untertypen: Singles vs. Sealed)
 *                   Wird geloggt aber nicht gefiltert – alle Einträge werden übernommen.
 *
 * Feldnamen werden tolerant ermittelt (mehrere Schreibvarianten probiert).
 */
function parseKatalogJSON(content, label) {
  const data = JSON.parse(content);
  const entries = rootArray(data);

  console.log(`  Katalog (${label}): ${entries.length.toLocaleString()} Einträge`);

  if (entries.length > 0) {
    const keys = Object.keys(entries[0]);
    console.log(`  Felder: ${keys.slice(0, 15).join(', ')}`);

    // Debug-Log für Feldinspektion
    const logPath = path.join(RAW_DIR, `field-log-catalog-${label}.txt`);
    fs.writeFileSync(
      logPath,
      `Erkannte Felder (${TODAY}):\n${keys.join('\n')}\n\nBeispiel-Eintrag:\n${JSON.stringify(entries[0], null, 2)}\n`,
    );

    // idCategory-Verteilung loggen (Abschnitt 8 der UEBERGABE)
    const catCounts = {};
    for (const e of entries) {
      const cat = String(e.idCategory ?? 'n/a');
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    console.log(`  idCategory-Verteilung: ${JSON.stringify(catCounts)}`);
  }

  const katalog = [];
  for (const e of entries) {
    const id = e.idProduct != null ? String(e.idProduct) : null;
    if (!id) continue;

    // Feldnamen tolerant lesen (mehrere bekannte Varianten)
    const name      = e.Name      || e.name      || e.ProductName || '';
    const expansion = e['Expansion Name'] || e.ExpansionName || e.Expansion || e.expansion || '';
    const number    = e.Number    || e.number    || e.CollectorNumber || '';
    const rarity    = e['Rarity Name']  || e.RarityName  || e.Rarity    || e.rarity    || '';

    if (!name) continue; // Einträge ohne Namen überspringen

    katalog.push({ idProduct: id, name, expansion, number, rarity, bild: null });
  }

  return katalog;
}

// ── Preise für Watchlist extrahieren ─────────────────────────────────────────

function extractWatchlistPreise(priceMap, trackedIds) {
  const latest = {};
  let matched = 0;
  const missing = [];

  for (const id of trackedIds) {
    const prices = priceMap[id];
    if (!prices) {
      missing.push(id);
      continue;
    }
    matched++;
    latest[id] = { ...prices, lastUpdate: TODAY };
  }

  console.log(`  Watchlist: ${matched}/${trackedIds.size} gefunden`);
  if (missing.length > 0) {
    console.warn(`  Nicht im Preisguide: ${missing.join(', ')}`);
    console.warn(`  → idProduct in config/watchlist.json prüfen`);
  }
  return latest;
}

// ── Historie anhängen ─────────────────────────────────────────────────────────

function appendHistorie(idProduct, preise) {
  const histPath = path.join(HISTORY_DIR, `${idProduct}.json`);
  let history = [];

  if (fs.existsSync(histPath)) {
    try { history = JSON.parse(fs.readFileSync(histPath, 'utf8')); }
    catch { console.warn(`  Bestehende Historie für ${idProduct} unlesbar – neu anfangen`); }
  }

  const { lastUpdate, ...preisfelder } = preise;
  const eintrag = { datum: TODAY, ...preisfelder };

  const todayIdx = history.findIndex(e => e.datum === TODAY);
  if (todayIdx >= 0) history[todayIdx] = eintrag;
  else history.push(eintrag);

  if (history.length > 1095) history = history.slice(-1095);
  fs.writeFileSync(histPath, JSON.stringify(history));
}

// ── Optional: Download via Cookie + URL ───────────────────────────────────────

function downloadFile(url, cookie, dest) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'application/zip,application/json,application/octet-stream,*/*',
    };
    if (cookie) headers['Cookie'] = cookie;

    function req(targetUrl, depth) {
      if (depth > 5) { reject(new Error('Zu viele Weiterleitungen')); return; }
      const lib = targetUrl.startsWith('https') ? https : http;
      lib.get(targetUrl, { headers }, res => {
        if (res.statusCode >= 301 && res.statusCode <= 302) return req(res.headers.location, depth + 1);
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    }
    req(url, 0);
  });
}

async function tryDownload(label, url, cookie, dest) {
  if (!url || !cookie) return false;
  process.stdout.write(`  Download ${label}… `);
  try {
    await downloadFile(url, cookie, dest);
    console.log('✓');
    return true;
  } catch (err) {
    console.error(`\n  ❌ ${err.message}`);
    return false;
  }
}

function extractFromZip(zipPath, dest) {
  try {
    const list = execSync(`unzip -l "${zipPath}"`).toString();
    const m = list.match(/\d+\s+\S+\s+\S+\s+([\w\s\(\).-]+\.json)/i);
    if (m) {
      const name = m[1].trim();
      execSync(`unzip -p "${zipPath}" "${name}" > "${dest}"`);
      return true;
    }
    // Fallback: try CSV
    const mc = list.match(/\d+\s+\S+\s+\S+\s+([\w\s\(\).-]+\.csv)/i);
    if (mc) {
      const name = mc[1].trim();
      execSync(`unzip -p "${zipPath}" "${name}" > "${dest}"`);
      return true;
    }
  } catch {}
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log(` Kartenwert Preisguide-Update  ${TODAY}`);
  console.log('══════════════════════════════════════════\n');

  // Watchlist laden
  const watchlistPath = path.join(CONFIG_DIR, 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) {
    console.error('❌ config/watchlist.json nicht gefunden – Abbruch');
    process.exit(1);
  }
  const watchlist  = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
  const trackedIds = new Set(watchlist.map(e => String(e.idProduct)));
  console.log(`Beobachtete Karten (config/watchlist.json): ${trackedIds.size}`);

  // ── Optional: Download versuchen ──────────────────────────────────────────

  if (COOKIE) {
    const tmpDir = '/tmp/kartenwert-dl';
    fs.mkdirSync(tmpDir, { recursive: true });

    if (PRICEGUIDE_URL) {
      const zip  = path.join(tmpDir, 'priceguide.zip');
      const dest = path.join(RAW_DIR, 'price_guide_dl.json');
      if (await tryDownload('Preisguide', PRICEGUIDE_URL, COOKIE, zip)) {
        if (!extractFromZip(zip, dest)) fs.copyFileSync(zip, dest);
      }
    }
    if (CATALOG_URL) {
      const zip  = path.join(tmpDir, 'catalog.zip');
      const dest = path.join(RAW_DIR, 'products_singles_dl.json');
      if (await tryDownload('Katalog', CATALOG_URL, COOKIE, zip)) {
        if (!extractFromZip(zip, dest)) fs.copyFileSync(zip, dest);
      }
    }
    try { execSync('rm -rf /tmp/kartenwert-dl'); } catch {}
  }

  // ── Preisguide lesen ──────────────────────────────────────────────────────

  const priceGuidePath = findRawFile('price_guide');

  if (!priceGuidePath) {
    console.error('\n❌ Kein Preisguide gefunden (erwartet: data/raw/price_guide*.json)');
    console.error('  Datei in data/raw/ ablegen oder CARDMARKET_COOKIE + CM_PRICEGUIDE_URL setzen.');
    process.exit(1);
  }

  console.log(`\nPreisguide: ${path.basename(priceGuidePath)}`);
  let priceMap;
  try {
    const content = fs.readFileSync(priceGuidePath, 'utf8');
    priceMap = parsePreisguideJSON(content);
    console.log(`  ${Object.keys(priceMap).length.toLocaleString()} Preiseinträge verarbeitet`);
  } catch (err) {
    console.error(`  ❌ Preisguide konnte nicht geparst werden: ${err.message}`);
    process.exit(1);
  }

  // ── Katalog lesen ─────────────────────────────────────────────────────────

  const singlesPath    = findRawFile('products_singles');
  const nonSinglesPath = findRawFile('products_nonsingles');

  if (!singlesPath) {
    console.error('\n❌ Kein Katalog gefunden (erwartet: data/raw/products_singles*.json)');
    console.error('  Datei in data/raw/ ablegen oder CARDMARKET_COOKIE + CM_CATALOG_URL setzen.');
    process.exit(1);
  }

  let gesamtKatalog = [];
  for (const [filePath, label] of [[singlesPath, 'singles'], [nonSinglesPath, 'nonsingles']]) {
    if (!filePath) continue;
    console.log(`\nKatalog (${label}): ${path.basename(filePath)}`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const teil    = parseKatalogJSON(content, label);
      gesamtKatalog = gesamtKatalog.concat(teil);
      console.log(`  ${teil.length.toLocaleString()} Einträge`);
    } catch (err) {
      console.error(`  ❌ Katalog (${label}) konnte nicht geparst werden: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Dateien schreiben ──────────────────────────────────────────────────────

  const catalogPath = path.join(DATA_DIR, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(gesamtKatalog));

  console.log(`\nKatalog: ${gesamtKatalog.length.toLocaleString()} Einträge`);
  console.log(`Preisguide: ${Object.keys(priceMap).length.toLocaleString()} Einträge`);
  console.log(`catalog.json geschrieben: ${catalogPath}`);

  let preisAktualisiert = false;

  if (Object.keys(priceMap).length > 0) {
    const watchlistPreise = extractWatchlistPreise(priceMap, trackedIds);

    if (Object.keys(watchlistPreise).length > 0) {
      // Bestehende latest.json mergen (andere Karten nicht löschen)
      let existing = {};
      const latestPath = path.join(DATA_DIR, 'latest.json');
      if (fs.existsSync(latestPath)) {
        try { existing = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch {}
      }
      const merged = { ...existing, ...watchlistPreise };
      fs.writeFileSync(latestPath, JSON.stringify(merged, null, 2));
      console.log(`\n✅ latest.json: ${Object.keys(watchlistPreise).length} Karte(n) aktualisiert`);

      for (const [id, preise] of Object.entries(watchlistPreise)) {
        appendHistorie(id, preise);
      }
      console.log(`✅ Historien: ${Object.keys(watchlistPreise).length} Datei(en) aktualisiert`);
      preisAktualisiert = true;
    }
  }

  // ── Zusammenfassung ────────────────────────────────────────────────────────

  console.log('\n──────────────────────────────────────────');
  console.log('✅ Katalog aktualisiert');
  if (preisAktualisiert) console.log('✅ Preise & Historien aktualisiert');
  console.log(`\nFertig: ${TODAY}`);
  console.log('──────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌ Unerwarteter Fehler:', err.message, err.stack);
  process.exit(1);
});
