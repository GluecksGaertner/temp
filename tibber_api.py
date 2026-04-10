"""
Tibber API Client
=================

Ein Python-Client für die Tibber GraphQL API.

Die Tibber API ermöglicht Zugriff auf:
- Strompreise (aktuell, heute, morgen)
- Verbrauchsdaten (stündlich, täglich, wöchentlich, monatlich)
- Home-Informationen (Adresse, Zähler-Typ, etc.)
- Push-Benachrichtigungen an die Tibber App

Authentifizierung:
    Alle Anfragen benötigen einen Bearer Token im Authorization Header.
    Token erstellen: https://developer.tibber.com
    Demo-Token: 5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE

API-Endpunkt:
    https://api.tibber.com/v1-beta/gql (GraphQL)
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

# --- Konfiguration ---
API_URL = "https://api.tibber.com/v1-beta/gql"
DEMO_TOKEN = "5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE"


class TibberClient:
    """Client für die Tibber GraphQL API.

    Beispiel:
        client = TibberClient()  # nutzt Demo-Token oder TIBBER_API_TOKEN aus .env
        homes = client.get_homes()
        prices = client.get_current_price(homes[0]["id"])
    """

    def __init__(self, token: str | None = None):
        self.token = token or os.getenv("TIBBER_API_TOKEN", DEMO_TOKEN)
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def _query(self, query: str) -> dict:
        """Führt eine GraphQL-Query gegen die Tibber API aus.

        Args:
            query: GraphQL-Query als String.

        Returns:
            Das "data"-Objekt aus der API-Antwort.

        Raises:
            requests.HTTPError: Bei HTTP-Fehlern (401, 500, etc.)
            RuntimeError: Bei GraphQL-Fehlern in der Antwort.
        """
        response = requests.post(
            API_URL,
            json={"query": query},
            headers=self.headers,
            timeout=10,
        )
        response.raise_for_status()

        result = response.json()
        if "errors" in result:
            raise RuntimeError(f"GraphQL Fehler: {result['errors']}")

        return result["data"]

    # --- Basis-Informationen ---

    def get_viewer(self) -> dict:
        """Gibt Informationen über den eingeloggten Benutzer zurück.

        Returns:
            Dict mit Login, Name und userId.
        """
        query = """
        {
            viewer {
                login
                userId
                name
                websocketSubscriptionUrl
            }
        }
        """
        return self._query(query)["viewer"]

    def get_homes(self) -> list[dict]:
        """Gibt alle Homes des Benutzers zurück.

        Jedes Home enthält:
        - id: Eindeutige Home-ID (wird für weitere Queries benötigt)
        - appNickname: Spitzname in der App
        - address: Adressinformationen
        - features: Aktivierte Features (realTimeConsumptionEnabled)

        Returns:
            Liste von Home-Dicts.
        """
        query = """
        {
            viewer {
                homes {
                    id
                    appNickname
                    address {
                        address1
                        address2
                        address3
                        postalCode
                        city
                        country
                    }
                    features {
                        realTimeConsumptionEnabled
                    }
                    currentSubscription {
                        status
                    }
                }
            }
        }
        """
        return self._query(query)["viewer"]["homes"]

    # --- Strompreise ---

    def get_current_price(self, home_id: str) -> dict:
        """Gibt den aktuellen Stundenpreis zurück.

        Args:
            home_id: Die ID des Homes.

        Returns:
            Dict mit total, energy, tax, startsAt und level.
            - total: Gesamtpreis inkl. Steuern (z.B. 0.2341 EUR/kWh)
            - energy: Reiner Energiepreis
            - tax: Steueranteil
            - level: VERY_CHEAP | CHEAP | NORMAL | EXPENSIVE | VERY_EXPENSIVE
        """
        query = f"""
        {{
            viewer {{
                home(id: "{home_id}") {{
                    currentSubscription {{
                        priceInfo {{
                            current {{
                                total
                                energy
                                tax
                                startsAt
                                currency
                                level
                            }}
                        }}
                    }}
                }}
            }}
        }}
        """
        data = self._query(query)
        return data["viewer"]["home"]["currentSubscription"]["priceInfo"]["current"]

    def get_today_prices(self, home_id: str) -> list[dict]:
        """Gibt alle 24 Stundenpreise von heute zurück.

        Args:
            home_id: Die ID des Homes.

        Returns:
            Liste von 24 Preis-Dicts (je Stunde ein Eintrag).
        """
        query = f"""
        {{
            viewer {{
                home(id: "{home_id}") {{
                    currentSubscription {{
                        priceInfo {{
                            today {{
                                total
                                energy
                                tax
                                startsAt
                                currency
                                level
                            }}
                        }}
                    }}
                }}
            }}
        }}
        """
        data = self._query(query)
        return data["viewer"]["home"]["currentSubscription"]["priceInfo"]["today"]

    def get_tomorrow_prices(self, home_id: str) -> list[dict]:
        """Gibt die Stundenpreise von morgen zurück (verfügbar ab ca. 13:00 Uhr).

        Args:
            home_id: Die ID des Homes.

        Returns:
            Liste von Preis-Dicts (leer, falls noch nicht verfügbar).
        """
        query = f"""
        {{
            viewer {{
                home(id: "{home_id}") {{
                    currentSubscription {{
                        priceInfo {{
                            tomorrow {{
                                total
                                energy
                                tax
                                startsAt
                                currency
                                level
                            }}
                        }}
                    }}
                }}
            }}
        }}
        """
        data = self._query(query)
        return data["viewer"]["home"]["currentSubscription"]["priceInfo"]["tomorrow"]

    # --- Verbrauchsdaten ---

    def get_consumption(
        self,
        home_id: str,
        resolution: str = "HOURLY",
        last: int = 24,
    ) -> list[dict]:
        """Gibt historische Verbrauchsdaten zurück.

        Args:
            home_id: Die ID des Homes.
            resolution: Auflösung -- HOURLY, DAILY, WEEKLY, MONTHLY oder ANNUAL.
            last: Anzahl der Einträge (z.B. last=24 bei HOURLY = letzte 24 Stunden).

        Returns:
            Liste von Verbrauchs-Dicts mit:
            - from/to: Zeitraum
            - consumption: Verbrauch in kWh
            - cost: Kosten in Hauswährung
            - unitPrice: Durchschnittspreis pro kWh
        """
        query = f"""
        {{
            viewer {{
                home(id: "{home_id}") {{
                    consumption(resolution: {resolution}, last: {last}) {{
                        nodes {{
                            from
                            to
                            consumption
                            consumptionUnit
                            cost
                            unitPrice
                            unitPriceVAT
                            currency
                        }}
                    }}
                }}
            }}
        }}
        """
        data = self._query(query)
        return data["viewer"]["home"]["consumption"]["nodes"]

    # --- Push-Benachrichtigungen ---

    def send_push_notification(
        self,
        title: str,
        message: str,
        screen_to_open: str = "HOME",
    ) -> bool:
        """Sendet eine Push-Benachrichtigung an die Tibber App.

        Args:
            title: Titel der Benachrichtigung.
            message: Nachrichtentext.
            screen_to_open: Zielscreen in der App (HOME, REPORTS, etc.).

        Returns:
            True bei Erfolg.
        """
        query = f"""
        mutation {{
            sendPushNotification(input: {{
                title: "{title}"
                message: "{message}"
                screenToOpen: {screen_to_open}
            }}) {{
                successful
            }}
        }}
        """
        data = self._query(query)
        return data["sendPushNotification"]["successful"]
