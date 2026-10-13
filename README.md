# RiftGallery

Eine selbst gehostete, digitale Sammelmappe für **Riftbound**: Karten-Galerie mit eigenem Bestand, Foil-Tracking,
Suche und Filtern, Decklisten-Abgleich, Want-Liste und Booster-Modus. Mehrere Accounts (z. B. für Freunde) werden
unterstützt, jeder mit eigener Sammlung.

Die Kartendaten kommen von [riftcodex.com](https://riftcodex.com) und werden automatisch einmal täglich aktualisiert.
Kartenbilder werden einmalig heruntergeladen und lokal als WebP gespeichert (ca. 180 MB).

## Funktionen

- **Galerie**: alle Karten als Bild, sortiert nach Set und Sammlernummer, Alt Arts direkt nach der normalen Karte.
  Karten, die du nicht besitzt, sind ausgegraut. Auf jeder Karte kannst du zwischen **Normal** und **Foil**
  umschalten und mit `−`/`+` die Anzahl ändern. Fortschritt pro Set wird angezeigt.
- **Detailansicht** (Klick auf die Karte): großes Bild, Kartentext, Anzahl je Foil/Normal **und Sprache**,
  Want-Liste, in welchen Decks die Karte steckt, alle anderen Versionen der Karte. Mit `←`/`→` blättern.
- **Suche** über Name, Regeltext, Keywords, Champion/Region-Tags, Artist und Sammlernummer
  (mehrere Wörter = alle müssen vorkommen, `"genaue Phrase"` in Anführungszeichen).
- **Filter**: Set, Domain (beliebig/alle), Typ, Supertyp, Seltenheit, Version (Alt Art, Overnumbered, Signature, …),
  Energy, Might, Power, Keywords, Champion/Region-Tags, Artist sowie Besitz (fehlt, besitze ich, Foil fehlt,
  tauschbar > 3 Kopien, auf Want-Liste, in einem Deck).
- **Decks**: Deckliste einfügen (z. B. „Text List“-Export von Piltover Archive) → du siehst sofort, was fehlt.
  Gespeicherte Decks „reservieren“ ihre Karten: beim Prüfen einer neuen Liste werden Karten, die schon in einem
  anderen Deck stecken, als nicht verfügbar angezeigt. Fehlende Karten mit einem Klick auf die Want-Liste.
- **Want-Liste** mit Anzahl, Priorität, Notiz, optional bestimmte Version/Foil; als Text kopierbar für Tauschpartner.
- **Booster-Modus**: Set und Anzahl Booster wählen (z. B. Display = 24), dann Nummer oder Name eintippen + Enter.
  `f 42` oder `*42` trägt die Karte als Foil ein. Neue Karten und Want-Treffer werden markiert. Erst beim Abschluss
  wird alles in die Sammlung übernommen (Want-Liste wird auf Wunsch automatisch reduziert).
- **Accounts**: Der erste Account wird Admin. Freunde bekommen einen Einladungslink (Einstellungen → Admin).
- **Backup**: JSON-Export/Import und CSV-Export der Sammlung in den Einstellungen.

## Installation auf dem Server (Ubuntu + Docker)

Voraussetzung: Docker mit Compose-Plugin (`docker compose version` sollte funktionieren) und nginx.

```bash
git clone https://github.com/xNekumi/Riftgallery.git
cd Riftgallery
docker compose up -d --build
```

Die Seite läuft dann auf `http://127.0.0.1:3001` (nur lokal auf dem Server erreichbar, nginx leitet weiter).
Durch `restart: unless-stopped` startet der Container nach einem Neustart des Servers automatisch wieder.

Ist Port 3001 schon belegt, einen anderen nehmen, z. B. `RIFTGALLERY_PORT=3100 docker compose up -d --build`
(dann auch in der nginx-Config anpassen).

Ohne nginx direkt über `http://<domain>:3001` erreichbar machen (z. B. übergangsweise):
`RIFTGALLERY_BIND=0.0.0.0 docker compose up -d` und Port 3001 im Router freigeben. Achtung: Das ist
unverschlüsseltes HTTP, Passwörter gehen also im Klartext übers Netz. Dauerhaft besser über nginx + HTTPS.

Beim ersten Start werden die Kartendaten und alle Bilder geladen (1–3 Minuten). Den Fortschritt siehst du mit
`docker compose logs -f`.

### nginx + HTTPS für kumilan.com

```bash
sudo cp deploy/nginx/kumilan.com.conf /etc/nginx/sites-available/kumilan.com
sudo ln -s /etc/nginx/sites-available/kumilan.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS-Zertifikat (Let's Encrypt). certbot ergänzt die Config automatisch um HTTPS + Weiterleitung.
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d kumilan.com -d www.kumilan.com
```

Im Router müssen Port **80** und **443** auf den Server freigegeben sein (Port 3001 **nicht** freigeben).
HTTPS ist wichtig, weil Passwörter übertragen werden.

Danach `https://kumilan.com` öffnen und den ersten Account anlegen – dieser ist Admin.

> Läuft auf kumilan.com schon etwas anderes, kann die Galerie auch auf einer Subdomain laufen, z. B.
> `cards.kumilan.com`: DNS-Eintrag anlegen und in der nginx-Config/certbot-Befehl den Namen ersetzen.

### Updates einspielen

```bash
cd Riftgallery
git pull
docker compose up -d --build
```

Die Daten liegen im Docker-Volume `riftgallery_riftgallery-data` und bleiben bei Updates erhalten.

### Backup der Datenbank

Jeder Nutzer kann in den Einstellungen ein JSON-Backup herunterladen. Ein komplettes Server-Backup (alle Nutzer):

```bash
docker compose exec riftgallery node -e "require('better-sqlite3')('/data/riftgallery.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker compose cp riftgallery:/data/backup.db ./riftgallery-backup-$(date +%F).db
```

## Konfiguration

Umgebungsvariablen (in `docker-compose.yml` unter `environment`):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `SYNC_INTERVAL_HOURS` | `24` | Abstand der automatischen Kartendaten-Updates (0 = nur manuell über Einstellungen → Admin) |
| `SESSION_DAYS` | `30` | Wie lange man eingeloggt bleibt |
| `RIFTCODEX_API` | `https://api.riftcodex.com` | Quelle der Kartendaten |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Welche Proxys (nginx) für `X-Forwarded-*` vertraut werden |

## Entwicklung

```bash
# Backend (Port 3000)
cd server && npm install && npm run dev
# Frontend mit Hot Reload (Port 5173, leitet /api an Port 3000 weiter)
cd web && npm install && npm run dev
# Tests
cd server && npm test
cd web && npm test
```

Aufbau:

- `server/` – Node.js (Express 5, SQLite über better-sqlite3, sharp für Bilder)
  - `src/sync.js` – lädt Karten + Bilder von riftcodex.com, führt doppelte API-Einträge zusammen
  - `src/cards.js` – Aufbereitung der Kartendaten (Sortierung, Varianten, Foil-Regeln, Keywords)
  - `src/api.js` – REST-API (Login, Sammlung, Want-Liste, Decks, Admin)
- `web/` – React + TypeScript (Vite)
  - `src/lib/decklist.ts` – Decklisten-Parser und Abgleich
  - `src/lib/filters.ts` – Suche und Filter

Foil-Regeln (in `server/src/cards.js` → `finishesFor`): Common, Uncommon, Rare und Promo gibt es normal und als Foil;
Epic, Showcase sowie Alt Art / Overnumbered / Signature nur als Foil.

Wenn später der offizielle Riot-API-Key da ist, muss nur `server/src/sync.js` (Datenquelle) angepasst werden –
die Sammlungen bleiben erhalten.

---

RiftGallery ist ein Fanprojekt und steht in keiner Verbindung zu Riot Games.
