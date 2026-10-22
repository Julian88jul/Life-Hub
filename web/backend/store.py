"""Datenspeicher mit zwei Backends:
* Supabase (PostgreSQL über die REST-Schnittstelle) für den Betrieb, wenn SUPABASE_URL und
  SUPABASE_SERVICE_KEY gesetzt sind.
* SQLite-Datei für die lokale Entwicklung.
Alle Daten gehören zu einem Nutzer (user_id)."""
import os
import sqlite3
import time
from contextlib import contextmanager

import httpx

EVENT_FIELDS = ("title", "start_date", "end_date", "start_time", "end_time", "color", "note", "icon", "private")
TODO_PATCH_FIELDS = ("done", "title", "due_date")
LIST_PATCH_FIELDS = ("name", "emoji", "color")
CLASS_FIELDS = ("title", "weekday", "start_time", "end_time", "room", "color", "icon")


def _event(row) -> dict:
    d = dict(row)
    d["private"] = bool(d["private"])
    return d


def _todo(row) -> dict:
    d = dict(row)
    d["done"] = bool(d["done"])
    return d


class SqliteStore:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def _db(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _backup(self, keep: int = 14):
        """Sicherungskopie beim Start (nur wenn Nutzer vorhanden sind); die letzten `keep` bleiben erhalten."""
        try:
            if not os.path.isfile(self.path) or os.path.getsize(self.path) == 0:
                return
            src = sqlite3.connect(self.path)
            try:
                if not src.execute("SELECT count(*) FROM users").fetchone()[0]:
                    return
                folder = os.path.join(os.path.dirname(self.path), "backups")
                os.makedirs(folder, exist_ok=True)
                dest = sqlite3.connect(os.path.join(folder, "hub-" + time.strftime("%Y%m%d-%H%M%S") + ".db"))
                try:
                    src.backup(dest)  # konsistente Kopie auch bei laufendem Betrieb
                finally:
                    dest.close()
            finally:
                src.close()
            old = sorted(f for f in os.listdir(folder) if f.startswith("hub-") and f.endswith(".db"))
            for name in old[:-keep]:
                os.remove(os.path.join(folder, name))
        except Exception as exc:  # eine fehlgeschlagene Sicherung darf den Start nie verhindern
            print("WARNUNG: Sicherung fehlgeschlagen:", exc)

    def init(self):
        self._backup()
        with self._db() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL)"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    start_time TEXT,
                    end_time TEXT,
                    color TEXT NOT NULL DEFAULT '#4f46e5',
                    note TEXT NOT NULL DEFAULT '',
                    icon TEXT NOT NULL DEFAULT '',
                    private INTEGER NOT NULL DEFAULT 0)"""
            )
            # Bestehende Datenbanken ohne Symbol- bzw. Privat-Spalte nachrüsten
            cols = {r["name"] for r in c.execute("PRAGMA table_info(events)")}
            if "icon" not in cols:
                c.execute("ALTER TABLE events ADD COLUMN icon TEXT NOT NULL DEFAULT ''")
            if "private" not in cols:
                c.execute("ALTER TABLE events ADD COLUMN private INTEGER NOT NULL DEFAULT 0")
            c.execute("CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, start_date, end_date)")
            c.execute(
                """CREATE TABLE IF NOT EXISTS todo_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    emoji TEXT NOT NULL DEFAULT '📝',
                    color TEXT NOT NULL DEFAULT '#4f46e5')"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    list_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    due_date TEXT,
                    done INTEGER NOT NULL DEFAULT 0)"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, list_id, due_date)")
            c.execute(
                """CREATE TABLE IF NOT EXISTS timetable (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    weekday INTEGER NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    room TEXT NOT NULL DEFAULT '',
                    color TEXT NOT NULL DEFAULT '#4f46e5',
                    icon TEXT NOT NULL DEFAULT '')"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_timetable_user ON timetable(user_id, weekday, start_time)")

    # --- Nutzer ---
    def create_user(self, username, password_hash):
        try:
            with self._db() as c:
                cur = c.execute("INSERT INTO users(username,password_hash) VALUES (?,?)", (username, password_hash))
                return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def get_user(self, username):
        with self._db() as c:
            row = c.execute("SELECT id,username,password_hash FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id):
        with self._db() as c:
            row = c.execute("SELECT id,username,password_hash FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None

    def set_password(self, user_id, password_hash):
        with self._db() as c:
            c.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, user_id))

    # --- Termine ---
    def list_events(self, user_id, date_from, date_to):
        with self._db() as c:
            rows = c.execute(
                "SELECT * FROM events WHERE user_id=? AND start_date<=? AND end_date>=? "
                "ORDER BY start_date, COALESCE(start_time,'')",
                (user_id, date_to, date_from),
            ).fetchall()
        return [_event(r) for r in rows]

    def create_event(self, user_id, ev):
        with self._db() as c:
            cur = c.execute(
                "INSERT INTO events(user_id,title,start_date,end_date,start_time,end_time,color,note,icon,private) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (user_id, *(ev[f] for f in EVENT_FIELDS)),
            )
            row = c.execute("SELECT * FROM events WHERE id=?", (cur.lastrowid,)).fetchone()
        return _event(row)

    def update_event(self, user_id, event_id, ev):
        with self._db() as c:
            cur = c.execute(
                "UPDATE events SET title=?,start_date=?,end_date=?,start_time=?,end_time=?,color=?,note=?,icon=?,private=? WHERE id=? AND user_id=?",
                (*(ev[f] for f in EVENT_FIELDS), event_id, user_id),
            )
            if cur.rowcount == 0:
                return None
            row = c.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
        return _event(row)

    def delete_event(self, user_id, event_id):
        with self._db() as c:
            return c.execute("DELETE FROM events WHERE id=? AND user_id=?", (event_id, user_id)).rowcount > 0

    # --- Aufgabenlisten ---
    def list_lists(self, user_id):
        with self._db() as c:
            rows = c.execute("SELECT * FROM todo_lists WHERE user_id=? ORDER BY id", (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_list(self, user_id, list_id):
        with self._db() as c:
            row = c.execute("SELECT * FROM todo_lists WHERE id=? AND user_id=?", (list_id, user_id)).fetchone()
        return dict(row) if row else None

    def create_list(self, user_id, name, emoji, color):
        with self._db() as c:
            cur = c.execute("INSERT INTO todo_lists(user_id,name,emoji,color) VALUES (?,?,?,?)", (user_id, name, emoji, color))
            row = c.execute("SELECT * FROM todo_lists WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def update_list(self, user_id, list_id, changes):
        changes = {k: v for k, v in changes.items() if k in LIST_PATCH_FIELDS}
        with self._db() as c:
            if changes:
                sets = ", ".join(f"{k}=?" for k in changes)
                c.execute(f"UPDATE todo_lists SET {sets} WHERE id=? AND user_id=?", (*changes.values(), list_id, user_id))
            row = c.execute("SELECT * FROM todo_lists WHERE id=? AND user_id=?", (list_id, user_id)).fetchone()
        return dict(row) if row else None

    def delete_list(self, user_id, list_id):
        with self._db() as c:
            c.execute("DELETE FROM todos WHERE list_id=? AND user_id=?", (list_id, user_id))
            return c.execute("DELETE FROM todo_lists WHERE id=? AND user_id=?", (list_id, user_id)).rowcount > 0

    # --- Aufgaben ---
    def list_todos(self, user_id, list_id=None, due_from=None, due_to=None):
        sql, args = "SELECT * FROM todos WHERE user_id=?", [user_id]
        if list_id is not None:
            sql += " AND list_id=?"; args.append(list_id)
        if due_from:
            sql += " AND due_date>=?"; args.append(due_from)
        if due_to:
            sql += " AND due_date<=?"; args.append(due_to)
        sql += " ORDER BY done, COALESCE(due_date,'9999-12-31'), id"
        with self._db() as c:
            rows = c.execute(sql, args).fetchall()
        return [_todo(r) for r in rows]

    def create_todo(self, user_id, list_id, title, due_date):
        with self._db() as c:
            cur = c.execute("INSERT INTO todos(user_id,list_id,title,due_date) VALUES (?,?,?,?)", (user_id, list_id, title, due_date))
            row = c.execute("SELECT * FROM todos WHERE id=?", (cur.lastrowid,)).fetchone()
        return _todo(row)

    def update_todo(self, user_id, todo_id, changes):
        changes = {k: v for k, v in changes.items() if k in TODO_PATCH_FIELDS}
        with self._db() as c:
            if changes:
                sets = ", ".join(f"{k}=?" for k in changes)
                vals = [int(v) if k == "done" else v for k, v in changes.items()]
                c.execute(f"UPDATE todos SET {sets} WHERE id=? AND user_id=?", (*vals, todo_id, user_id))
            row = c.execute("SELECT * FROM todos WHERE id=? AND user_id=?", (todo_id, user_id)).fetchone()
        return _todo(row) if row else None

    def delete_todo(self, user_id, todo_id):
        with self._db() as c:
            return c.execute("DELETE FROM todos WHERE id=? AND user_id=?", (todo_id, user_id)).rowcount > 0

    def clear_done(self, user_id, list_id):
        with self._db() as c:
            return c.execute("DELETE FROM todos WHERE list_id=? AND user_id=? AND done=1", (list_id, user_id)).rowcount

    # --- Stundenplan ---
    def list_classes(self, user_id):
        with self._db() as c:
            rows = c.execute("SELECT * FROM timetable WHERE user_id=? ORDER BY weekday, start_time, id", (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def create_class(self, user_id, cl):
        with self._db() as c:
            cur = c.execute(
                "INSERT INTO timetable(user_id,title,weekday,start_time,end_time,room,color,icon) VALUES (?,?,?,?,?,?,?,?)",
                (user_id, *(cl[f] for f in CLASS_FIELDS)),
            )
            row = c.execute("SELECT * FROM timetable WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def update_class(self, user_id, class_id, cl):
        with self._db() as c:
            cur = c.execute(
                "UPDATE timetable SET title=?,weekday=?,start_time=?,end_time=?,room=?,color=?,icon=? WHERE id=? AND user_id=?",
                (*(cl[f] for f in CLASS_FIELDS), class_id, user_id),
            )
            if cur.rowcount == 0:
                return None
            row = c.execute("SELECT * FROM timetable WHERE id=?", (class_id,)).fetchone()
        return dict(row)

    def delete_class(self, user_id, class_id):
        with self._db() as c:
            return c.execute("DELETE FROM timetable WHERE id=? AND user_id=?", (class_id, user_id)).rowcount > 0


class SupabaseStore:
    """Spricht PostgREST mit dem Service-Key an. Der Key darf NUR im Backend liegen."""

    REP = {"Prefer": "return=representation"}

    def __init__(self, url: str, service_key: str):
        service_key = service_key.strip()
        headers = {"apikey": service_key, "Content-Type": "application/json"}
        if service_key.startswith("eyJ"):  # alter JWT-Key; neue sb_secret_-Keys gehören nicht in Authorization
            headers["Authorization"] = f"Bearer {service_key}"
        self.http = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers=headers,
            timeout=15,
        )

    def _get(self, table, params):
        r = self.http.get(f"/{table}", params=params)
        r.raise_for_status()
        return r.json()

    def init(self):
        pass  # Tabellen legst du einmalig mit supabase_schema.sql an

    # --- Nutzer ---
    def create_user(self, username, password_hash):
        r = self.http.post("/users", json={"username": username, "password_hash": password_hash}, headers=self.REP)
        if r.status_code == 409:
            return None
        r.raise_for_status()
        return r.json()[0]["id"]

    def get_user(self, username):
        rows = self._get("users", {"username": f"eq.{username}", "select": "id,username,password_hash"})
        return rows[0] if rows else None

    def get_user_by_id(self, user_id):
        rows = self._get("users", {"id": f"eq.{user_id}", "select": "id,username,password_hash"})
        return rows[0] if rows else None

    def set_password(self, user_id, password_hash):
        r = self.http.patch("/users", params={"id": f"eq.{user_id}"}, json={"password_hash": password_hash})
        r.raise_for_status()

    # --- Termine ---
    def list_events(self, user_id, date_from, date_to):
        return self._get("events", {
            "user_id": f"eq.{user_id}",
            "start_date": f"lte.{date_to}",
            "end_date": f"gte.{date_from}",
            "order": "start_date.asc,start_time.asc.nullsfirst",
        })

    def create_event(self, user_id, ev):
        r = self.http.post("/events", json={"user_id": user_id, **{f: ev[f] for f in EVENT_FIELDS}}, headers=self.REP)
        r.raise_for_status()
        return r.json()[0]

    def update_event(self, user_id, event_id, ev):
        r = self.http.patch("/events", params={"id": f"eq.{event_id}", "user_id": f"eq.{user_id}"},
                            json={f: ev[f] for f in EVENT_FIELDS}, headers=self.REP)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def delete_event(self, user_id, event_id):
        r = self.http.delete("/events", params={"id": f"eq.{event_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    # --- Aufgabenlisten ---
    def list_lists(self, user_id):
        return self._get("todo_lists", {"user_id": f"eq.{user_id}", "order": "id.asc"})

    def get_list(self, user_id, list_id):
        rows = self._get("todo_lists", {"id": f"eq.{list_id}", "user_id": f"eq.{user_id}"})
        return rows[0] if rows else None

    def create_list(self, user_id, name, emoji, color):
        r = self.http.post("/todo_lists", json={"user_id": user_id, "name": name, "emoji": emoji, "color": color}, headers=self.REP)
        r.raise_for_status()
        return r.json()[0]

    def update_list(self, user_id, list_id, changes):
        changes = {k: v for k, v in changes.items() if k in LIST_PATCH_FIELDS}
        if not changes:
            return self.get_list(user_id, list_id)
        r = self.http.patch("/todo_lists", params={"id": f"eq.{list_id}", "user_id": f"eq.{user_id}"}, json=changes, headers=self.REP)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def delete_list(self, user_id, list_id):  # Aufgaben der Liste löscht die Datenbank per ON DELETE CASCADE
        r = self.http.delete("/todo_lists", params={"id": f"eq.{list_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    # --- Aufgaben ---
    def list_todos(self, user_id, list_id=None, due_from=None, due_to=None):
        params = [("user_id", f"eq.{user_id}"), ("order", "done.asc,due_date.asc.nullslast,id.asc")]
        if list_id is not None:
            params.append(("list_id", f"eq.{list_id}"))
        if due_from:
            params.append(("due_date", f"gte.{due_from}"))
        if due_to:
            params.append(("due_date", f"lte.{due_to}"))
        return self._get("todos", params)

    def create_todo(self, user_id, list_id, title, due_date):
        r = self.http.post("/todos", json={"user_id": user_id, "list_id": list_id, "title": title, "due_date": due_date}, headers=self.REP)
        r.raise_for_status()
        return r.json()[0]

    def update_todo(self, user_id, todo_id, changes):
        changes = {k: v for k, v in changes.items() if k in TODO_PATCH_FIELDS}
        if not changes:
            rows = self._get("todos", {"id": f"eq.{todo_id}", "user_id": f"eq.{user_id}"})
            return rows[0] if rows else None
        r = self.http.patch("/todos", params={"id": f"eq.{todo_id}", "user_id": f"eq.{user_id}"}, json=changes, headers=self.REP)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def delete_todo(self, user_id, todo_id):
        r = self.http.delete("/todos", params={"id": f"eq.{todo_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    # --- Stundenplan ---
    def list_classes(self, user_id):
        return self._get("timetable", {"user_id": f"eq.{user_id}", "order": "weekday.asc,start_time.asc,id.asc"})

    def create_class(self, user_id, cl):
        r = self.http.post("/timetable", json={"user_id": user_id, **{f: cl[f] for f in CLASS_FIELDS}}, headers=self.REP)
        r.raise_for_status()
        return r.json()[0]

    def update_class(self, user_id, class_id, cl):
        r = self.http.patch("/timetable", params={"id": f"eq.{class_id}", "user_id": f"eq.{user_id}"},
                            json={f: cl[f] for f in CLASS_FIELDS}, headers=self.REP)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def delete_class(self, user_id, class_id):
        r = self.http.delete("/timetable", params={"id": f"eq.{class_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    def clear_done(self, user_id, list_id):
        r = self.http.delete("/todos", params={"list_id": f"eq.{list_id}", "user_id": f"eq.{user_id}", "done": "eq.true"}, headers=self.REP)
        r.raise_for_status()
        return len(r.json())


def _make():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if url and key:
        return SupabaseStore(url, key)
    if os.getenv("K_SERVICE"):  # läuft auf Cloud Run: dort ist das Dateisystem flüchtig
        raise RuntimeError("SUPABASE_URL und SUPABASE_SERVICE_KEY müssen auf Cloud Run gesetzt sein.")
    return SqliteStore(os.getenv("HUB_DB_PATH") or os.path.join(os.path.dirname(__file__), "hub.db"))


_impl = _make()
backend_name = type(_impl).__name__

init = _impl.init
create_user = _impl.create_user
get_user = _impl.get_user
get_user_by_id = _impl.get_user_by_id
set_password = _impl.set_password
list_events = _impl.list_events
create_event = _impl.create_event
update_event = _impl.update_event
delete_event = _impl.delete_event
list_lists = _impl.list_lists
get_list = _impl.get_list
create_list = _impl.create_list
update_list = _impl.update_list
delete_list = _impl.delete_list
list_todos = _impl.list_todos
create_todo = _impl.create_todo
update_todo = _impl.update_todo
delete_todo = _impl.delete_todo
clear_done = _impl.clear_done
list_classes = _impl.list_classes
create_class = _impl.create_class
update_class = _impl.update_class
delete_class = _impl.delete_class
