# Deployment: Webspace (Frontend) + Cloud Run (Backend) + Supabase (Datenbank)

```
Handy ──HTTPS──> https://hub.deine-domain.de   (statische Dateien beim Vater)
                      │  fetch + Bearer-Token
                      ▼
                Cloud Run: lifehub-api  ──> Supabase (PostgreSQL)
                      │
                      └──> Gemini API
```

Geheimnisse (Gemini-Key, Supabase-Service-Key, SECRET_KEY) liegen **nur** bei Cloud Run, nie im Frontend und nie auf dem Webspace.

## Was dein Vater bereitstellt

* Eine Subdomain, z. B. `hub.deine-domain.de`, mit **HTTPS** (bei fast allen Anbietern kostenlos über Let's Encrypt).
* Zugang zum Hochladen von Dateien (FTP/SFTP oder Dateimanager) in das Verzeichnis dieser Subdomain.
* Es muss kein PHP und kein Server-Programm laufen, es sind nur statische Dateien.

## 1. Supabase (Datenbank, kostenlos)

1. Konto auf supabase.com anlegen, neues Projekt erstellen, Region **Frankfurt (eu-central-1)**.
2. Im Dashboard **SQL Editor** öffnen, den Inhalt von `backend/supabase_schema.sql` einfügen und ausführen (enthält Benutzer, Termine, Aufgaben und Stundenplan; bei späteren Updates einfach nochmal ausführen, bestehende Daten bleiben erhalten).
3. Unter **Project Settings → API** notieren:
   * **Project URL** (`https://xxxx.supabase.co`)
   * **service_role key** (geheim! gibt vollen Zugriff, niemals ins Frontend)

> Das kostenlose Supabase-Projekt wird nach längerer Inaktivität pausiert (derzeit ca. 1 Woche ohne Zugriff). Ein Klick im Dashboard weckt es wieder auf.

## 2. Google Cloud Run (Backend)

Einmalig:

1. Projekt in der Google Cloud Console anlegen und ein Rechnungskonto verknüpfen (Kreditkarte nötig, das Gratis-Kontingent reicht für einen Nutzer).
2. **Budget-Alarm** anlegen (Billing → Budgets & Benachrichtigungen), z. B. 5 €.
3. Google Cloud CLI installieren (`gcloud`), dann `gcloud auth login` und `gcloud config set project <PROJEKT-ID>`.
4. APIs aktivieren: `gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com`

Geheimnisse im **Secret Manager** anlegen (Console → Sicherheit → Secret Manager → Secret erstellen). Vier Secrets:

| Secret-Name | Inhalt |
| --- | --- |
| `gemini-api-key` | Gemini-Key (nach dem Test **neu erstellen**, der alte stand im Chat) |
| `hub-secret-key` | langer Zufallswert, z. B. `python -c "import secrets; print(secrets.token_hex(32))"` |
| `hub-registration-code` | Einladungscode für die Registrierung |
| `supabase-service-key` | service_role key aus Schritt 1 |

Dem Cloud-Run-Dienstkonto (`<PROJEKTNUMMER>-compute@developer.gserviceaccount.com`) die Rolle **Secret Manager Secret Accessor** geben.

Deployen (im Ordner `web/backend`):

```bash
gcloud run deploy lifehub-api --source . --region europe-west3 --allow-unauthenticated \
  --max-instances 2 --memory 512Mi \
  --set-env-vars "LLM_PROVIDER=gemini,GEMINI_MODEL=gemini-3.8-flash,SUPABASE_URL=https://xxxx.supabase.co,CORS_ORIGINS=https://hub.deine-domain.de" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,SECRET_KEY=hub-secret-key:latest,REGISTRATION_CODE=hub-registration-code:latest,SUPABASE_SERVICE_KEY=supabase-service-key:latest"
```

`--allow-unauthenticated` ist nötig, damit dein Handy das Backend erreicht. Geschützt ist es durch den Login in der App. `--max-instances 2` begrenzt die Kosten.

Am Ende gibt `gcloud` die Dienst-Adresse aus, z. B. `https://lifehub-api-abc123-ew.a.run.app`. Kontrolle: `https://…/api/health` muss `"storage":"SupabaseStore"` zeigen.

## 3. Frontend hochladen

1. In `web/frontend/config.js` die Cloud-Run-Adresse eintragen:
   ```js
   window.HUB_API = "https://lifehub-api-abc123-ew.a.run.app";
   ```
2. Diese Dateien in das Verzeichnis der Subdomain hochladen:
   `index.html`, `app.js`, `style.css`, `config.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`
3. `https://hub.deine-domain.de` öffnen, mit dem Einladungscode registrieren, fertig.
4. Auf dem Handy: Seite öffnen → "Zum Startbildschirm hinzufügen" (iOS: Teilen-Menü).

**CORS-Fehler** ("Server nicht erreichbar" trotz laufendem Backend)? Dann stimmt `CORS_ORIGINS` nicht exakt mit der Adresse der Seite überein (Schema `https://`, kein Schrägstrich am Ende). Korrigieren mit:

```bash
gcloud run services update lifehub-api --region europe-west3 --update-env-vars "CORS_ORIGINS=https://hub.deine-domain.de"
```

## 4. Updates

* Backend geändert: derselbe `gcloud run deploy`-Befehl nochmal (Einstellungen bleiben erhalten, dann reicht `gcloud run deploy lifehub-api --source . --region europe-west3`).
* Frontend geändert: Dateien neu hochladen. Den Cache-Namen in `sw.js` (`lifehub-shell-vN`) hochzählen, damit Handys die neue Version laden.

## Kosten und Grenzen

* Cloud Run hat ein monatliches Gratis-Kontingent, das für einen Einzelnutzer in der Regel reicht. Die genauen Grenzen ändern sich, prüfe sie in der aktuellen Preisseite.
* Nach Inaktivität startet das Backend beim ersten Aufruf mit einigen Sekunden Verzögerung (Kaltstart).
* Gemini: Das kostenlose Kontingent hat Limits, und Google darf dort Eingaben ggf. zur Produktverbesserung nutzen. Bei echten Mails siehe Spezifikation.

## Sicherheit (Stand Prototyp)

* Login mit Benutzername und Passwort (scrypt-Hash), Token 30 Tage gültig, gespeichert im Browser (`localStorage`).
* Registrierung nur mit Einladungscode; ohne `REGISTRATION_CODE` ist sie geschlossen.
* Fehlversuche beim Login werden pro Benutzername begrenzt (pro Instanz, kein Schutz gegen verteilte Angriffe).
* Noch offen: Passwort ändern/zurücksetzen, Content-Security-Policy, Token widerrufen.
