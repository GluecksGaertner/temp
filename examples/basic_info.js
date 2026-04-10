/**
 * Beispiel: Basis-Informationen abrufen
 *
 * Zeigt Benutzer- und Home-Informationen über die Tibber API.
 */

import { TibberClient } from "../tibber-api.js";

const client = new TibberClient();

// --- Benutzer-Info ---
console.log("=== Benutzer-Info ===");
const viewer = await client.getViewer();
console.log(`  Name:    ${viewer.name ?? "N/A"}`);
console.log(`  Login:   ${viewer.login ?? "N/A"}`);
console.log(`  User-ID: ${viewer.userId ?? "N/A"}`);
console.log();

// --- Homes ---
console.log("=== Homes ===");
const homes = await client.getHomes();

if (homes.length === 0) {
  console.log("  Keine Homes gefunden.");
  process.exit(0);
}

for (const [i, home] of homes.entries()) {
  const addr = home.address ?? {};
  const features = home.features ?? {};
  const sub = home.currentSubscription;

  console.log(`  Home ${i + 1}: ${home.appNickname ?? "Kein Name"}`);
  console.log(`    ID:       ${home.id}`);
  console.log(`    Adresse:  ${addr.address1 ?? ""} ${addr.address2 ?? ""}`);
  console.log(`    PLZ/Ort:  ${addr.postalCode ?? ""} ${addr.city ?? ""}`);
  console.log(`    Land:     ${addr.country ?? ""}`);
  console.log(`    Echtzeit: ${features.realTimeConsumptionEnabled ? "Ja" : "Nein"}`);
  console.log(`    Abo:      ${sub?.status ?? "N/A"}`);
  console.log();
}
