# google-maps-mcp-server

Ein MCP-Server, der Claude Zugriff auf die **Google Maps Platform** gibt: Adressen
suchen, Orte finden, Öffnungszeiten abrufen, Routen berechnen — und Karten als
Bild anzeigen.

Der Server läuft in zwei Betriebsarten:

| Transport | Wofür |
| --- | --- |
| `stdio` (Standard) | Claude Code und Claude Desktop auf dem eigenen Rechner |
| `http` (Streamable HTTP) | **Die Claude-App auf dem Handy** und claude.ai — braucht eine öffentliche HTTPS-URL |

---

## Werkzeuge

| Tool | Zweck |
| --- | --- |
| `google_maps_geocode` | Adresse → Koordinaten und Place-ID |
| `google_maps_reverse_geocode` | Koordinaten → Adresse |
| `google_maps_search_places` | Freitextsuche („veganes Restaurant in der Nähe") |
| `google_maps_nearby_places` | Kategoriesuche im Umkreis („Apotheken im Umkreis von 1 km") |
| `google_maps_place_details` | Öffnungszeiten, Telefon, Website, Bewertungen |
| `google_maps_directions` | Route mit Dauer, Distanz und optional Abbiegehinweisen |
| `google_maps_distance_matrix` | Fahrzeiten für viele Start-/Zielkombinationen auf einmal |
| `google_maps_static_map` | **Kartenbild** — wird direkt im Chat angezeigt |
| `google_maps_elevation` | Höhe über dem Meeresspiegel |
| `google_maps_timezone` | Zeitzone und aktuelle Ortszeit |

Alle Tools sind ausschließlich lesend (`readOnlyHint`), verändern also nichts.

Jedes Tool unterstützt `response_format: "markdown"` (Standard, kompakt lesbar) oder
`"json"` (vollständige Strukturdaten).

---

## 1. Google-Cloud-Projekt und API-Key anlegen

1. Projekt anlegen: <https://console.cloud.google.com/projectcreate>
2. Abrechnung aktivieren — die Maps Platform hat ein monatliches Gratis-Kontingent,
   verlangt aber ein hinterlegtes Zahlungsmittel.
3. Diese APIs aktivieren (unter *APIs & Dienste → Bibliothek*):
   - **Geocoding API**
   - **Places API (New)**
   - **Routes API**
   - **Maps Static API**
   - **Elevation API**
   - **Time Zone API**
4. Unter *APIs & Dienste → Anmeldedaten* einen **API-Schlüssel** erstellen.
5. Den Schlüssel einschränken: unter *API-Einschränkungen* genau die sechs APIs oben
   auswählen. Anwendungseinschränkungen auf *IP-Adressen* setzen, wenn der Server eine
   feste IP hat.

> Der Schlüssel gehört ausschließlich in die Umgebungsvariable `GOOGLE_MAPS_API_KEY`
> auf dem Server — niemals in den Code, ins Repository oder in eine URL, die der Client sieht.

---

## 2. Lokal bauen

```bash
npm install
npm run build
```

Schnelltest:

```bash
GOOGLE_MAPS_API_KEY=dein-key node dist/index.js --help
```

---

## 3. Betriebsart A: lokal per stdio

### Claude Code

```bash
claude mcp add google-maps \
  --env GOOGLE_MAPS_API_KEY=dein-key \
  -- node /absoluter/pfad/zu/dist/index.js
```

Oder als `.mcp.json` im Projekt (siehe `examples/mcp.json`).

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "node",
      "args": ["/absoluter/pfad/zu/dist/index.js"],
      "env": {
        "GOOGLE_MAPS_API_KEY": "dein-key",
        "DEFAULT_LANGUAGE": "de",
        "DEFAULT_REGION": "de"
      }
    }
  }
}
```

---

## 4. Betriebsart B: für das Handy (Streamable HTTP)

Die Claude-App auf dem Handy startet keine lokalen Prozesse. Sie kann einen MCP-Server
nur über eine **öffentlich erreichbare HTTPS-URL** einbinden. Der Server muss also
irgendwo laufen, wo das Handy hinkommt.

### Absichern

Der Server hat keine OAuth-Anmeldung, deshalb schützt ihn ein gemeinsames Geheimnis:

```bash
export MCP_AUTH_TOKEN=$(openssl rand -hex 24)
```

Es wird auf zwei Wegen akzeptiert:

- als Header `Authorization: Bearer <token>`
- als **letztes Pfadsegment**: `https://dein-host/mcp/<token>`

Die Connector-Maske in Claude bietet kein Feld für einen Bearer-Token — deshalb ist
die Pfad-Variante die praktikable für das Handy. Die URL ist damit selbst das
Geheimnis; behandle sie wie ein Passwort.

