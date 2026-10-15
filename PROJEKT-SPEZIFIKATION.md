# Projekt-Spezifikation: Persönlicher Life Hub & KI-Agent

Dieses Dokument dient als zentrale Übersicht, technische Dokumentation und Fahrplan für den Aufbau deines persönlichen Life Hubs.

---

## 1. Vision & Zielsetzung

* **Projektziel:** Aufbau einer zentralen Steuerzentrale und eines persönlichen Dashboards zur Vereinfachung des Studien- und Alltagslebens.
* **Interaktiver Assistent:** Bereitstellung eines Chat-Interfaces mit einem Cloud-Agenten, der Fragen beantwortet und Schnittstellen bedient.
* **Mobiles Nutzungskonzept:** Umsetzung als Progressive Web App (PWA), die wie eine native App auf dem Smartphone installiert werden kann.

---

## 2. Funktionsumfang & Integrationen

### 2.1 Sehr gut machbare Integrationen

* **Kalender (Google Calendar / Outlook / Apple iCloud via CalDAV):** Termine abfragen, Terminkonflikte prüfen und neue Vorlesungen automatisch eintragen.
* **E-Mails (Gmail / IMAP):** Posteingang nach wichtigen Uni- und Dozenten-Nachrichten filtern, Zusammenfassungen erstellen und Antwortentwürfe verfassen.
* **Stundenplan-Erkennung (Claude Vision):** Fotos oder Screenshots des Stundenplans per Bilderkennung analysieren und in strukturierte JSON-Formate überführen.
* **Aufgaben- & Notizverwaltung:** Integration von Aufgaben über Todoist, Notion oder Trello.
* **Wissensbasis (RAG):** Vorlesungsfolien und Skripte aus Cloud-Ordnern durchsuchen und gezielt Fragen dazu beantworten.
* **Alltagsdienste:** Integration von Mensa-Speiseplänen über offizielle OpenMensa-APIs sowie Abfrage von Wetter- und Mobilitätsdaten.

### 2.2 Eingeschränkte & riskante Dienste

* **Uni-Websites:** Portale ohne offizielle API müssen über Web-Scraping oder Export von `.ics`-Kalenderdateien angebunden werden.
* **WhatsApp:** Private Automatisierungsskripte bergen ein hohes Risiko einer dauerhaften Sperrung der Telefonnummer durch den Betreiber.
* **Instagram:** Kein offizieller Zugriff auf private Direktnachrichten über die Meta-Graph-API für normale Nutzerkonten.

---

## 3. Technische Architektur

| Schicht | Technologie | Aufgabe im System |
| --- | --- | --- |
| **Frontend (UI)** | Next.js (React) + Tailwind CSS + shadcn/ui | Modulares Dashboard mit Widgets und Chat-Interface. |
| **Backend** | Python (FastAPI) | Verwaltung von API-Tokens, Schnittstellenlogik und Datenverarbeitung. |
| **KI-Gehirn** | Claude 3.5 Sonnet (Anthropic API) | Sprachverarbeitung, multimodale Bildauswertung und Function Calling. |
| **Speicher** | SQLite (lokal) oder Supabase (PostgreSQL) | Persistierung von Stundenplandaten, Aufgaben und Chathistorie. |

> **Hinweis:** Das Modell sollte beim Setup auf eine aktuelle Claude-Version geprüft werden (z. B. `claude-sonnet-5-5`). Die Modell-ID gehört in eine Konfigurationsvariable, damit sie ohne Codeänderung getauscht werden kann.

---

## 4. Schritt-für-Schritt-Entwicklungsplan

* **Meilenstein 1 (Grundgerüst):** Aufsetzen des FastAPI-Backends mit einem `/api/chat`-Endpunkt und Erstellung der Benutzeroberfläche in Next.js samt PWA-Konfiguration.
* **Meilenstein 2 (Stundenplan-Verarbeitung):** Implementierung einer Upload-Funktion für Stundenplan-Bilder sowie automatisches Parsen in strukturierte JSON-Listen durch Claude Vision.
* **Meilenstein 3 (Kalender-Tools):** Konfiguration der Google Calendar API in der Google Cloud Console und Anbindung von Function-Calling-Tools.
* **Meilenstein 4 (Dashboard & E-Mails):** Anbindung von Gmail/IMAP für automatisierte Tagesbriefings und Strukturierung des Frontends in Übersichtskarten.

---

## 5. Benötigte Werkzeuge & Setup

