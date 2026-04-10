/**
 * Beispiel: Strompreise abfragen
 *
 * Zeigt aktuelle Stundenpreise, alle Preise von heute
 * und (falls verfügbar) die Preise für morgen.
 */

import { TibberClient } from "../tibber-api.js";

const LEVEL_LABELS = {
  VERY_CHEAP: "Sehr guenstig",
  CHEAP: "Guenstig",
  NORMAL: "Normal",
  EXPENSIVE: "Teuer",
  VERY_EXPENSIVE: "Sehr teuer",
};

function formatPrice(p) {
  const time = p.startsAt.slice(11, 16);
  const cents = (p.total * 100).toFixed(2);
  const level = LEVEL_LABELS[p.level] ?? p.level;
  return `  ${time} Uhr: ${cents.padStart(6)} ct/kWh  [${level}]`;
}

const client = new TibberClient();

const homes = await client.getHomes();
if (homes.length === 0) {
  console.log("Keine Homes gefunden.");
  process.exit(0);
}

const homeId = homes[0].id;
const homeName = homes[0].appNickname ?? "Home";
console.log(`Preise fuer: ${homeName}\n`);

// --- Aktueller Preis ---
console.log("=== Aktueller Preis ===");
const current = await client.getCurrentPrice(homeId);
if (current) {
  const cents = (current.total * 100).toFixed(2);
  const level = LEVEL_LABELS[current.level] ?? "";
  console.log(`  ${cents} ct/kWh  [${level}]`);
  console.log(`  davon Energie: ${(current.energy * 100).toFixed(2)} ct`);
  console.log(`  davon Steuern: ${(current.tax * 100).toFixed(2)} ct`);
}
console.log();

// --- Heutige Preise ---
console.log("=== Preise heute ===");
const today = await client.getTodayPrices(homeId);
if (today.length > 0) {
  for (const p of today) {
    console.log(formatPrice(p));
  }

  const totals = today.map((p) => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  console.log();
  console.log(`  Min:     ${(min * 100).toFixed(2)} ct/kWh`);
  console.log(`  Max:     ${(max * 100).toFixed(2)} ct/kWh`);
  console.log(`  Schnitt: ${(avg * 100).toFixed(2)} ct/kWh`);
}
console.log();

// --- Morgen ---
console.log("=== Preise morgen ===");
const tomorrow = await client.getTomorrowPrices(homeId);
if (tomorrow.length > 0) {
  for (const p of tomorrow) {
    console.log(formatPrice(p));
  }
} else {
  console.log("  Noch nicht verfuegbar (Preise erscheinen ab ca. 13:00 Uhr).");
}
