"""
Beispiel: Strompreise abfragen
================================

Zeigt aktuelle Stundenpreise, alle Preise von heute
und (falls verfügbar) die Preise für morgen.

Das Preis-Level (VERY_CHEAP bis VERY_EXPENSIVE) wird von
Tibber anhand der Preise der letzten Tage berechnet.
"""

import sys
sys.path.insert(0, "..")

from tibber_api import TibberClient


# Preis-Level auf Deutsch mit Farbsymbolen
LEVEL_LABELS = {
    "VERY_CHEAP": "Sehr guenstig",
    "CHEAP": "Guenstig",
    "NORMAL": "Normal",
    "EXPENSIVE": "Teuer",
    "VERY_EXPENSIVE": "Sehr teuer",
}


def format_price(price_entry: dict) -> str:
    """Formatiert einen Preis-Eintrag als lesbare Zeile."""
    time = price_entry["startsAt"][11:16]  # HH:MM extrahieren
    total = price_entry["total"]
    currency = price_entry.get("currency", "EUR")
    level = LEVEL_LABELS.get(price_entry.get("level", ""), price_entry.get("level", ""))
    # Preis in Cent umrechnen
    cents = total * 100
    return f"  {time} Uhr: {cents:6.2f} ct/{currency[:3]}  [{level}]"


def main():
    client = TibberClient()

    # Erstes Home verwenden
    homes = client.get_homes()
    if not homes:
        print("Keine Homes gefunden.")
        return

    home_id = homes[0]["id"]
    home_name = homes[0].get("appNickname", "Home")
    print(f"Preise fuer: {home_name}")
    print()

    # --- Aktueller Preis ---
    print("=== Aktueller Preis ===")
    current = client.get_current_price(home_id)
    if current:
        cents = current["total"] * 100
        level = LEVEL_LABELS.get(current.get("level", ""), "")
        print(f"  {cents:.2f} ct/kWh  [{level}]")
        print(f"  davon Energie: {current['energy'] * 100:.2f} ct")
        print(f"  davon Steuern: {current['tax'] * 100:.2f} ct")
    print()

    # --- Heutige Preise ---
    print("=== Preise heute ===")
    today = client.get_today_prices(home_id)
    if today:
        for p in today:
            print(format_price(p))

        # Statistik
        totals = [p["total"] for p in today]
        print()
        print(f"  Min:    {min(totals) * 100:.2f} ct/kWh")
        print(f"  Max:    {max(totals) * 100:.2f} ct/kWh")
        print(f"  Schnitt: {sum(totals) / len(totals) * 100:.2f} ct/kWh")
    print()

    # --- Morgen (verfuegbar ab ca. 13:00) ---
    print("=== Preise morgen ===")
    tomorrow = client.get_tomorrow_prices(home_id)
    if tomorrow:
        for p in tomorrow:
            print(format_price(p))
    else:
        print("  Noch nicht verfuegbar (Preise erscheinen ab ca. 13:00 Uhr).")


if __name__ == "__main__":
    main()