* **Entwicklungsumgebung:** Visual Studio Code (VS Code) als kostenloser Code-Editor.
* **Laufzeitumgebung:** Python auf dem Entwicklungsrechner zur Ausführung des Backends.
* **Testumgebung:** Lokaler Webbrowser zur Vorschau der Webanwendung unter `localhost`.
* **Hosting:** Kostenlose Cloud-Bereitstellung über Plattformen wie Vercel oder Render.

---

## 6. Nächste Schritte (Vorgehen)

### Phase 0 – Klärung & Vorbereitung (zuerst, vor dem Coden)

1. Offene Fragen aus Abschnitt 7 beantworten (mindestens die mit **[Blocker]** markierten).
2. Accounts anlegen: Anthropic API (inkl. Budget-Limit), GitHub, Vercel, Render bzw. Supabase.
3. Lokale Umgebung prüfen: Node.js (LTS), Python 3.11+, Git, VS Code.
4. Projektstruktur festlegen (Monorepo mit `frontend/` und `backend/`) und Git-Repository initialisieren.

### Phase 1 – Design-Grundlage (Webdesign-Fokus)

1. **Informationsarchitektur:** Welche Bereiche hat der Hub (Heute, Stundenplan, Aufgaben, Mails, Chat)? Welche Navigation auf dem Smartphone (Bottom-Tab-Bar)?
2. **Wireframes** für Mobile First: Dashboard-Startseite mit Karten, Chat-Ansicht, Stundenplan-Upload.
3. **Design-Tokens:** Farben (Hell/Dunkel), Typografie, Abstände, Eckenradien – umgesetzt als Tailwind-Theme und shadcn/ui-Komponenten.
4. **Klickbarer Prototyp** (HTML-Mockup) zur Abnahme, bevor das echte Frontend gebaut wird.

### Phase 2 – Meilenstein 1: Grundgerüst

1. FastAPI-Projekt mit `/api/chat` (zunächst ohne Tools, nur Streaming-Antwort von Claude).
2. Next.js-App mit Chat-UI, Tailwind und shadcn/ui.
3. PWA-Konfiguration (Manifest, Icons, Service Worker, Installierbarkeit prüfen).
4. Erstes Deployment (Vercel + Render) als Durchstich – früh, damit Hosting-Probleme früh auffallen.

### Phase 3 – Meilensteine 2–4

Wie in Abschnitt 4 beschrieben, jeweils mit eigenem kurzen Plan, Abnahme-Kriterium und Test auf dem echten Smartphone.

### Definition of Done pro Meilenstein

* Funktion läuft auf dem Smartphone (installierte PWA), nicht nur am Desktop.
* Keine Secrets im Repository (`.env`, Secret-Manager der Hosts).
* Kurzer Eintrag in diesem Dokument, was umgesetzt wurde und was sich geändert hat.

---

## 7. Offene Punkte / Zu klären

### Produkt & Umfang

* **[Blocker]** Nutzerkreis: nur du selbst (Single-User) oder später auch Kommilitonen? Das entscheidet über Login, Datentrennung und Kosten.
* **[Blocker]** Login/Absicherung: Wie wird das Dashboard geschützt (z. B. einfacher Login, Passkey, OAuth über Google)? Es enthält Mails und Kalender.
* Priorisierung: Welche Funktion bringt dir im Alltag am meisten (Stundenplan, Mails, Aufgaben, Mensa)? Davon hängt die Reihenfolge ab.
* Sprache der Oberfläche und des Agenten: nur Deutsch oder zweisprachig?

### Accounts & Dienste

* **[Blocker]** Welcher Kalender wird genutzt (Google, Outlook, iCloud)? Danach richtet sich Meilenstein 3.
* **[Blocker]** Welches Mail-Konto (Gmail, Uni-Mail, web.de) und welcher Zugriff (OAuth, IMAP mit App-Passwort)? Nur lesen oder auch Entwürfe/Senden?
* Aufgaben-Tool: Todoist, Notion, Trello – oder erst eine eigene, einfache Aufgabenliste?
* Uni-Portal: Gibt es einen `.ics`-Export oder eine API? Welche Uni/Mensa (für OpenMensa)?
* Stundenplan-Quelle: Foto, Screenshot oder PDF? Wie oft ändert er sich?

### Technik & Betrieb

