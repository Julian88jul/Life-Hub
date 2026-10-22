# Freunde: Kalender, Stundenplan und Aufgaben teilen

Stand: 22.10.2026 · Status: abgestimmt, wartet auf Review

## Ziel

Nutzer können sich mit Freunden verknüpfen und deren Kalender, Stundenplan und Aufgaben ansehen, aber nur, was der Freund ausdrücklich freigegeben hat. Einzelne Termine lassen sich als privat markieren und sind dann für Freunde komplett unsichtbar. Termine von Freunden kann man in den eigenen Kalender einblenden und mit einem Tipp für sich übernehmen.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Verknüpfen | Anfrage per exaktem Benutzernamen; der andere nimmt an oder lehnt ab |
| Freigabe | Pro Freund und pro Richtung: Kalender, Stundenplan, Aufgaben je ja/nein; Standard: alles aus |
| Private Termine | Für Freunde komplett unsichtbar (kein „Beschäftigt“) |
| Notizen | Werden nie geteilt |
| Ansehen | Eigener Freunde-Bereich (nur lesen) und Einblenden im eigenen Kalender |
| Zugang | Freunde-Knopf oben auf „Heute“ mit Zähler für offene Anfragen |
| Rechte | Freunde können nur lesen; Übernehmen erzeugt eine unabhängige Kopie |
| Assistent | Kein Zugriff auf Daten von Freunden |

Nicht enthalten (bewusst weggelassen): einzelne private Aufgaben oder Listen, gemeinsame Bearbeitung, Freigabe-Links, Gruppen.

## Datenbank

### `friendships`

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `id` | bigint, PK | |
| `requester_id` | bigint → users, cascade | wer gefragt hat |
| `addressee_id` | bigint → users, cascade | wer gefragt wurde |
| `status` | text: `pending` / `accepted` | |
| `created_at` | timestamptz | |

- Eindeutig pro Paar unabhängig von der Richtung: eindeutiger Index auf `(least(requester_id, addressee_id), greatest(requester_id, addressee_id))`.
- `requester_id <> addressee_id`.
- Ablehnen, Zurückziehen und Entfernen löschen die Zeile.

### `shares`

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `owner_id` | bigint → users, cascade | wem die Daten gehören |
| `viewer_id` | bigint → users, cascade | wer sie sehen darf |
| `calendar` | boolean, Standard false | |
| `timetable` | boolean, Standard false | |
| `todos` | boolean, Standard false | |

- Primärschlüssel `(owner_id, viewer_id)`.
- Beim Annehmen werden beide Richtungen mit allem aus angelegt.
- Beim Entfernen der Freundschaft werden beide Richtungen gelöscht.

### `events`

- Neue Spalte `private boolean not null default false`.

Beide Speicher (SQLite lokal, Supabase) bekommen dieselben Änderungen. Für Supabase gibt es ein Update-Skript am Ende von `supabase_schema.sql` (idempotent, mit `GRANT` an `service_role`), das vor dem Deploy im SQL Editor ausgeführt wird.

## Schnittstellen

Alle Endpunkte erfordern Login.

| Methode und Pfad | Zweck |
| --- | --- |
| `GET /api/friends` | `{friends, incoming, outgoing}`; Freunde mit `id` (Nutzer-ID), `username`, `they_share` und `i_share` (je `{calendar, timetable, todos}`) |
| `POST /api/friends/request` `{username}` | Anfrage senden; nimmt automatisch an, wenn der andere mich schon angefragt hat |
| `POST /api/friends/{user_id}/accept` | Offene Anfrage dieses Nutzers an mich annehmen |
| `DELETE /api/friends/{user_id}` | Anfrage ablehnen, zurückziehen oder Freundschaft beenden |
| `PUT /api/friends/{user_id}/share` `{calendar, timetable, todos}` | Was dieser Freund von mir sieht |
| `GET /api/friends/{user_id}/events?from=&to=` | Termine des Freundes |
| `GET /api/friends/{user_id}/timetable` | Stundenplan des Freundes |
| `GET /api/friends/{user_id}/todos` | Listen und Aufgaben des Freundes |

