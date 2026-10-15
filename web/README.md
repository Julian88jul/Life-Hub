# Life Hub – Prototyp 0.1

Mobile-first Web-App (PWA) mit Dashboard, eigenem Kalender und Chat-Assistent über die **Gemini API**.

## Was drin ist

* **Login:** Benutzername und Passwort, Registrierung nur mit Einladungscode. Jeder Nutzer hat seinen eigenen Hub.
* **Heute:** Wetter, Termine von heute und den nächsten 7 Tagen.
* **Wetter:** Standardmäßig 08–16 Uhr im 2-Stunden-Takt (Open-Meteo, kostenlos, ohne Key). Mit dem **+** links und rechts kommen frühere oder spätere Uhrzeiten dazu; nach dem Neuladen ist wieder 8–16 eingestellt. Ort: Standard Berlin, über den Chip oben rechts änderbar.
* **Kalender:** Monatsansicht. Tag antippen = auswählen. **Tag gedrückt halten** = Termin anlegen; **ohne Loslassen nach links/rechts ziehen** = mehrtägiger Termin. Jeder Termin hat eine Farbe (8 zur Auswahl).
* **Aufgaben:** Eigene Listen mit Name, Symbol und Farbe. Aufgaben mit optionalem Fälligkeitsdatum, Abhaken mit Animation, Fortschrittsbalken. Aufgaben mit Datum erscheinen im Kalender (Ringe) und auf der Startseite (heute, überfällig, nächste 7 Tage).
* **Stundenplan:** Eigener Tab mit wöchentlichen Veranstaltungen (Tag- und Wochenansicht), Karte „Stundenplan heute“ auf der Startseite.
* **Bild-Import:** Screenshot oder Foto von Klausurterminen oder einem Stundenplan hineinwerfen (Knopf „📷 Bild“ im Kalender / „📷 Aus Foto“ im Stundenplan, ziehen oder Strg+V). Der Kalender-Knopf liest nur Termine, der Stundenplan-Knopf nur Stundenplan-Einträge. Gemini schlägt Einträge vor, du bestätigst, bevor etwas gespeichert wird.
* **Bearbeiten:** Termine, Listen und Aufgaben lassen sich nachträglich ändern (antippen bzw. ✏️). Passwort ändern in den Einstellungen.
* **Assistent:** Chat mit Gemini. Er liest den Kalender, legt Termine an (auch mehrtägige, farbige) und legt Aufgaben in deinen Listen an oder hakt sie ab. Listen legst du selbst an.
* **PWA:** Installierbar auf dem Handy.

Noch **nicht** drin: Apple-Kalender, E-Mail, Hue/Govee, PDF-Import, Passwort-Reset bei Vergessen.

## Aufbau

```
web/
├── backend/    FastAPI: main.py, auth.py, store.py (SQLite lokal / Supabase im Betrieb), llm.py (Gemini)
│               Dockerfile, supabase_schema.sql
├── frontend/   statische Dateien: index.html, app.js, style.css, config.js, sw.js, manifest, icon
└── DEPLOY.md   Anleitung für Webspace + Cloud Run + Supabase
```

Lokal liefert das Backend das Frontend mit aus, alles läuft unter einer Adresse. Im Betrieb liegt das Frontend beim Vater, das Backend bei Cloud Run (siehe [DEPLOY.md](DEPLOY.md)).

## Starten (Windows, PowerShell)

```powershell
cd web\backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env          # dann GEMINI_API_KEY, SECRET_KEY, REGISTRATION_CODE eintragen
.\.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

Dann `http://localhost:8000` öffnen und mit dem Einladungscode aus `.env` (`REGISTRATION_CODE`) ein Konto anlegen.

**Gemini-Key:** kostenlos auf <https://aistudio.google.com/apikey>. Ohne Key laufen Dashboard und Kalender, nur der Chat zeigt eine Fehlermeldung.

> Mit dem kostenlosen Kontingent kann Google Eingaben ggf. zur Produktverbesserung nutzen. Für die Entwicklung nur Testdaten verwenden, keine echten Mails.

## Server starten (Doppelklick)

`web/start-server.bat` startet den Server so, dass auch das Handy ihn erreicht, und zeigt die Adressen an (Rechner: `http://localhost:8000`, Handy: `http://<IP>:8000`).

## Auf dem Handy testen

Handy und PC im selben WLAN, Server mit `--host 0.0.0.0` starten und `http://<PC-IP>:8000` öffnen. Für die echte Installation als PWA ist HTTPS nötig (kommt mit dem Server, z. B. über Caddy/Let's Encrypt). Auf `localhost` funktioniert die Installation am PC bereits.

## Selbsttest

Prüft Login, Termine, Listen, Aufgaben, Rechte zwischen Nutzern und Passwortwechsel mit einer temporären Datenbank (ohne Gemini):

```powershell
cd web\backend
.\.venv\Scripts\python smoke_test.py
```

## Konfiguration (`backend/.env`)

| Variable | Bedeutung |
| --- | --- |
| `GEMINI_API_KEY` | API-Key von Google AI Studio |
| `GEMINI_MODEL` | Modellname, Standard `gemini-3.8-flash` (bei Fehler "model not found" aktuellen Namen eintragen) |
| `LLM_PROVIDER` | `gemini`; Anthropic o. ä. kann in `llm.py` ergänzt werden |
| `SECRET_KEY` | Zufallswert zum Signieren der Login-Tokens |
| `REGISTRATION_CODE` | Einladungscode; leer = Registrierung geschlossen |
| `CORS_ORIGINS` | Adresse des Frontends (nur im Betrieb) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Datenbank im Betrieb; fehlen sie, wird SQLite genutzt |

## Bekannte Grenzen

* Token liegt im `localStorage` des Browsers; kein Passwort-Reset, kein Token-Widerruf.
* 
* Frontend ist bewusst ohne Build-Schritt (reines HTML/JS). Ein Umzug auf Next.js ist später möglich, die API bleibt gleich.

## Nächste Schritte

1. iCloud-CalDAV-Anbindung (Apple-Kalender lesen/schreiben).
2. E-Mail: Gmail/Outlook per IMAP, Entwürfe mit Freigabe.
3. Stil-Lernen aus gesendeten Mails und Korrekturen.
4. Hue/Govee.