* **[Blocker]** Budget: Monatliches Limit für die Anthropic-API (Vision und lange Kontexte kosten spürbar).
* Datenhaltung: SQLite reicht lokal, aber auf kostenlosen Render-Instanzen ist das Dateisystem nicht dauerhaft und die Instanz schläft ein. Entscheidung nötig: Supabase von Beginn an oder Hosting mit persistentem Speicher?
* Datenschutz: Mails, Kalender und Uni-Unterlagen gehen an eine Cloud-KI. Welche Daten sind okay, welche bleiben außen vor? (DSGVO-Hinweis bei Dritt-Daten wie Dozenten-Mails.)
* Token-Sicherheit: Wo liegen OAuth-Tokens und API-Keys (Umgebungsvariablen, verschlüsselte DB)?
* RAG: Wo liegen die Vorlesungsunterlagen (Google Drive, OneDrive, lokal) und welche Dateiformate?
* Push-Benachrichtigungen (z. B. Tagesbriefing morgens): gewünscht? Auf iOS nur mit installierter PWA und aktuellen iOS-Versionen zuverlässig.

### Design

* Gewünschter Stil (nüchtern/minimal, verspielt, Uni-Corporate-Farben)?
* Dark Mode als Pflicht oder Option?
* Vorbilder/Apps, deren Optik oder Bedienung dir gefällt?
* Eigenes Logo/Name für die App (relevant für PWA-Icon und Startbildschirm)?

---

## 7a. Entscheidungen & Erweiterungen (Update 1)

### Getroffene Entscheidungen

* **Web-App statt App-Store-App:** Reine Website bzw. PWA, per Handy bedienbar, keine Store-Lizenz nötig.
* **Single-User zuerst, Multi-User später:** Jeder Nutzer bekommt später seinen eigenen Hub mit eigenen Anbindungen. Konsequenz: Datenmodell von Anfang an mit `user_id` auf allen Tabellen, Tokens pro Nutzer verschlüsselt gespeichert.
* **Login:** Benutzername + Passwort (Passwort-Hash mit Argon2/bcrypt, Sitzung per sicherem Cookie, HTTPS Pflicht).
* **Hosting:** Auf dem Webserver des Vaters, um zunächst keine Kosten zu haben.

### Neue Funktionen

* **Apple-Kalender-Anbindung** über iCloud-CalDAV (Zugang per app-spezifischem Passwort, nicht das Apple-ID-Passwort).
* **Eigener Kalender in der Website**, mobil optimiert:
  * Monats-/Wochenansicht, Wisch-Navigation.
  * **Langer Druck auf einen Tag** öffnet "Termin hinzufügen" (Bottom-Sheet).
  * Termine werden zurück in den Apple-Kalender geschrieben.
* **E-Mail-Anbindung:** Outlook (Arbeit) und Gmail (privat), Lesen + Antwortentwürfe.
  * **Nichts wird ohne deine Bestätigung gesendet.** Der Agent erzeugt nur Entwürfe, du gibst frei.
  * **Stil-Lernen:** Der Agent lernt aus deinen gesendeten Mails (Anrede, Du/Sie je Kontakt, Länge, Grußformel). Umsetzung: Stilprofil + Beispiel-Mails pro Kontakt/Kontaktgruppe werden als Kontext mitgegeben, kein Modelltraining. Deine Korrekturen an Entwürfen fließen als neue Beispiele zurück.
* **Smart Home:** Philips Hue und Govee steuern (siehe unten).

### Smart-Home-Anbindung

| Dienst | Weg | Von außen (Webserver) erreichbar? | Kosten |
| --- | --- | --- | --- |
| **Philips Hue** | Lokale Bridge-API (nur im Heimnetz) oder Hue Remote API (Cloud, OAuth, Developer-Account) | Nur über Remote API **oder** ein Relay im Heimnetz | kostenlos |
| **Govee** | Offizielle Govee-Developer-API (Cloud, API-Key per App beantragen), teils zusätzlich LAN-API | Ja, Cloud-API funktioniert von überall | kostenlos (Rate-Limits) |

Empfehlung: Govee über die Cloud-API, Hue über die Remote API. Alternative für Hue: kleines Relay-Skript im Heimnetz (z. B. Raspberry Pi) mit Tunnel (Tailscale/Cloudflare Tunnel).

### Anpassungen an der Architektur

