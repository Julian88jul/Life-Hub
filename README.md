# Life Hub

Persönliches Dashboard als Web-App (PWA) für Studium und Alltag: Kalender, Aufgabenlisten, Stundenplan, Wetter, Gemini-Assistent und Bild-Import für Klausurtermine und Stundenpläne.

* **Aktueller Stand, Architektur, API, offene Punkte:** [UEBERGABE.md](UEBERGABE.md)
* **Starten, Konfiguration, Selbsttest:** [web/README.md](web/README.md)
* **Betrieb im Netz (Frontend, Cloud Run, Supabase):** [web/DEPLOY.md](web/DEPLOY.md)
* **Ursprüngliche Planung:** [PROJEKT-SPEZIFIKATION.md](PROJEKT-SPEZIFIKATION.md) (teilweise überholt)

## Schnellstart (Windows)

```powershell
cd web\backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env      # GEMINI_API_KEY, SECRET_KEY, REGISTRATION_CODE eintragen
cd ..
.\start-server.bat          # oder Doppelklick im Explorer
```

Dann `http://localhost:8000` öffnen und mit dem Einladungscode ein Konto anlegen.

**Wichtig:** `web/backend/.env` (Schlüssel) und `web/backend/hub.db` (Daten) gehören nicht ins Repository und werden von `.gitignore` ausgeschlossen. Auf jedem Rechner entstehen sie lokal; die Datenbank ist pro Rechner getrennt, bis Supabase eingerichtet ist.
