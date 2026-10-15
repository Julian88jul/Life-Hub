# Life Hub: Übergabe / aktueller Stand

Stand: 2026-10-15. Dieses Dokument reicht, um auf einem anderen Rechner (oder mit einer neuen Claude-Sitzung) nahtlos weiterzuarbeiten.

---

## 1. Worum es geht

Persönliches Dashboard als **Web-App/PWA** (keine App-Store-Lizenz nötig), bedienbar am Handy, mit Chat-Assistent (Gemini).

* **Jetzt:** nur für den Besitzer (Julian). **Später:** weitere Personen können sich mit Benutzername und Passwort einen eigenen Hub anlegen, mit eigenen Anbindungen (Kalender, Mail).
* **Kein Geld ausgeben**, soweit möglich (Gemini-Gratis-Kontingent, Supabase Free, Cloud-Run-Gratis-Kontingent).
* Ausführliche Ausgangsspezifikation: [PROJEKT-SPEZIFIKATION.md](PROJEKT-SPEZIFIKATION.md) (teilweise überholt, siehe Abschnitt 7).

## 2. Was fertig ist (lokal getestet)

| Bereich | Stand |
| --- | --- |
| **Login** | Benutzername + Passwort (scrypt), signiertes Token (30 Tage) im `localStorage`, Registrierung nur mit Einladungscode (`REGISTRATION_CODE`), Fehlversuch-Begrenzung pro Benutzername |
| **Heute** | Wetter, Termine + Aufgaben für heute (inkl. überfällige) und die nächsten 7 Tage, Kachel „Aufgaben: x offen“ |
| **Wetter** | Open-Meteo (kostenlos, ohne Key), nachts (Sonnenauf-/-untergang des Ortes) Mond-Symbole und dunkel hinterlegte Felder. Standard 8, 10, 12, 14, 16 Uhr; links und rechts je **+** (Uhrzeit hinzufügen) und **−** (äußerste entfernen, mindestens eine bleibt), 2-Stunden-Takt von 0 bis 22 Uhr; Bereich wird **nicht** gespeichert (nach Neuladen wieder 8–16). Ort: Standard Berlin, änderbar über Chip „📍 Berlin“ oben rechts. Umschalter Heute/Morgen |
| **Kalender** | Monatsansicht, Wischen wechselt den Monat, Tippen wählt Tag. **Halten (250 ms)** und ohne Loslassen **ziehen** wählt mehrere Tage (Tage färben sich gestaffelt mit je 45 ms Abstand ein), Loslassen öffnet das Termin-Formular. Termine: Titel, Von/Bis-Datum, Uhrzeiten, 8 Farben, **Symbol (Emoji, z. B. 🩺 Arzt, 🎓 Uni)**, Notiz. Mehrtägige Termine. Tage mit Terminen sind farbig hinterlegt, mit Farbbalken (je Tag ein eigener, nicht durchgehend) und Symbol (18 px); Aufgaben mit Datum als Ringe |
| **Aufgaben** | Eigene Listen (Name, Emoji-Symbol, Farbe). Neue Aufgabe über Schaltfläche „＋ Aufgabe“ unten rechts: Dialog mit Titel, Datum-Schnellwahl (Heute/Morgen/In einer Woche/Kein Datum) und „Hinzufügen“ bzw. „Hinzufügen und noch eine“. Optionales Fälligkeitsdatum, Abhaken mit Animation (Haken zeichnet sich, Strich, Zeile wandert nach „Erledigt“), Fortschrittsbalken, Emoji hüpft bei 100 %, „Erledigte löschen“, Liste/Aufgabe löschen |
| **Assistent (Gemini)** | Chat. Werkzeuge: Termine lesen/anlegen (mehrtägig, Farbe), Aufgabenlisten anzeigen, Aufgaben auflisten/anlegen/abhaken. Legt **keine** Listen an, fragt nach, wenn keine passt. Termine können ein Symbol bekommen |
| **Stundenplan** | Eigener Tab: wöchentlich wiederkehrende Veranstaltungen (Wochentag, Zeit, Raum, Farbe). Ansicht Tag (Wochentag-Auswahl) oder Woche; laufende Veranstaltung wird hervorgehoben; Karte „Stundenplan heute“ auf der Startseite; Bearbeiten per Antippen, ＋ Eintrag unten rechts. Der Assistent kann ihn lesen (`list_timetable`) |
| **Bild-Import** | Screenshots/Fotos von Skripten (Klausurtermine) oder Stundenplänen: Strikt getrennt: „📷 Bild“ im Kalender erkennt **nur Termine**, „📷 Aus Foto“ im Stundenplan **nur Stundenplan-Einträge** (das Backend verwirft den jeweils anderen Typ). Bild auf die Seite ziehen oder mit Strg+V einfügen: im Kalender/Stundenplan gilt deren Modus, auf anderen Seiten fragt der Dialog „In den Kalender / In den Stundenplan“. Bis zu 5 Bilder. Bild wird im Browser verkleinert (max. 1600 px breit, sehr lange Screenshots in überlappende Abschnitte geteilt, höchstens 8 Teile) und an Gemini geschickt (JSON-Schema-Ausgabe). **Die KI trägt nichts selbst ein:** Vorschläge erscheinen mit Häkchen, erst „Übernehmen“ speichert (Klausuren rot 📝, Abgaben orange ⏰, vergangene Termine standardmäßig abgewählt, Unklarheiten als Hinweis). Backend prüft jede Antwort streng (`_clean_import`), Rate-Limit 20 Analysen pro Stunde und Nutzer |
| **Bearbeiten** | Termine antippen = bearbeiten (alle Felder, auch Symbol/Farbe); Listen über ✏️ (Name, Symbol, Farbe); Aufgaben antippen = Titel/Datum ändern. Eigene Farben (z. B. vom Assistenten) bleiben erhalten |
| **Kalender-Komfort** | Knopf „Heute“ erscheint, sobald man einen anderen Monat/Tag ansieht |
| **Konto** | Passwort ändern in den Einstellungen (altes Passwort nötig) |
| **Darstellung** | Hell oder Dunkel (kein Auto-Modus): Knopf oben rechts (☀️/🌙) und Auswahl in den Einstellungen, wird im Browser gespeichert. Bis zur ersten Wahl gilt die Einstellung des Geräts |
| **PWA** | Manifest, Service Worker (Netzwerk zuerst, Shell-Cache `lifehub-shell-v14`), SVG- und PNG-Icons (192/512, maskable, `apple-touch-icon`; erzeugt mit `web/tools/make_icons.py`) |
| **Deployment-Vorbereitung** | `Dockerfile`, `supabase_schema.sql`, CORS, Token-Auth, konfigurierbare API-Adresse (`frontend/config.js`), Anleitung in `web/DEPLOY.md` |