* **Gmail:** Eigene Google-Cloud-Anwendung mit Gmail-Scopes. Im Testmodus laufen Refresh-Tokens nach 7 Tagen ab; für Multi-User wäre eine Google-Verifizierung nötig. Einfachere Alternative: **IMAP/SMTP mit App-Passwort**.
* **Outlook (Arbeit):** Microsoft Graph benötigt eine App-Registrierung; Firmen-Admins sperren das oft. Fallback: IMAP (falls aktiv) oder Weiterleitungsregel.
* **Backend läuft nicht auf jedem Webserver:** FastAPI braucht einen dauerhaften Python-Prozess, Next.js einen Node-Prozess oder Static Export. Reines PHP-Shared-Hosting reicht nicht.
* **Kosten:** Die Anthropic-API ist nutzungsbasiert und **nicht** im Claude-Abo enthalten. Bei Single-User-Nutzung meist wenige Euro im Monat, mit hartem Limit steuerbar. Völlig kostenlos ist die KI-Anbindung nicht.

### Update 2

* **Hue wird verschoben** (späterer Meilenstein, z. B. 6). Zuerst nur Govee oder gar kein Licht.
* **Lernen aus geschriebenen Mails:** Jeder Entwurf wird gespeichert, zusammen mit der Endfassung, die du freigibst. Der Unterschied zwischen beiden (was du geändert hast) ist das stärkste Lernsignal. Dazu kommen deine bereits gesendeten Mails als Startmaterial.
* **Server noch nicht vorhanden:** Hosting-Entscheidung siehe Abschnitt "Hosting-Optionen".

### Hosting-Optionen (Preise ca., bitte vor Kauf prüfen)

| Option | Kosten | Aufwand | Bewertung |
| --- | --- | --- | --- |
| **Kleiner Cloud-Server (VPS)**, z. B. Hetzner, Contabo, Netcup | ca. 4–6 € / Monat | SSH, Linux-Grundkenntnisse; ich kann die Einrichtung Schritt für Schritt anleiten | **Empfohlen:** Root-Zugriff, feste IP, rund um die Uhr erreichbar |
| **Raspberry Pi / Mini-PC zuhause** | einmalig ca. 70–120 €, Strom ca. 1–3 € / Monat | Router-Freigabe oder Tunnel (Cloudflare Tunnel, kostenlos) nötig | Gut, wenn Hue später lokal laufen soll |
| **Kostenloser Cloud-Tarif**, z. B. Oracle Always Free | 0 € | Anmeldung mit Kreditkarte, teils schwer verfügbar | Möglich, aber unzuverlässig in der Verfügbarkeit |
| **Klassischer Webspace (PHP)** | 2–5 € / Monat | gering | **Ungeeignet**, kein Python/Node-Dauerprozess |

Zusätzlich:
* **Domain:** ca. 1–15 € / Jahr (alternativ kostenlose Subdomain, z. B. DuckDNS).
* **HTTPS:** kostenlos über Let's Encrypt (z. B. mit Caddy).
* **Minimum für den Vater:** Linux-Server (Ubuntu/Debian), SSH-Zugang für dich, 1–2 GB RAM, offene Ports 80/443 (bzw. Tunnel), ein Benutzer ohne Root-Rechte für das Projekt.

### Neue offene Fragen

* **[Blocker]** Was für ein Server ist das beim Vater? (VPS/Root-Zugriff, Raspberry Pi/NAS zuhause, oder klassischer Webspace mit PHP?) Welche Software ist installierbar, gibt es SSH, eine Domain und HTTPS?
* **[Blocker]** Steht der Server im selben Heimnetz wie deine Hue-Bridge? Wenn nein, Remote-API bzw. Relay nötig.
* Arbeits-Outlook: Hast du Admin-Rechte für App-Freigaben oder ist IMAP freigeschaltet? Darf Arbeitsmail überhaupt an eine Cloud-KI gehen (Firmenrichtlinie)?
* Welche Govee-Modelle hast du (für die Cloud-/LAN-API-Unterstützung)?
* Soll der Agent Lampen auch per Chat steuern ("mach das Licht aus") oder nur per Buttons im Dashboard?

---

## 8. Risiken im Blick behalten

| Risiko | Gegenmaßnahme |
| --- | --- |
| Kosten der API laufen aus dem Ruder | Hartes Budget-Limit, Caching, kleineres Modell für einfache Aufgaben |
| Kostenloses Hosting schläft ein / verliert Daten | Externe Datenbank (Supabase), Cold-Start akzeptieren oder Ping |
| Sensible Daten in der Cloud | Minimale Berechtigungen (read-only zuerst), Login, keine Secrets im Code |
| Uni-Portal-Scraping bricht bei Änderungen | `.ics`-Export bevorzugen, Scraping nur als Notlösung |
| WhatsApp/Instagram | Bewusst ausklammern |