Zusätzlich prüft der Server den `Origin`-Header (Schutz gegen DNS-Rebinding). Setze
`ALLOWED_ORIGINS=https://claude.ai,https://www.claude.ai`. Anfragen ganz ohne
`Origin` — also native Clients — werden immer durchgelassen.

### Deployment mit Docker

```bash
docker build -t google-maps-mcp .
docker run -p 8080:8080 \
  -e GOOGLE_MAPS_API_KEY=dein-key \
  -e MCP_AUTH_TOKEN=dein-token \
  -e ALLOWED_ORIGINS=https://claude.ai,https://www.claude.ai \
  -e DEFAULT_LANGUAGE=de -e DEFAULT_REGION=de \
  google-maps-mcp
```

### Deployment auf Google Cloud Run

Passt gut, weil der API-Key ohnehin aus einem Google-Cloud-Projekt kommt:

```bash
gcloud run deploy google-maps-mcp \
  --source . \
  --region europe-west3 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_MAPS_API_KEY=dein-key,MCP_AUTH_TOKEN=dein-token,ALLOWED_ORIGINS=https://claude.ai,DEFAULT_LANGUAGE=de,DEFAULT_REGION=de"
```

`--allow-unauthenticated` ist nötig, damit Claude den Server erreicht; der Zugriff
wird stattdessen über `MCP_AUTH_TOKEN` kontrolliert. Cloud Run setzt `PORT` selbst.

Andere Anbieter (Railway, Render, Fly.io) funktionieren genauso — Dockerfile
hochladen, Umgebungsvariablen setzen, fertig.

### Nur zum Ausprobieren: Tunnel vom eigenen Rechner

```bash
GOOGLE_MAPS_API_KEY=dein-key MCP_AUTH_TOKEN=dein-token npm run start:http
cloudflared tunnel --url http://localhost:3000
```

### In der Claude-App eintragen

*Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen* und dort

```
https://dein-host/mcp/<token>
```

eintragen. Danach stehen die zehn Tools im Chat zur Verfügung.

### Erreichbarkeit prüfen

```bash
curl https://dein-host/healthz
# {"status":"ok","server":"google-maps-mcp-server","version":"1.0.0",
#  "api_key_configured":true,"auth_required":true}
```

`/healthz` verlangt kein Token und verrät keinen Schlüssel — es sagt nur, ob einer
konfiguriert ist.

---

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | ja | API-Key der Google Maps Platform |
| `TRANSPORT` | nein | `stdio` (Standard) oder `http`; `--stdio`/`--http` überschreiben es |
| `PORT` | nein | HTTP-Port, Standard `3000` |
| `HOST` | nein | Bind-Adresse, Standard `0.0.0.0` |
| `MCP_AUTH_TOKEN` | empfohlen | Gemeinsames Geheimnis für den HTTP-Transport |
| `ALLOWED_ORIGINS` | empfohlen | Kommaliste erlaubter `Origin`-Header |
| `DEFAULT_LANGUAGE` | nein | Sprachvorgabe für Ergebnisse, z. B. `de` |
| `DEFAULT_REGION` | nein | ccTLD-Vorgabe für mehrdeutige Namen, z. B. `de` |

---

## Kosten im Blick behalten

Jeder Tool-Aufruf ist eine kostenpflichtige Google-Anfrage. Der Server hält sie klein,
indem er bei Places nur die tatsächlich benötigten Felder anfordert (Field Masks) und
Abbiegehinweise sowie Polylines nur auf ausdrückliche Anforderung lädt.

Trotzdem sinnvoll: in der Google-Cloud-Konsole unter *Google Maps Platform → Kontingente*
ein Tageslimit setzen und ein Budget-Alert einrichten. Wer die URL kennt, kann Anfragen
auslösen — deshalb `MCP_AUTH_TOKEN` nicht weglassen.

---

## Entwicklung

```bash
npm run dev        # tsx watch, stdio
npm run typecheck  # tsc --noEmit
npm run build
```

Interaktiv testen:

```bash
GOOGLE_MAPS_API_KEY=dein-key npx @modelcontextprotocol/inspector node dist/index.js
```

### Aufbau

```
src/
├── index.ts            Einstiegspunkt, Auswahl des Transports
├── server.ts           registriert alle Tools an einer McpServer-Instanz
├── http.ts             Streamable HTTP: Auth, Origin-Prüfung, stateless Requests
├── constants.ts        Endpunkte, Field Masks, Limits
├── types.ts            Antwortstrukturen der Google-APIs
├── schemas/common.ts   wiederverwendete Zod-Bausteine
├── services/
│   ├── googleClient.ts HTTP-Client, API-Key, Fehlerübersetzung
│   └── format.ts       Markdown-/JSON-Ausgabe, Einheiten
└── tools/              je eine Datei pro Themengebiet
```

## Lizenz

MIT
