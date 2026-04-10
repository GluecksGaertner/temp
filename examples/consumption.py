"""
Beispiel: Verbrauchsdaten abrufen
===================================

Zeigt historische Strom-Verbrauchsdaten in verschiedenen
Auflösungen (stündlich, täglich, monatlich).

Hinweis: Der Demo-Account hat begrenzte Verbrauchsdaten.
Mit einem echten Tibber-Konto erhältst du deine realen Daten.
"""

import sys
sys.path.insert(0, "..")

from tibber_api import TibberClient


def main():
    client = TibberClient()

    homes = client.get_homes()
    if not homes:
        print("Keine Homes gefunden.")
        return

    home_id = homes[0]["id"]
    home_name = homes[0].get("appNickname", "Home")
    print(f"Verbrauch fuer: {home_name}")
    print()

    # --- Stündlicher Verbrauch (letzte 10 Stunden) ---
    print("=== Stuendlicher Verbrauch (letzte 10h) ===")
    hourly = client.get_consumption(home_id, resolution="HOURLY", last=10)
    if hourly:
        total_kwh = 0
        total_cost = 0
        for entry in hourly:
            if entry.get("consumption") is None:
                continue
            time_from = entry["from"][11:16]
            time_to = entry["to"][11:16]
            kwh = entry["consumption"]
            cost = entry.get("cost") or 0
            unit_price = entry.get("unitPrice") or 0
            currency = entry.get("currency", "EUR")
            total_kwh += kwh
            total_cost += cost
            print(
                f"  {time_from}-{time_to}: "
                f"{kwh:6.2f} kWh | "
                f"{cost:6.2f} {currency} | "
                f"{unit_price * 100:5.2f} ct/kWh"
            )
        print(f"  ---")
        print(f"  Gesamt: {total_kwh:.2f} kWh | {total_cost:.2f} EUR")
    else:
        print("  Keine stuendlichen Daten verfuegbar.")
    print()

    # --- Täglicher Verbrauch (letzte 7 Tage) ---
    print("=== Taeglicher Verbrauch (letzte 7 Tage) ===")
    daily = client.get_consumption(home_id, resolution="DAILY", last=7)
    if daily:
        for entry in daily:
            if entry.get("consumption") is None:
                continue
            date = entry["from"][:10]
            kwh = entry["consumption"]
            cost = entry.get("cost") or 0
            currency = entry.get("currency", "EUR")
            print(f"  {date}: {kwh:8.2f} kWh | {cost:8.2f} {currency}")
    else:
        print("  Keine taeglichen Daten verfuegbar.")
    print()

    # --- Monatlicher Verbrauch (letzte 6 Monate) ---
    print("=== Monatlicher Verbrauch (letzte 6 Monate) ===")
    monthly = client.get_consumption(home_id, resolution="MONTHLY", last=6)
    if monthly:
        for entry in monthly:
            if entry.get("consumption") is None:
                continue
            month = entry["from"][:7]
            kwh = entry["consumption"]
            cost = entry.get("cost") or 0
            currency = entry.get("currency", "EUR")
            print(f"  {month}: {kwh:10.2f} kWh | {cost:10.2f} {currency}")
    else:
        print("  Keine monatlichen Daten verfuegbar.")


if __name__ == "__main__":
    main()
