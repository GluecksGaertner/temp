/**
 * Beispiel: Verbrauchsdaten abrufen
 *
 * Zeigt historische Strom-Verbrauchsdaten in verschiedenen
 * Auflösungen (stündlich, täglich, monatlich).
 */

import { TibberClient } from "../tibber-api.js";

const client = new TibberClient();

const homes = await client.getHomes();
if (homes.length === 0) {
  console.log("Keine Homes gefunden.");
  process.exit(0);
}

const homeId = homes[0].id;
const homeName = homes[0].appNickname ?? "Home";
console.log(`Verbrauch fuer: ${homeName}\n`);

// --- Stündlicher Verbrauch (letzte 10 Stunden) ---
console.log("=== Stuendlicher Verbrauch (letzte 10h) ===");
const hourly = await client.getConsumption(homeId, "HOURLY", 10);
if (hourly.length > 0) {
  let totalKwh = 0;
  let totalCost = 0;

  for (const e of hourly) {
    if (e.consumption == null) continue;
    const from = e.from.slice(11, 16);
    const to = e.to.slice(11, 16);
    const kwh = e.consumption;
    const cost = e.cost ?? 0;
    const unitPrice = e.unitPrice ?? 0;
    const currency = e.currency ?? "EUR";
    totalKwh += kwh;
    totalCost += cost;
    console.log(
      `  ${from}-${to}: ${kwh.toFixed(2).padStart(6)} kWh | ${cost.toFixed(2).padStart(6)} ${currency} | ${(unitPrice * 100).toFixed(2).padStart(5)} ct/kWh`
    );
  }
  console.log("  ---");
  console.log(`  Gesamt: ${totalKwh.toFixed(2)} kWh | ${totalCost.toFixed(2)} EUR`);
} else {
  console.log("  Keine stuendlichen Daten verfuegbar.");
}
console.log();

// --- Täglicher Verbrauch (letzte 7 Tage) ---
console.log("=== Taeglicher Verbrauch (letzte 7 Tage) ===");
const daily = await client.getConsumption(homeId, "DAILY", 7);
if (daily.length > 0) {
  for (const e of daily) {
    if (e.consumption == null) continue;
    const date = e.from.slice(0, 10);
    const kwh = e.consumption;
    const cost = e.cost ?? 0;
    const currency = e.currency ?? "EUR";
    console.log(
      `  ${date}: ${kwh.toFixed(2).padStart(8)} kWh | ${cost.toFixed(2).padStart(8)} ${currency}`
    );
  }
} else {
  console.log("  Keine taeglichen Daten verfuegbar.");
}
console.log();

// --- Monatlicher Verbrauch (letzte 6 Monate) ---
console.log("=== Monatlicher Verbrauch (letzte 6 Monate) ===");
const monthly = await client.getConsumption(homeId, "MONTHLY", 6);
if (monthly.length > 0) {
  for (const e of monthly) {
    if (e.consumption == null) continue;
    const month = e.from.slice(0, 7);
    const kwh = e.consumption;
    const cost = e.cost ?? 0;
    const currency = e.currency ?? "EUR";
    console.log(
      `  ${month}: ${kwh.toFixed(2).padStart(10)} kWh | ${cost.toFixed(2).padStart(10)} ${currency}`
    );
  }
} else {
  console.log("  Keine monatlichen Daten verfuegbar.");
}
