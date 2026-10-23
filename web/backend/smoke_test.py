"""Schneller Selbsttest der API (ohne Gemini, mit temporärer Datenbank).

Aufruf im Ordner web/backend:
    .\\.venv\\Scripts\\python smoke_test.py
"""
import os
import sys
import tempfile

# Umgebung VOR dem Import setzen (leere Werte verhindern, dass .env sie überschreibt)
os.environ["HUB_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "smoke.db")
os.environ["SECRET_KEY"] = "smoke-test-secret"
os.environ["REGISTRATION_CODE"] = "smoke-code"
for key in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "CORS_ORIGINS", "K_SERVICE"):
    os.environ[key] = ""

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = ""):
    print(("  ok    " if condition else "  FEHLER") + f" {name}" + (f"  ({detail})" if detail and not condition else ""))
    if not condition:
        failures.append(name)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


with TestClient(main.app) as c:
    print("Allgemein")
    check("health erreichbar", c.get("/api/health").status_code == 200)
    check("Termine ohne Login gesperrt", c.get("/api/events?from=2026-01-01&to=2026-01-31").status_code == 401)

    print("Login")
    body = {"username": "anna", "password": "geheim1234", "code": "smoke-code"}
    check("Registrieren mit falschem Code abgelehnt", c.post("/api/auth/register", json={**body, "code": "x"}).status_code == 403)
    r = c.post("/api/auth/register", json=body)
    check("Registrieren", r.status_code == 201)
    check("Doppelter Name abgelehnt", c.post("/api/auth/register", json=body).status_code == 409)
    check("Falsches Passwort abgelehnt", c.post("/api/auth/login", json={"username": "anna", "password": "falsch1234"}).status_code == 401)
    token = c.post("/api/auth/login", json={"username": "anna", "password": "geheim1234"}).json()["token"]
    H = auth(token)
    other = c.post("/api/auth/register", json={**body, "username": "bert"}).json()["token"]
    HO = auth(other)

    check("Sitzung prüfen (me)", c.get("/api/auth/me", headers=H).json() == {"username": "anna", "avatar": ""})
    check("me ohne Login gesperrt", c.get("/api/auth/me").status_code == 401)

    print("Termine")
    ev = {"title": "Klausur", "start_date": "2026-10-20", "end_date": "2026-10-22", "color": "#ef4444", "icon": "🎓"}
    r = c.post("/api/events", json=ev, headers=H)
    check("Mehrtägigen Termin anlegen", r.status_code == 201 and r.json()["icon"] == "🎓")
    eid = r.json()["id"]
    check("Ungültiges Datum abgelehnt", c.post("/api/events", json={**ev, "start_date": "2026-02-31"}, headers=H).status_code == 422)
    check("Ende vor Beginn abgelehnt", c.post("/api/events", json={**ev, "end_date": "2026-10-01"}, headers=H).status_code == 422)
    r = c.post("/api/events", json={**ev, "title": "Arzt", "private": True}, headers=H)
    check("Privaten Termin anlegen", r.status_code == 201 and r.json()["private"] is True)
    pid = r.json()["id"]
    r = c.post("/api/events", json=ev, headers=H)
    check("Standard ist nicht privat", r.json()["private"] is False)
    check("Privat wieder aus", c.put(f"/api/events/{pid}", json={**ev, "private": False}, headers=H).json()["private"] is False)
    c.delete(f"/api/events/{pid}", headers=H)
    c.delete(f"/api/events/{r.json()['id']}", headers=H)
    check("Ungültige Farbe abgelehnt", c.post("/api/events", json={**ev, "color": "rot"}, headers=H).status_code == 422)
    check("Mittlerer Tag liefert Termin", len(c.get("/api/events?from=2026-10-21&to=2026-10-21", headers=H).json()) == 1)
    check("Anderer Nutzer sieht ihn nicht", c.get("/api/events?from=2026-10-21&to=2026-10-21", headers=HO).json() == [])
    r = c.put(f"/api/events/{eid}", json={**ev, "title": "Klausur Mathe", "icon": "📚"}, headers=H)
    check("Termin ändern", r.status_code == 200 and r.json()["title"] == "Klausur Mathe" and r.json()["icon"] == "📚")
    check("Fremden Termin ändern verboten", c.put(f"/api/events/{eid}", json=ev, headers=HO).status_code == 404)
    check("Fremden Termin löschen verboten", c.delete(f"/api/events/{eid}", headers=HO).status_code == 404)
    check("Termin löschen", c.delete(f"/api/events/{eid}", headers=H).status_code == 200)
    check("Termin weg", c.delete(f"/api/events/{eid}", headers=H).status_code == 404)

    print("Aufgaben")
    lst = c.post("/api/lists", json={"name": "Uni", "emoji": "🎓", "color": "#0ea5e9"}, headers=H).json()
    check("Liste angelegt", lst["name"] == "Uni")
    r = c.patch(f"/api/lists/{lst['id']}", json={"name": "Studium", "emoji": "📚"}, headers=H)
    check("Liste ändern", r.status_code == 200 and r.json()["name"] == "Studium" and r.json()["color"] == "#0ea5e9")
    check("Fremde Liste ändern verboten", c.patch(f"/api/lists/{lst['id']}", json={"name": "x"}, headers=HO).status_code == 404)
    check("Aufgabe in fremder Liste verboten", c.post("/api/todos", json={"list_id": lst["id"], "title": "x"}, headers=HO).status_code == 404)
    t = c.post("/api/todos", json={"list_id": lst["id"], "title": "Skript drucken", "due_date": "2026-10-20"}, headers=H).json()
    check("Aufgabe mit Listeninfo", t["list_name"] == "Studium" and t["done"] is False)
    check("Aufgabe abhaken", c.patch(f"/api/todos/{t['id']}", json={"done": True}, headers=H).json()["done"] is True)
    r = c.patch(f"/api/todos/{t['id']}", json={"title": "Skript kopieren", "due_date": None}, headers=H).json()
    check("Aufgabe ändern, Datum entfernen", r["title"] == "Skript kopieren" and r["due_date"] is None)
    check("Ungültiges Datum abgelehnt (Aufgabe)", c.patch(f"/api/todos/{t['id']}", json={"due_date": "2026-13-45"}, headers=H).status_code == 422)
    c.patch(f"/api/todos/{t['id']}", json={"due_date": "2026-10-20"}, headers=H)
    check("Aufgaben nach Datum filtern", len(c.get("/api/todos?due_from=2026-10-20&due_to=2026-10-20", headers=H).json()) == 1)
    check("Erledigte löschen", c.delete(f"/api/lists/{lst['id']}/done", headers=H).json()["deleted"] == 1)
    c.post("/api/todos", json={"list_id": lst["id"], "title": "Rest"}, headers=H)
    check("Liste löschen", c.delete(f"/api/lists/{lst['id']}", headers=H).status_code == 200)
    check("Aufgaben der Liste mitgelöscht", c.get("/api/todos", headers=H).json() == [])

    print("Stundenplan")
    cl = {"title": "Mathe 1", "weekday": 1, "start_time": "08:15", "end_time": "09:45", "room": "H3", "color": "#0ea5e9"}
    r = c.post("/api/timetable", json=cl, headers=H)
    check("Eintrag anlegen", r.status_code == 201 and r.json()["room"] == "H3")
    cid = r.json()["id"]
    check("Ungültiger Wochentag abgelehnt", c.post("/api/timetable", json={**cl, "weekday": 8}, headers=H).status_code == 422)
    check("Ende vor Beginn abgelehnt", c.post("/api/timetable", json={**cl, "end_time": "07:00"}, headers=H).status_code == 422)
    check("Eintrag ändern", c.put(f"/api/timetable/{cid}", json={**cl, "room": "H5"}, headers=H).json()["room"] == "H5")
    check("Fremder Plan leer", c.get("/api/timetable", headers=HO).json() == [])
    check("Fremden Eintrag ändern verboten", c.put(f"/api/timetable/{cid}", json=cl, headers=HO).status_code == 404)
    check("Eintrag löschen", c.delete(f"/api/timetable/{cid}", headers=H).status_code == 200)

    print("Freunde")
    HC = auth(c.post("/api/auth/register", json={**body, "username": "carl"}).json()["token"])
    r = c.post("/api/friends/request", json={"username": "BERT"}, headers=H)
    check("Anfrage per Name (Groß/klein egal)", r.status_code == 201 and r.json()["status"] == "pending")
    check("Anfrage an sich selbst abgelehnt", c.post("/api/friends/request", json={"username": "anna"}, headers=H).status_code == 400)
    check("Unbekannter Name", c.post("/api/friends/request", json={"username": "niemand"}, headers=H).status_code == 404)
    check("Doppelte Anfrage abgelehnt", c.post("/api/friends/request", json={"username": "bert"}, headers=H).status_code == 409)
    fl = c.get("/api/friends", headers=HO).json()
    check("Bert sieht Anfrage", [x["username"] for x in fl["incoming"]] == ["anna"])
    anna_id = fl["incoming"][0]["id"]
    bert_id = c.get("/api/friends", headers=H).json()["outgoing"][0]["id"]
    check("Anfragender kann nicht selbst annehmen", c.post(f"/api/friends/{bert_id}/accept", headers=H).status_code == 404)
    check("Fremder kann nicht annehmen", c.post(f"/api/friends/{anna_id}/accept", headers=HC).status_code == 404)
    check("Annehmen", c.post(f"/api/friends/{anna_id}/accept", headers=HO).json()["status"] == "accepted")
    fa = c.get("/api/friends", headers=H).json()
    off = {"calendar": False, "timetable": False, "todos": False}
    check("Freund in Liste, Freigaben aus", fa["friends"] == [{"id": bert_id, "username": "bert", "avatar": "", "they_share": off, "i_share": off}])
    check("Keine offenen Anfragen mehr", fa["incoming"] == [] and fa["outgoing"] == [])
    c.post("/api/friends/request", json={"username": "anna"}, headers=HC)
    check("Gegenanfrage nimmt sofort an", c.post("/api/friends/request", json={"username": "carl"}, headers=H).json()["status"] == "accepted")
    check("Entfernen", c.delete(f"/api/friends/{bert_id}", headers=H).status_code == 200)
    check("Nach Entfernen nicht mehr in Liste", all(x["username"] != "anna" for x in c.get("/api/friends", headers=HO).json()["friends"]))
    check("Entfernen ohne Freundschaft", c.delete(f"/api/friends/{bert_id}", headers=H).status_code == 404)
    check("Freunde ohne Login gesperrt", c.get("/api/friends").status_code == 401)

    print("Profilbild")
    check("Kein Bild am Anfang", c.get("/api/auth/me", headers=H).json()["avatar"] == "")
    r = c.put("/api/auth/avatar", json={"avatar": "mia"}, headers=H)
    check("Figur wählen", r.status_code == 200 and r.json() == {"avatar": "mia"})
    check("me zeigt Figur", c.get("/api/auth/me", headers=H).json()["avatar"] == "mia")
    check("Unbekannte Figur abgelehnt", c.put("/api/auth/avatar", json={"avatar": "../hack"}, headers=H).status_code == 422)
    check("Figur bleibt nach Fehlversuch", c.get("/api/auth/me", headers=H).json()["avatar"] == "mia")
    check("Bild ohne Login gesperrt", c.put("/api/auth/avatar", json={"avatar": "max"}).status_code == 401)
    c.post("/api/friends/request", json={"username": "bert"}, headers=H)
    c.put("/api/auth/avatar", json={"avatar": "sam"}, headers=HO)
    c.post(f"/api/friends/{c.get('/api/friends', headers=HO).json()['incoming'][0]['id']}/accept", headers=HO)
    fa2 = c.get("/api/friends", headers=H).json()["friends"]
    check("Freund sieht Figur", next(x for x in fa2 if x["username"] == "bert")["avatar"] == "sam")
    check("Andere sehen meine Figur", next(x for x in c.get("/api/friends", headers=HO).json()["friends"] if x["username"] == "anna")["avatar"] == "mia")
    check("Figur zurücksetzen", c.put("/api/auth/avatar", json={"avatar": ""}, headers=H).json() == {"avatar": ""})
    c.delete(f"/api/friends/{next(x for x in fa2 if x['username'] == 'bert')['id']}", headers=H)

    print("Freigaben")
    carl_fid = next(x["id"] for x in c.get("/api/friends", headers=H).json()["friends"] if x["username"] == "carl")
    anna_fid = next(x["id"] for x in c.get("/api/friends", headers=HC).json()["friends"] if x["username"] == "anna")
    q = "?from=2026-10-01&to=2026-10-31"
    check("Ohne Freigabe 404", c.get(f"/api/friends/{anna_fid}/events{q}", headers=HC).status_code == 404)
    c.post("/api/events", json={**ev, "title": "Geheim", "private": True, "note": "x"}, headers=H)
    c.post("/api/events", json={**ev, "title": "Sichtbar", "note": "nur für mich"}, headers=H)
    r = c.put(f"/api/friends/{carl_fid}/share", json={"calendar": True, "timetable": False, "todos": False}, headers=H)
    check("Freigabe setzen", r.status_code == 200 and r.json() == {"calendar": True, "timetable": False, "todos": False})
    fe = c.get(f"/api/friends/{anna_fid}/events{q}", headers=HC).json()
    check("Freundes-Termine lesbar", any(e["title"] == "Sichtbar" for e in fe))
    check("Private Termine unsichtbar", all(e["title"] != "Geheim" for e in fe))
    check("Notiz wird nicht geteilt", all("note" not in e and "private" not in e for e in fe))
    check("Felder genau", set(fe[0]) == {"id", "title", "start_date", "end_date", "start_time", "end_time", "color", "icon"})
    check("Stundenplan nicht freigegeben", c.get(f"/api/friends/{anna_fid}/timetable", headers=HC).status_code == 404)
    check("Aufgaben nicht freigegeben", c.get(f"/api/friends/{anna_fid}/todos", headers=HC).status_code == 404)
    check("Freigabe gilt nur in eine Richtung", c.get(f"/api/friends/{carl_fid}/events{q}", headers=H).status_code == 404)
    check("Nicht-Freund 404", c.get(f"/api/friends/{anna_fid}/events{q}", headers=HO).status_code == 404)
    check("Freigabe an Nicht-Freund 404", c.put(f"/api/friends/{bert_id}/share", json={"calendar": True, "timetable": True, "todos": True}, headers=H).status_code == 404)
    sid = next(e["id"] for e in fe if e["title"] == "Sichtbar")
    c.put(f"/api/events/{sid}", json={**ev, "title": "Sichtbar", "private": True}, headers=H)
    check("Nachträglich privat verschwindet", all(e["id"] != sid for e in c.get(f"/api/friends/{anna_fid}/events{q}", headers=HC).json()))
    c.put(f"/api/friends/{carl_fid}/share", json={"calendar": True, "timetable": True, "todos": True}, headers=H)
    check("Stundenplan lesbar", c.get(f"/api/friends/{anna_fid}/timetable", headers=HC).status_code == 200)
    fl_id = c.post("/api/lists", json={"name": "Geteilt", "emoji": "📚", "color": "#10b981"}, headers=H).json()["id"]
    c.post("/api/todos", json={"list_id": fl_id, "title": "Lesen"}, headers=H)
    ft = c.get(f"/api/friends/{anna_fid}/todos", headers=HC).json()
    check("Aufgaben lesbar", set(ft) == {"lists", "todos"} and any(t["title"] == "Lesen" for t in ft["todos"]))
    check("Aufgaben mit Listen-Infos", all(t.get("list_color") and t.get("list_name") for t in ft["todos"]))
    check("they_share sichtbar", next(x for x in c.get("/api/friends", headers=HC).json()["friends"] if x["username"] == "anna")["they_share"]["todos"] is True)
    c.delete(f"/api/friends/{carl_fid}", headers=H)
    check("Nach Entfernen 404", c.get(f"/api/friends/{anna_fid}/timetable", headers=HC).status_code == 404)

    print("Bild-Import (KI-Antwort simuliert)")
    fake = {
        "events": [
            {"title": "Klausur Mathe 2", "date": "2099-02-10", "start_time": "9:00", "end_time": "11:00", "location": "Audimax", "kind": "exam"},
            {"title": "Abgabe Blatt 5", "date": "2099-01-31", "kind": "deadline"},
            {"title": "Kaputt", "date": "31.02.2099", "kind": "exam"},
            {"title": "Klausur Mathe 2", "date": "2099-02-10", "start_time": "09:00", "kind": "exam"},
        ],
        "classes": [
            {"title": "Physik", "weekday": 3, "start_time": "10:15", "end_time": "11:45", "room": "B2"},
            {"title": "Unsinn", "weekday": 9, "start_time": "10:15"},
        ],
        "remarks": "Zweite Klausur nicht lesbar.",
    }

    async def fake_analyze(image_b64, mime, prompt):
        return fake

    main.llm.analyze_image = fake_analyze
    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
    import base64
    png = base64.b64encode(base64.b64decode(png) + bytes(100)).decode()  # gültiges PNG-Kopfstück, auf Mindestlänge aufgefüllt
    r = c.post("/api/import/analyze", json={"image": png, "mime": "image/png", "mode": "auto"}, headers=H)
    res = r.json()
    check("Analyse liefert Vorschläge", r.status_code == 200 and len(res["events"]) == 2 and len(res["classes"]) == 1, str(res)[:120])
    check("Zeit normalisiert (9:00 → 09:00)", res["events"][0]["start_time"] == "09:00")
    check("Klausur rot mit Symbol, Ort als Notiz", res["events"][0]["color"] == "#ef4444" and res["events"][0]["icon"] == "📝" and "Audimax" in res["events"][0]["note"])
    check("Ungültige Einträge verworfen", res["dropped"] == 2, str(res.get("dropped")))
    check("Hinweis der KI übernommen", "Klausur" in res["remarks"])
    check("Nur Termine: Stundenplan leer", c.post("/api/import/analyze", json={"image": png, "mime": "image/png", "mode": "events"}, headers=H).json()["classes"] == [])
    check("Kein Bild abgelehnt", c.post("/api/import/analyze", json={"image": "A" * 200, "mime": "image/png"}, headers=H).status_code == 422)
    check("Falscher Typ abgelehnt", c.post("/api/import/analyze", json={"image": png, "mime": "application/pdf"}, headers=H).status_code == 422)
    check("Analyse ohne Login gesperrt", c.post("/api/import/analyze", json={"image": png, "mime": "image/png"}).status_code == 401)
    r = c.post("/api/import/commit", json={"events": res["events"], "classes": res["classes"]}, headers=H)
    check("Übernehmen", r.status_code == 201 and r.json() == {"events": 2, "classes": 1}, r.text)
    check("Übernommene Termine sichtbar", len(c.get("/api/events?from=2099-01-01&to=2099-12-31", headers=H).json()) == 2)
    check("Übernommener Stundenplan sichtbar", len(c.get("/api/timetable", headers=H).json()) == 1)

    print("Assistent-Regeln (ohne KI)")
    wt = main.wants_task
    u = lambda t: [{"role": "user", "content": t}]
    check("Termin-Kurzform ist keine Aufgabe", not wt(u("22. 20 Uhr Zahnarzt")))
    check("Termin mit Ort ist keine Aufgabe", not wt(u("Am 22. um 20 Uhr Treffen mit Anna im Cafe")))
    check("„Aufgabe“ wird erkannt", wt(u("Leg eine Aufgabe an: Skript drucken")))
    check("„auf meine Liste“ wird erkannt", wt(u("Setz Wäsche waschen auf meine Haushaltsliste")))
    check("„abhaken“ wird erkannt", wt(u("Hak Mathe ab")))
    check("Bestätigung nach Rückfrage zu Aufgabe", wt([{"role": "user", "content": "Skript drucken"}, {"role": "assistant", "content": "Soll ich das als Aufgabe auf deine Uni-Liste setzen?"}, {"role": "user", "content": "ja"}]))
    check("Bestätigung ohne Aufgaben-Rückfrage bleibt Termin", not wt([{"role": "user", "content": "Zahnarzt am 22."}, {"role": "assistant", "content": "Um wie viel Uhr?"}, {"role": "user", "content": "20 Uhr"}]))
    pt = main.plain_text
    check("Fettdruck entfernt", pt("Termin **Zahnarzt** am **22.**") == "Termin Zahnarzt am 22.")
    check("Listenpunkte statt Sternchen", pt("* **Titel:** Zahnarzt\n* Datum: 22.") == "• Titel: Zahnarzt\n• Datum: 22.")
    check("Überschrift und Backticks entfernt", pt("## Plan\n`code`") == "Plan\ncode")
    check("Normaler Text bleibt", pt("Hallo! 5 * 3 ist 15.") == "Hallo! 5 * 3 ist 15.")

    print("Passwort")
    check("Falsches altes Passwort abgelehnt", c.post("/api/auth/password", json={"old_password": "nope", "new_password": "neuesPasswort1"}, headers=H).status_code == 403)
    check("Zu kurzes neues Passwort abgelehnt", c.post("/api/auth/password", json={"old_password": "geheim1234", "new_password": "kurz"}, headers=H).status_code == 422)
    check("Passwort ändern", c.post("/api/auth/password", json={"old_password": "geheim1234", "new_password": "neuesPasswort1"}, headers=H).status_code == 200)
    check("Altes Passwort gilt nicht mehr", c.post("/api/auth/login", json={"username": "anna", "password": "geheim1234"}).status_code == 401)
    check("Neues Passwort gilt", c.post("/api/auth/login", json={"username": "anna", "password": "neuesPasswort1"}).status_code == 200)

print()
if failures:
    print(f"{len(failures)} Test(s) fehlgeschlagen: " + ", ".join(failures))
    sys.exit(1)
print("Alle Tests bestanden.")
