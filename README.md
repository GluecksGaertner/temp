# Tibber API Integration

## Was ist Tibber?

**Tibber** ist ein norwegischer Stromanbieter, der sich auf smarte Energie spezialisiert hat. Tibber bietet dynamische Strompreise an, die sich stündlich ändern und direkt an den Börsenpreis gekoppelt sind. Kunden zahlen den tatsächlichen Marktpreis plus eine feste monatliche Gebühr.

## Was bietet die Tibber API?

Die Tibber API ist eine **GraphQL-basierte API**, mit der du auf folgende Daten zugreifen kannst:

| Funktion | Beschreibung |
|---|---|
| **Strompreise** | Aktuelle, heutige und morgige Stundenpreise |
| **Verbrauchsdaten** | Historischer Strom-/Energieverbrauch |
| **Home-Informationen** | Adresse, Zähler-Typ, Merkmale deines Zuhauses |
| **Live-Messung** | Echtzeit-Verbrauchsdaten (mit Tibber Pulse) |
| **Push-Benachrichtigungen** | Nachrichten an die Tibber App senden |

## Authentifizierung

Die API nutzt **Bearer Token** Authentifizierung. Du brauchst einen persönlichen Access Token, den du unter [developer.tibber.com](https://developer.tibber.com) generieren kannst.

### Demo-Token zum Testen

Tibber stellt einen Demo-Token bereit, mit dem du die API ohne eigenes Konto testen kannst:

```
5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE
```

## API-Endpunkt

```
https://api.tibber.com/v1-beta/gql
```

Die API nutzt ausschließlich **GraphQL** -- alle Anfragen gehen als POST an diesen einen Endpunkt.

## Verfügbare Queries

### 1. Viewer (Basis-Info)
Liefert Infos über den eingeloggten Benutzer und seine Homes.

### 2. Strompreise (priceInfo)
- `current` -- aktueller Stundenpreis
- `today` -- alle 24 Stundenpreise von heute
- `tomorrow` -- Preise für morgen (verfügbar ab ca. 13:00 Uhr)

Jeder Preis enthält:
- `total` -- Gesamtpreis inkl. Steuern und Gebühren (in der Hauswährung)
- `energy` -- reiner Energiepreis
- `tax` -- Steueranteil
- `startsAt` -- Zeitstempel (ISO 8601)
- `level` -- Preisniveau: `VERY_CHEAP`, `CHEAP`, `NORMAL`, `EXPENSIVE`, `VERY_EXPENSIVE`

### 3. Verbrauchsdaten (consumption)
Historische Verbrauchsdaten in verschiedenen Auflösungen:
- `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `ANNUAL`

### 4. Live-Messung (liveMeasurement)
Echtzeit-Daten via WebSocket-Subscription (benötigt Tibber Pulse Hardware).

## Projektstruktur

```
├── README.md               # Diese Dokumentation
├── requirements.txt        # Python-Abhängigkeiten
├── tibber_api.py           # Hauptmodul -- Tibber API Client
├── examples/
│   ├── basic_info.py       # Beispiel: Basis-Informationen abrufen
│   ├── prices.py           # Beispiel: Strompreise anzeigen
│   └── consumption.py      # Beispiel: Verbrauchsdaten abrufen
└── .env.example            # Vorlage für Umgebungsvariablen
```

## Schnellstart

```bash
# 1. Abhängigkeiten installieren
pip install -r requirements.txt

# 2. .env-Datei erstellen (oder Demo-Token verwenden)
cp .env.example .env

# 3. Beispiele ausführen
python examples/basic_info.py
python examples/prices.py
python examples/consumption.py
```

## Lizenz

MIT