## 3. Was noch nicht existiert

* **Apple-Kalender** (iCloud-CalDAV mit app-spezifischem Passwort)
* **E-Mail** (Gmail + Outlook/Arbeit, Entwürfe mit Freigabe, Stil-Lernen aus gesendeten Mails und Korrekturen)
* **Hue** (später) und Govee
* PDF-Import (nur Bilder: JPEG/PNG/WebP), Wissensbasis (RAG), wechselnde Stundenpläne pro Semester oder A/B-Wochen
* Passwort **zurücksetzen** bei Vergessen (Ändern geht), Token widerrufen
* Content-Security-Policy, Wiederholende Termine, Erinnerungen/Push

**Wichtig: Supabase, Cloud Run und der Webspace des Vaters sind noch nicht eingerichtet und nie getestet.** Der Supabase-Speicher (`SupabaseStore` in `store.py`) und das Dockerfile sind geschrieben, aber noch nicht gelaufen. Lokal läuft alles mit SQLite.

## 4. Architektur

```
web/
├── backend/
│   ├── main.py              FastAPI: Login, Termine, Listen, Aufgaben, Chat, Health; liefert lokal auch das Frontend aus
│   ├── auth.py              scrypt-Hash, signierte Tokens (nur Standardbibliothek)
│   ├── store.py             Speicher: SqliteStore (lokal, hub.db) oder SupabaseStore (PostgREST, wenn SUPABASE_* gesetzt)
│   ├── llm.py               Gemini-Adapter (REST, Function Calling, Wiederholung bei 429/500/503); LLM_PROVIDER austauschbar
│   ├── supabase_schema.sql  Tabellen users, events, todo_lists, todos (+ Row Level Security)
│   ├── Dockerfile, requirements.txt, .env.example
├── frontend/                statische Dateien, kein Build-Schritt
│   ├── index.html, app.js, style.css, config.js, sw.js, manifest.webmanifest, icon.svg
├── tools/make_icons.py      erzeugt die PNG-Icons ohne Zusatzpakete
├── README.md                Starten und Funktionen
└── DEPLOY.md                Betrieb: Webspace + Cloud Run + Supabase
```

**Zielarchitektur für den Betrieb:**

```
Handy → https://hub.<domain> (statische Dateien beim Vater, nur Upload nötig)
          │ fetch + Bearer-Token
          ▼
        Google Cloud Run (Backend, europe-west3) → Supabase (PostgreSQL) + Gemini API
```

**Entscheidungen und Gründe**

