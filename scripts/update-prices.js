#!/usr/bin/env node
/**
 * Kartenwert – Cardmarket Preisguide Updater
 *
 * Lädt Produktkatalog und Preisguide von Cardmarket herunter und
 * aktualisiert die Daten-JSON-Dateien im Repository.
 *
 * Konfiguration via Umgebungsvariablen (GitHub Secrets):
 *   CARDMARKET_COOKIE    – Session-Cookie nach Login (Pflicht für Download)
 *   CM_CATALOG_URL       – Download-URL des Katalog-ZIP (optional)
 *   CM_PRICEGUIDE_URL    – Download-URL des Preisguide-ZIP (optional)
 *
 * Alternativ: Dateien manuell als data/raw/catalog.csv und
 * data/raw/priceguide.csv ablegen → Action verarbeitet sie automatisch.
 *
 * Feldnamen-Varianten: Das Skript versucht mehrere bekannte Spaltenbezeichnungen.
 * Nach dem ersten Run data/raw/field-log.txt prüfen und ggf. FIELD_MAP anpassen.
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

// ── Umgebung ─────────────────────────────────────────────────────────────────

const COOKIE        = process.env.CARDMARKET_COOKIE || '';
const CATALOG_URL   = process.env.CM_CATALOG_URL    || '';
const PRICEGUIDE_URL = process.env.CM_PRICEGUIDE_URL || '';

// ── Bekannte Feldname-Varianten ───────────────────────────────────────────────
// Cardmarket ändert die Spaltenbezeichnungen gelegentlich.
// Erster Treffer pro Kategorie wird verwendet.

const FIELD_MAP = {
  idProduct:    ['idProduct', 'ID Product', 'ProductID', 'Id'],
  name:         ['Name', 'CardName', 'ProductName'],
  expansion:    ['Expansion', 'ExpansionName', 'Expansion Name', 'Set', 'SetName'],
  number:       ['Number', 'CollectorNumber', 'Collector Number', 'CardNumber', 'No.'],
  rarity:       ['Rarity', 'RarityName', 'Rarity Name'],
  // Preisfelder
  trend:        ['Trend Price', 'TREND', 'TrendPrice', 'Trend'],
  lowPrice:     ['Low Price', 'LOW', 'LowPrice', 'Min Price', 'Low'],
  lowPriceEx:   ['Low Price Ex+', 'Low (Ex+)', 'LowEx', 'Low Price (Foil Excl.)', 'Low EX+'],
  germanProLow: ['German Pro Low', 'GermanProLow', 'German Low', 'DE Pro Low'],
  avg7:         ['Avg. 7 Days Ago', 'AVG7', 'Avg7DaysAgo', 'Avg. (7 Days)', 'Average 7'],
  avg30:        ['Avg. 30 Days Ago', 'AVG30', 'Avg30DaysAgo', 'Avg. (30 Days)', 'Average 30'],
  foilTrend:    ['Foil Trend', 'TRENDFOIL', 'FoilTrend', 'Foil Trend Price'],
  foilLow:      ['Foil Low', 'LOWFOIL', 'FoilLow', 'Foil Low Price'],
  foilAvg7:     ['Foil Avg. 7 Days', 'AVGFOIL7', 'FoilAvg7', 'Foil Average 7'],
  foilAvg30:    ['Foil Avg. 30 Days', 'AVGFOIL30', 'FoilAvg30', 'Foil Average 30'],
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function findField(row, candidates) {
  for (const name of candidates) {
    const val = row[name];
    if (val !== undefined && val !== '') return val;
  }
  return null;
}

function parseNum(str) {
  if (str === null || str === undefined || str === '' || str === 'N/A' || str === '-') return null;
  const n = parseFloat(String(str).replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// ── CSV-Parser ────────────────────────────────────────────────────────────────

function parseCSV(text, logPath) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];

  // Detect delimiter from first line (semicolon or comma)
  const firstLine = lines[0];
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  console.log(`  CSV-Trennzeichen erkannt: "${delim}"`);

  const headers = parseCSVRow(firstLine, delim);

  // Log detected headers for debugging
  if (logPath) {
    fs.writeFileSync(logPath, `Erkannte Spalten (${TODAY}):\n${headers.join('\n')}\n`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVRow(line, delim);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVRow(line, delim) {
  const result = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Download ──────────────────────────────────────────────────────────────────

function downloadFile(url, cookie, dest) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/zip,application/octet-stream,*/*',
      'Accept-Language': 'de-DE,de;q=0.9',
    };
    if (cookie) headers['Cookie'] = cookie;

    function request(targetUrl, depth) {
      if (depth > 5) { reject(new Error('Zu viele Weiterleitungen')); return; }
      const lib = targetUrl.startsWith('https') ? https : http;
      lib.get(targetUrl, { headers }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 302) {
          return request(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} von ${targetUrl} – Cookie abgelaufen oder URL falsch`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    }

    request(url, 0);
  });
}

// ── ZIP extrahieren ───────────────────────────────────────────────────────────

function extractCSVFromZip(zipPath, prefix) {
  const tmpDir = `/tmp/km-extract-${prefix}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`);
  } catch (e) {
    throw new Error(`unzip fehlgeschlagen: ${e.message}`);
  }

  const files = fs.readdirSync(tmpDir).filter(f => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    throw new Error(`Keine CSV-Datei in ZIP-Archiv ${zipPath} gefunden`);
  }

  if (files.length > 1) {
    console.warn(`  Mehrere CSVs gefunden: ${files.join(', ')} – verwende erste`);
  }

  const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
  execSync(`rm -rf "${tmpDir}"`);
  return content;
}

// ── Katalog verarbeiten ───────────────────────────────────────────────────────

function processKatalog(csvContent) {
  const logPath = path.join(RAW_DIR, 'field-log-catalog.txt');
  const rows = parseCSV(csvContent, logPath);
  console.log(`  ${rows.length.toLocaleString()} Katalog-Einträge gelesen`);

  const katalog = rows
    .filter(row => findField(row, FIELD_MAP.idProduct))
    .map(row => ({
      idProduct: String(findField(row, FIELD_MAP.idProduct)),
      name:      findField(row, FIELD_MAP.name)      || 'Unbekannt',
      expansion: findField(row, FIELD_MAP.expansion) || '',
      number:    findField(row, FIELD_MAP.number)    || '',
      rarity:    findField(row, FIELD_MAP.rarity)    || '',
      bild:      null,
    }));

  return katalog;
}

// ── Preisguide verarbeiten ────────────────────────────────────────────────────

function processPreisguide(csvContent, trackedIds) {
  const logPath = path.join(RAW_DIR, 'field-log-priceguide.txt');
  const rows = parseCSV(csvContent, logPath);
  console.log(`  ${rows.length.toLocaleString()} Preisguide-Einträge gelesen`);

  const latest = {};
  let matched = 0;

  for (const row of rows) {
    const id = String(findField(row, FIELD_MAP.idProduct) || '');
    if (!trackedIds.has(id)) continue;
    matched++;

    latest[id] = {
      trend:        parseNum(findField(row, FIELD_MAP.trend)),
      lowPrice:     parseNum(findField(row, FIELD_MAP.lowPrice)),
      lowPriceEx:   parseNum(findField(row, FIELD_MAP.lowPriceEx)),
      germanProLow: parseNum(findField(row, FIELD_MAP.germanProLow)),
      avg7:         parseNum(findField(row, FIELD_MAP.avg7)),
      avg30:        parseNum(findField(row, FIELD_MAP.avg30)),
      foilTrend:    parseNum(findField(row, FIELD_MAP.foilTrend)),
      foilLow:      parseNum(findField(row, FIELD_MAP.foilLow)),
      foilAvg7:     parseNum(findField(row, FIELD_MAP.foilAvg7)),
      foilAvg30:    parseNum(findField(row, FIELD_MAP.foilAvg30)),
      lastUpdate:   TODAY,
    };
  }

  console.log(`  ${matched} / ${trackedIds.size} beobachtete Karten gefunden`);
  if (matched < trackedIds.size) {
    const missing = [...trackedIds].filter(id => !latest[id]);
    console.warn(`  Nicht im Preisguide: ${missing.join(', ')}`);
    console.warn(`  → IDs in config/watchlist.json prüfen`);
  }

  return latest;
}

// ── Historie anhängen ─────────────────────────────────────────────────────────

function appendHistorie(idProduct, preise) {
  const histPath = path.join(HISTORY_DIR, `${idProduct}.json`);

  let history = [];
  if (fs.existsSync(histPath)) {
    try {
      history = JSON.parse(fs.readFileSync(histPath, 'utf8'));
    } catch {
      console.warn(`  ⚠ Bestehende Historie für ${idProduct} konnte nicht gelesen werden – starte neu`);
    }
  }

  // Kein Duplikat für heute – überschreibe bestehenden Tageseintrag
  const todayIdx = history.findIndex(e => e.datum === TODAY);
  const newEntry  = { datum: TODAY, ...preise };

  if (todayIdx >= 0) {
    history[todayIdx] = newEntry;
  } else {
    history.push(newEntry);
  }

  // Maximal 3 Jahre (1095 Einträge) behalten
  if (history.length > 1095) history = history.slice(-1095);

  fs.writeFileSync(histPath, JSON.stringify(history));
}

// ── Hilfsfunktion: CSV-String aus manueller Datei oder Download ───────────────

async function getCsv(label, url, manualPath, tmpZipSuffix) {
  // 1. Download versuchen
  if (url && COOKIE) {
    const tmpZip = `/tmp/kartenwert-${tmpZipSuffix}.zip`;
    try {
      process.stdout.write(`Lade ${label} herunter… `);
      await downloadFile(url, COOKIE, tmpZip);
      const csv = extractCSVFromZip(tmpZip, tmpZipSuffix);
      console.log('✓');
      try { fs.unlinkSync(tmpZip); } catch {}
      return csv;
    } catch (err) {
      console.error(`\n❌ Download fehlgeschlagen: ${err.message}`);
    }
  }

  // 2. Manuell hochgeladene Datei
  if (fs.existsSync(manualPath)) {
    console.log(`  Verwende manuellen Upload: ${path.relative(ROOT, manualPath)}`);
    return fs.readFileSync(manualPath, 'utf8');
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n══════════════════════════════════════════`);
  console.log(` Kartenwert Preisguide-Update  ${TODAY}`);
  console.log(`══════════════════════════════════════════\n`);

  // Watchlist laden
  const watchlistPath = path.join(CONFIG_DIR, 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) {
    console.error('❌ config/watchlist.json nicht gefunden – Abbruch');
    process.exit(1);
  }
  const watchlist  = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
  const trackedIds = new Set(watchlist.map(e => String(e.idProduct)));
  console.log(`Beobachtete Karten: ${trackedIds.size}`);

  if (!COOKIE && !CATALOG_URL && !PRICEGUIDE_URL) {
    const hasManualCatalog = fs.existsSync(path.join(RAW_DIR, 'catalog.csv'));
    const hasManualPrice   = fs.existsSync(path.join(RAW_DIR, 'priceguide.csv'));
    if (!hasManualCatalog && !hasManualPrice) {
      console.warn('\n⚠  Weder CARDMARKET_COOKIE noch manuelle Dateien in data/raw/ gefunden.');
      console.warn('   Siehe docs/datenquelle.md für Setup-Anleitung.');
      process.exit(0);
    }
  }

  let katalogAktualisiert = false;
  let preiseAktualisiert  = false;

  // ── Katalog ──────────────────────────────────────────────────────────────

  const katalogCsv = await getCsv(
    'Katalog',
    CATALOG_URL,
    path.join(RAW_DIR, 'catalog.csv'),
    'catalog',
  );

  if (katalogCsv) {
    console.log('\nVerarbeite Katalog…');
    const katalog = processKatalog(katalogCsv);
    if (katalog.length > 0) {
      fs.writeFileSync(path.join(DATA_DIR, 'catalog.json'), JSON.stringify(katalog));
      console.log(`✓ catalog.json: ${katalog.length.toLocaleString()} Karten`);
      katalogAktualisiert = true;
    } else {
      console.warn('⚠  Katalog leer nach Verarbeitung – catalog.json nicht überschrieben');
    }
  }

  // ── Preisguide ────────────────────────────────────────────────────────────

  const preisguideCSV = await getCsv(
    'Preisguide',
    PRICEGUIDE_URL,
    path.join(RAW_DIR, 'priceguide.csv'),
    'priceguide',
  );

  if (preisguideCSV) {
    console.log('\nVerarbeite Preisguide…');
    const latest = processPreisguide(preisguideCSV, trackedIds);

    if (Object.keys(latest).length > 0) {
      // Mit bestehenden Daten zusammenführen (andere Karten nicht löschen)
      let existingLatest = {};
      const latestPath = path.join(DATA_DIR, 'latest.json');
      if (fs.existsSync(latestPath)) {
        try { existingLatest = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch {}
      }
      const merged = { ...existingLatest, ...latest };
      fs.writeFileSync(latestPath, JSON.stringify(merged, null, 2));
      console.log(`✓ latest.json: ${Object.keys(latest).length} Karte(n) aktualisiert`);

      // Historien anhängen
      for (const [id, preise] of Object.entries(latest)) {
        appendHistorie(id, preise);
      }
      console.log(`✓ Historien: ${Object.keys(latest).length} Dateien aktualisiert`);
      preiseAktualisiert = true;
    }
  }

  // ── Zusammenfassung ───────────────────────────────────────────────────────

  console.log('\n──────────────────────────────────────────');
  if (!katalogAktualisiert && !preiseAktualisiert) {
    console.log('Keine Daten aktualisiert (keine Quelle verfügbar).');
    console.log('Siehe docs/datenquelle.md für Setup-Anleitung.');
  } else {
    if (katalogAktualisiert) console.log('✅ Katalog aktualisiert');
    if (preiseAktualisiert)  console.log('✅ Preise & Historien aktualisiert');
    console.log(`\nFertig: ${TODAY}`);
  }
  console.log('──────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌ Unerwarteter Fehler:', err.message);
  process.exit(1);
});
