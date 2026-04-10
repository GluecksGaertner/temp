"""
Beispiel: Basis-Informationen abrufen
======================================

Zeigt, wie man grundlegende Benutzer- und Home-Informationen
über die Tibber API abruft.

Nutzt den Demo-Token -- funktioniert ohne eigenes Tibber-Konto.
"""

import sys
sys.path.insert(0, "..")

from tibber_api import TibberClient


def main():
    client = TibberClient()

    # --- Benutzer-Info ---
    print("=== Benutzer-Info ===")
    viewer = client.get_viewer()
    print(f"  Name:    {viewer.get('name', 'N/A')}")
    print(f"  Login:   {viewer.get('login', 'N/A')}")
    print(f"  User-ID: {viewer.get('userId', 'N/A')}")
    print()

    # --- Homes ---
    print("=== Homes ===")
    homes = client.get_homes()

    if not homes:
        print("  Keine Homes gefunden.")
        return

    for i, home in enumerate(homes, 1):
        addr = home.get("address", {})
        features = home.get("features", {})
        sub = home.get("currentSubscription", {})

        print(f"  Home {i}: {home.get('appNickname', 'Kein Name')}")
        print(f"    ID:       {home['id']}")
        print(f"    Adresse:  {addr.get('address1', '')} {addr.get('address2', '') or ''}")
        print(f"    PLZ/Ort:  {addr.get('postalCode', '')} {addr.get('city', '')}")
        print(f"    Land:     {addr.get('country', '')}")
        print(f"    Echtzeit: {'Ja' if features.get('realTimeConsumptionEnabled') else 'Nein'}")
        print(f"    Abo:      {sub.get('status', 'N/A') if sub else 'N/A'}")
        print()


if __name__ == "__main__":
    main()