* Frontend ohne Framework/Build (reines HTML/JS), damit es auf jedem Webspace liegen kann. Umzug auf Next.js laut Ursprungsplan wäre später möglich, die API bleibt gleich.
* Token im Header statt Cookies, weil Frontend und Backend auf verschiedenen Domains liegen.
* Alle Tabellen tragen `user_id` (Mehrnutzer-fähig). Supabase-Service-Key liegt nur im Backend; Row Level Security ist an, ohne Regeln.
* KI-Anbieter austauschbar (`llm.py`), weil das Gemini-Gratiskontingent bei echten Mails Datenschutz-Fragen aufwirft.
* Aufgaben-Zeilen und Kalender-Marker nutzen `list_color`/`list_emoji`, die das Backend an jede Aufgabe anhängt.

## 5. Auf dem neuen Rechner einrichten

Voraussetzung: Python 3.12 oder neuer. Node ist nicht nötig.

```powershell
cd "<Projektordner>\web\backend"
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
```

In `.env` eintragen (nie committen, nie per Chat schicken):

| Variable | Wert |
| --- | --- |
| `GEMINI_API_KEY` | Key von aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-3.8-flash` (`gemini-2.5-flash` ist für neue Nutzer abgeschaltet) |
| `GEMINI_FALLBACK_MODELS` | optional; Standard `gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite`. Wird bei Überlastung (503) nacheinander probiert, Gesamtgrenze 60 s |
| `LLM_PROVIDER` | `gemini` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `REGISTRATION_CODE` | beliebiger Einladungscode, z. B. `python -c "import secrets; print(secrets.token_urlsafe(9))"` |
| `CORS_ORIGINS` | leer lassen (nur im Betrieb) |

Starten:

```powershell
.\.venv\Scripts\python -m uvicorn main:app --port 8000
```

Dann `http://localhost:8000` öffnen und mit dem Einladungscode ein Konto anlegen. Fürs Handy im WLAN: `--host 0.0.0.0` und `http://<PC-IP>:8000` (PWA-Installation braucht HTTPS, das gibt es erst im Betrieb).

**Stolpersteine**

* `uvicorn[standard]` baut auf Python 3.15 `pyyaml` und scheitert; deshalb steht in `requirements.txt` nur `uvicorn`.
* Nach Änderungen am Frontend hilft ein harter Neuladen (Strg+Umschalt+R). Alter Service-Worker-Cache zeigt sonst die alte Version, besonders wenn der Server nicht läuft. Bei größeren Änderungen den Cache-Namen in `sw.js` hochzählen.
* Gemini meldet manchmal „hohe Auslastung“ (503) für einzelne Modelle; das Backend weicht dann automatisch auf die Ausweichmodelle aus.
* Supabase: nach diesem Stand `supabase_schema.sql` nochmal ausführen (neue Spalte `events.icon` und Tabelle `timetable`).
* **Assistent-Regeln:** Alles mit Datum/Uhrzeit wird nur ein Kalendertermin. Aufgaben legt/hakt der Assistent nur auf ausdrücklichen Wunsch (Wörter wie Aufgabe, To-do, Liste, abhaken): Prompt-Anweisung **und** serverseitige Sperre (`wants_task` in `main.py`). Antworten sind reiner Text (`plain_text` entfernt Markdown wie `**`), das Frontend bereinigt auch alte Verläufe.
* **Kalender-Markierung:** Termine und offene Aufgaben mit Datum färben den Tag in ihrer Farbe (Balken, Symbol; Aufgaben-Balken heller, mit dem Symbol der Liste); erledigte Aufgaben erscheinen nicht.
* **Datensicherheit:** Der Server legt beim Start eine Sicherungskopie von `hub.db` in `web/backend/backups/` an (letzte 14, nur wenn Nutzer existieren). Beim Testen **nie die echte `hub.db` leeren**; Tests mit `HUB_DB_PATH` auf eigener Datenbank und eigenem Port fahren (`smoke_test.py` macht das bereits). Am 2026-10-15 wurden durch ein solches Aufräumen Julians echtes Konto und seine Eingaben gelöscht.
* `hub.db` ist lokal und wird nicht mitgenommen; Daten sind pro Rechner getrennt, bis Supabase läuft.
* Der Server muss laufen, sonst zeigt die Seite „Server nicht erreichbar“.

## 6. Sicherheit / offene Risiken