Bestehende Termin-Endpunkte (`POST`/`PUT /api/events`) nehmen das Feld `private` an und geben es zurück.

### Regeln

- Daten eines Freundes nur bei `status = accepted` und eingeschalteter Freigabe in `shares(owner = Freund, viewer = ich)`. Sonst immer `404 "Nicht gefunden."`, egal ob der Nutzer fehlt, nicht befreundet ist oder nichts teilt.
- Private Termine filtert der Server heraus.
- Termine von Freunden enthalten nur `id, title, start_date, end_date, start_time, end_time, color, icon`, keine Notiz.
- Anfrage an sich selbst, an unbekannte Namen oder doppelte Anfragen: verständliche Fehlermeldung. Unbekannte Namen: `404 "Benutzer nicht gefunden."` (der Name muss ohnehin exakt bekannt sein).
- Höchstens 20 Anfragen pro Stunde und Nutzer (`429`).
- Die Werkzeuge des Assistenten bleiben auf die eigenen Daten beschränkt.

## Oberfläche

### Freunde-Knopf auf „Heute“

Personen-Symbol oben rechts neben Ort und Theme, mit Zähler bei offenen eingehenden Anfragen. Öffnet den Freunde-Bereich.

### Freunde-Bereich

- Feld „Benutzername“ und Knopf „Anfrage senden“.
- „Anfragen an dich“ mit „Annehmen“ / „Ablehnen“.
- „Gesendet“ mit „Zurückziehen“.
- „Freunde“: Name plus Symbole für das, was der Freund mir zeigt (📅 🗓️ ✅).
  - Antippen: Ansicht des Freundes.
  - Gedrückt halten oder ⚙️: „Was darf <Name> von dir sehen?“ mit drei Schaltern und „Freund entfernen“.

### Ansicht eines Freundes (nur lesen)

- Kopf mit Name und Umschalter Kalender | Stundenplan | Aufgaben (nur freigegebene Bereiche).
- Kalender mit Monat/Woche, Tag antippen zeigt Termine.
- Stundenplan mit Tag/Woche und freien Zeiten.
- Aufgaben: Listen mit Aufgaben, ohne Abhaken.
- Nichts freigegeben: „<Name> teilt noch nichts mit dir.“

### Einblenden im eigenen Kalender

- Zeile mit Freunde-Bubbles (Initial, Farbe) über dem Kalender, nur sichtbar, wenn mindestens ein Freund den Kalender freigibt.
- Ein Tipp schaltet den Freund ein/aus; eingeschaltet leuchtet die Bubble. Speicherung pro Gerät (`localStorage`).
- Eingeblendete Termine: gestrichelter Rand, Initial des Freundes, nicht bearbeitbar.

### Termin übernehmen

- Antippen eines Freundes-Termins (Ansicht oder eingeblendet) zeigt eine Vorschau mit „In meinen Kalender übernehmen“.
- Öffnet das normale Termin-Formular vorausgefüllt (Titel, Datum, Zeiten, Farbe, Symbol); gespeichert wird eine unabhängige Kopie.

### Privater Termin

- Schalter „🔒 Privat (für Freunde unsichtbar)“ im Termin-Formular.
- Private Termine zeigen bei mir ein kleines Schloss.

## Umsetzung und Test

1. Datenbank und Backend inkl. Tests (`smoke_test.py`): Anfragen, Annehmen, Ablehnen, Entfernen, Freigaben, Zugriff ohne Freigabe (404), private Termine unsichtbar, Notizen fehlen, Fremde können nicht annehmen, Ratenbegrenzung.
2. Supabase-Update-Skript; der Nutzer führt es aus, danach Deploy des Backends.
3. Freunde-Bereich und Freunde-Knopf.
4. Ansicht eines Freundes.
5. Einblenden, Übernehmen, Privat-Schalter.

Jeder Schritt wird lokal mit zwei Testkonten in der Handy-Ansicht geprüft und einzeln gepusht. Cache-Version (`sw.js`, `?v=`) wird bei jeder Frontend-Änderung hochgezählt.