* Der Gemini-Key wurde im Chat geteilt: **vor jedem Betrieb im Netz im Google AI Studio löschen und neu erzeugen.**
* Kostenloses Gemini-Kontingent: Google darf Eingaben ggf. zur Produktverbesserung nutzen. **Keine echten Mails (vor allem keine Arbeitsmail) darüber laufen lassen**, bis ein bezahlter Tarif oder eine Alternative gewählt ist. Bis dahin nur Testdaten.
* Backend darf nicht öffentlich laufen, ohne dass `SECRET_KEY` und `REGISTRATION_CODE` gesetzt sind.
* Arbeits-Outlook: Firmenrichtlinie und Admin-Freigaben (Microsoft Graph) bzw. IMAP-Freigabe noch zu klären.
* Token im `localStorage` (XSS-Risiko), kein Widerruf, kein Passwort-Reset.
* **Bild-Import schickt Bilder an Gemini.** Beim kostenlosen Kontingent darf Google Eingaben ggf. zur Produktverbesserung nutzen: keine vertraulichen Unterlagen hochladen (Skripte/Stundenpläne meist unkritisch, Arbeitsdokumente nicht).

## 7. Abweichungen von der ursprünglichen Spezifikation

| Ursprünglich | Jetzt |
| --- | --- |
| Next.js + Tailwind + shadcn | Reines HTML/CSS/JS ohne Build |
| Claude 3.5 Sonnet als KI | Gemini (`gemini-3.8-flash`), Adapter austauschbar |
| Hosting Vercel/Render | Webspace des Vaters (Frontend) + Cloud Run (Backend) + Supabase |
| SQLite oder Supabase | SQLite lokal, Supabase im Betrieb |
| Anthropic-API | Nicht genutzt: Claude-Abo gilt nicht für die API, Gemini-Gratiskontingent als Start |

## 8. Nächste Schritte (Vorschlag)

1. Auf dem Handy testen (Kalender-Ziehen, Halten 250 ms, Animationen); Feinschliff nach Gefühl.
2. **Apple-Kalender** anbinden (CalDAV, app-spezifisches Passwort, lesen und schreiben).
3. **Gmail** per IMAP mit App-Passwort (Entwürfe mit Freigabe), danach Outlook; Datenschutz-Entscheidung zur KI vorher klären.
4. Stil-Lernen: Entwurf vs. freigegebene Fassung speichern und als Beispiele in den Kontext geben.
5. **Betrieb:** Supabase-Projekt, Cloud Run, Subdomain beim Vater (siehe `web/DEPLOY.md`). Dazu Vater fragen: Subdomain, HTTPS, Upload-Zugang, ob ein DNS-Eintrag möglich ist.
6. Listen bearbeiten, Passwort ändern, danach Hue (zuerst Govee oder gar kein Licht).

## 9. Offene Entscheidungen / Fragen an Julian

* Welcher Kalender/Mail-Zugang zuerst: Apple-Kalender oder Gmail?
* Gemini-Gratis dauerhaft oder bezahlter Tarif/Alternative, sobald echte Mails ins Spiel kommen?
* Hat der Vater schon eine Subdomain mit HTTPS und kann er einen DNS-Eintrag setzen (für `api.<domain>`, optional)?
* Outlook (Arbeit): IMAP erlaubt? Darf Arbeitsmail an eine Cloud-KI?
* Soll `CLAUDE.md` im Projekt angelegt werden, damit Claude auf dem neuen Rechner sofort den Kontext hat? (Dieses Dokument kann dafür die Grundlage sein.)

## 10. Kurzreferenz API (alle außer Health/Login/Register brauchen `Authorization: Bearer <token>`)

```
POST   /api/auth/register  {username, password, code}
POST   /api/auth/login     {username, password}
POST   /api/auth/password  {old_password, new_password}   (Login nötig)
GET    /api/health
GET    /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/events         {title, start_date, end_date?, start_time?, end_time?, color?, note?}
GET    /api/auth/me        (prüft, ob das Konto noch existiert)
PUT    /api/events/{id}    (komplettes Ersetzen, gleiche Felder wie POST)
DELETE /api/events/{id}
GET    /api/lists          POST /api/lists {name, emoji, color}      PATCH /api/lists/{id} {name?, emoji?, color?}      DELETE /api/lists/{id}    DELETE /api/lists/{id}/done
GET    /api/todos?list_id=&due_from=&due_to=
POST   /api/todos          {list_id, title, due_date?}
PATCH  /api/todos/{id}     {done?, title?, due_date?}   (due_date: null entfernt das Datum)
DELETE /api/todos/{id}
GET    /api/timetable      POST /api/timetable {title, weekday 1-7, start_time, end_time?, room?, color?, icon?}
PUT    /api/timetable/{id}  DELETE /api/timetable/{id}
POST   /api/import/analyze {image (Base64), mime image/jpeg|png|webp, mode auto|events|timetable}  → {events, classes, dropped, remarks}
POST   /api/import/commit  {events:[...], classes:[...]}  → {events: n, classes: n}
POST   /api/chat           {messages:[{role, content}]}  → {reply, events_created, tasks_changed}
```
