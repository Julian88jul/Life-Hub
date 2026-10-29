"""Datenspeicher mit zwei Backends:
* Supabase (PostgreSQL über die REST-Schnittstelle) für den Betrieb, wenn SUPABASE_URL und
  SUPABASE_SERVICE_KEY gesetzt sind.
* SQLite-Datei für die lokale Entwicklung.
Alle Daten gehören zu einem Nutzer (user_id)."""
import json
import os
import sqlite3
import time
from contextlib import contextmanager

import httpx

EVENT_FIELDS = ("title", "start_date", "end_date", "start_time", "end_time", "color", "note", "icon", "private")
TODO_PATCH_FIELDS = ("done", "title", "due_date")
LIST_PATCH_FIELDS = ("name", "emoji", "color")
CLASS_FIELDS = ("title", "weekday", "start_time", "end_time", "room", "color", "icon")
SHARE_FIELDS = ("calendar", "timetable", "todos")
RECIPE_FIELDS = ("name", "category", "minutes", "servings", "ingredients", "steps", "note")
RECIPE_LIST_FIELDS = "id,name,category,minutes,servings,ingredients,thumb"  # ohne großes Foto


def _recipe(row) -> dict:
    """SQLite speichert Zutaten und Schritte als JSON-Text; nach außen sind es Listen."""
    d = dict(row)
    for k in ("ingredients", "steps"):
        if k in d:
            d[k] = json.loads(d[k] or "[]")
    return d


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
                    password_hash TEXT NOT NULL,
                    avatar TEXT NOT NULL DEFAULT '',
                    layout TEXT NOT NULL DEFAULT '')"""
            )
            user_cols = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
            if "avatar" not in user_cols:
                c.execute("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''")
            if "layout" not in user_cols:  # Startseite: Reihenfolge und ausgeblendete Widgets/Tabs (JSON)
                c.execute("ALTER TABLE users ADD COLUMN layout TEXT NOT NULL DEFAULT ''")
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
            c.execute(
                """CREATE TABLE IF NOT EXISTS watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    exchange TEXT NOT NULL DEFAULT '',
                    currency TEXT NOT NULL DEFAULT '',
                    position INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(user_id, symbol, exchange))"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS market_briefings (
                    user_id INTEGER NOT NULL,
                    day TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (user_id, day))"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS friendships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id INTEGER NOT NULL,
                    addressee_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    CHECK (requester_id <> addressee_id))"""
            )
            c.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_pair ON friendships(min(requester_id, addressee_id), max(requester_id, addressee_id))")
            c.execute(
                """CREATE TABLE IF NOT EXISTS shares (
                    owner_id INTEGER NOT NULL,
                    viewer_id INTEGER NOT NULL,
                    calendar INTEGER NOT NULL DEFAULT 0,
                    timetable INTEGER NOT NULL DEFAULT 0,
                    todos INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (owner_id, viewer_id))"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS recipes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'other',
                    minutes INTEGER,
                    servings INTEGER,
                    ingredients TEXT NOT NULL DEFAULT '[]',
                    steps TEXT NOT NULL DEFAULT '[]',
                    note TEXT NOT NULL DEFAULT '',
                    photo TEXT NOT NULL DEFAULT '',
                    thumb TEXT NOT NULL DEFAULT '')"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id)")

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
            row = c.execute("SELECT id,username,password_hash,avatar FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id):
        with self._db() as c:
            row = c.execute("SELECT id,username,password_hash,avatar,layout FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None

    def set_password(self, user_id, password_hash):
        with self._db() as c:
            c.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, user_id))

    def set_avatar(self, user_id, avatar):
        with self._db() as c:
            c.execute("UPDATE users SET avatar=? WHERE id=?", (avatar, user_id))

    def set_layout(self, user_id, layout):
        with self._db() as c:
            c.execute("UPDATE users SET layout=? WHERE id=?", (layout, user_id))

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

    # --- Rezepte ---
    def list_recipes(self, user_id):
        with self._db() as c:
            rows = c.execute(f"SELECT {RECIPE_LIST_FIELDS} FROM recipes WHERE user_id=? ORDER BY name COLLATE NOCASE, id", (user_id,)).fetchall()
        return [_recipe(r) for r in rows]

    def get_recipe(self, user_id, recipe_id):
        with self._db() as c:
            row = c.execute("SELECT * FROM recipes WHERE id=? AND user_id=?", (recipe_id, user_id)).fetchone()
        return _recipe(row) if row else None

    @staticmethod
    def _recipe_values(r):
        return tuple(json.dumps(r[f], ensure_ascii=False) if f in ("ingredients", "steps") else r[f] for f in RECIPE_FIELDS)

    def create_recipe(self, user_id, r):
        with self._db() as c:
            cur = c.execute(
                "INSERT INTO recipes(user_id,name,category,minutes,servings,ingredients,steps,note,photo,thumb) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (user_id, *self._recipe_values(r), r.get("photo") or "", r.get("thumb") or ""),
            )
            new_id = cur.lastrowid
        return self.get_recipe(user_id, new_id)

    def update_recipe(self, user_id, recipe_id, r):
        """`photo` None = Foto behalten, "" = entfernen, sonst ersetzen (immer zusammen mit `thumb`)."""
        sets = ",".join(f"{f}=?" for f in RECIPE_FIELDS)
        values = list(self._recipe_values(r))
        if r.get("photo") is not None:
            sets += ",photo=?,thumb=?"
            values += [r["photo"], r.get("thumb") or ""]
        with self._db() as c:
            if c.execute(f"UPDATE recipes SET {sets} WHERE id=? AND user_id=?", (*values, recipe_id, user_id)).rowcount == 0:
                return None
        return self.get_recipe(user_id, recipe_id)

    def delete_recipe(self, user_id, recipe_id):
        with self._db() as c:
            return c.execute("DELETE FROM recipes WHERE id=? AND user_id=?", (recipe_id, user_id)).rowcount > 0

    # --- Börse ---
    def list_watchlist(self, user_id):
        with self._db() as c:
            rows = c.execute("SELECT id,symbol,name,exchange,currency,position FROM watchlist WHERE user_id=? ORDER BY position, id", (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def add_watch(self, user_id, item):
        try:
            with self._db() as c:
                pos = c.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM watchlist WHERE user_id=?", (user_id,)).fetchone()[0]
                cur = c.execute("INSERT INTO watchlist(user_id,symbol,name,exchange,currency,position) VALUES (?,?,?,?,?,?)",
                                (user_id, item["symbol"], item["name"], item["exchange"], item["currency"], pos))
                row = c.execute("SELECT id,symbol,name,exchange,currency,position FROM watchlist WHERE id=?", (cur.lastrowid,)).fetchone()
        except sqlite3.IntegrityError:
            return None
        return dict(row)

    def delete_watch(self, user_id, watch_id):
        with self._db() as c:
            return c.execute("DELETE FROM watchlist WHERE id=? AND user_id=?", (watch_id, user_id)).rowcount > 0

    def get_briefing(self, user_id, day):
        with self._db() as c:
            row = c.execute("SELECT content,created_at FROM market_briefings WHERE user_id=? AND day=?", (user_id, day)).fetchone()
        return dict(row) if row else None

    def save_briefing(self, user_id, day, content, created_at):
        with self._db() as c:
            c.execute("INSERT INTO market_briefings(user_id,day,content,created_at) VALUES (?,?,?,?) "
                      "ON CONFLICT(user_id,day) DO UPDATE SET content=excluded.content, created_at=excluded.created_at",
                      (user_id, day, content, created_at))

    # --- Freunde ---
    def get_friendship(self, a, b):
        with self._db() as c:
            row = c.execute(
                "SELECT id,requester_id,addressee_id,status FROM friendships "
                "WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
                (a, b, b, a),
            ).fetchone()
        return dict(row) if row else None

    def create_friendship(self, requester_id, addressee_id):
        with self._db() as c:
            cur = c.execute("INSERT INTO friendships(requester_id,addressee_id) VALUES (?,?)", (requester_id, addressee_id))
            row = c.execute("SELECT id,requester_id,addressee_id,status FROM friendships WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def accept_friendship(self, requester_id, addressee_id):
        with self._db() as c:
            c.execute("UPDATE friendships SET status='accepted' WHERE requester_id=? AND addressee_id=?", (requester_id, addressee_id))
            for owner, viewer in ((requester_id, addressee_id), (addressee_id, requester_id)):
                c.execute("INSERT OR IGNORE INTO shares(owner_id,viewer_id) VALUES (?,?)", (owner, viewer))

    def delete_friendship(self, a, b):
        with self._db() as c:
            n = c.execute(
                "DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
                (a, b, b, a),
            ).rowcount
            c.execute("DELETE FROM shares WHERE (owner_id=? AND viewer_id=?) OR (owner_id=? AND viewer_id=?)", (a, b, b, a))
        return n > 0

    def list_friendships(self, user_id):
        with self._db() as c:
            rows = c.execute(
                "SELECT id,requester_id,addressee_id,status FROM friendships WHERE requester_id=? OR addressee_id=? ORDER BY id",
                (user_id, user_id),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_share(self, owner_id, viewer_id):
        with self._db() as c:
            row = c.execute("SELECT calendar,timetable,todos FROM shares WHERE owner_id=? AND viewer_id=?", (owner_id, viewer_id)).fetchone()
        return {k: bool(row[k]) if row else False for k in SHARE_FIELDS}

    def set_share(self, owner_id, viewer_id, calendar, timetable, todos):
        with self._db() as c:
            c.execute(
                "INSERT INTO shares(owner_id,viewer_id,calendar,timetable,todos) VALUES (?,?,?,?,?) "
                "ON CONFLICT(owner_id,viewer_id) DO UPDATE SET calendar=excluded.calendar, "
                "timetable=excluded.timetable, todos=excluded.todos",
                (owner_id, viewer_id, int(calendar), int(timetable), int(todos)),
            )
        return {"calendar": bool(calendar), "timetable": bool(timetable), "todos": bool(todos)}


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
        rows = self._get("users", {"username": f"eq.{username}", "select": "id,username,password_hash,avatar"})
        return rows[0] if rows else None

    def get_user_by_id(self, user_id):
        rows = self._get("users", {"id": f"eq.{user_id}", "select": "id,username,password_hash,avatar,layout"})
        return rows[0] if rows else None

    def set_password(self, user_id, password_hash):
        r = self.http.patch("/users", params={"id": f"eq.{user_id}"}, json={"password_hash": password_hash})
        r.raise_for_status()

    def set_avatar(self, user_id, avatar):
        r = self.http.patch("/users", params={"id": f"eq.{user_id}"}, json={"avatar": avatar})
        r.raise_for_status()

    def set_layout(self, user_id, layout):
        r = self.http.patch("/users", params={"id": f"eq.{user_id}"}, json={"layout": layout})
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

    # --- Rezepte (Zutaten und Schritte liegen als jsonb vor und kommen schon als Listen zurück) ---
    def list_recipes(self, user_id):
        return self._get("recipes", {"user_id": f"eq.{user_id}", "select": RECIPE_LIST_FIELDS, "order": "name.asc,id.asc"})

    def get_recipe(self, user_id, recipe_id):
        rows = self._get("recipes", {"id": f"eq.{recipe_id}", "user_id": f"eq.{user_id}"})
        return rows[0] if rows else None

    def create_recipe(self, user_id, r):
        body = {"user_id": user_id, **{f: r[f] for f in RECIPE_FIELDS}, "photo": r.get("photo") or "", "thumb": r.get("thumb") or ""}
        resp = self.http.post("/recipes", json=body, headers=self.REP)
        resp.raise_for_status()
        return resp.json()[0]

    def update_recipe(self, user_id, recipe_id, r):
        body = {f: r[f] for f in RECIPE_FIELDS}
        if r.get("photo") is not None:  # None = Foto behalten
            body.update(photo=r["photo"], thumb=r.get("thumb") or "")
        resp = self.http.patch("/recipes", params={"id": f"eq.{recipe_id}", "user_id": f"eq.{user_id}"}, json=body, headers=self.REP)
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None

    def delete_recipe(self, user_id, recipe_id):
        r = self.http.delete("/recipes", params={"id": f"eq.{recipe_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    def clear_done(self, user_id, list_id):
        r = self.http.delete("/todos", params={"list_id": f"eq.{list_id}", "user_id": f"eq.{user_id}", "done": "eq.true"}, headers=self.REP)
        r.raise_for_status()
        return len(r.json())

    # --- Börse ---
    def list_watchlist(self, user_id):
        return self._get("watchlist", {"user_id": f"eq.{user_id}", "select": "id,symbol,name,exchange,currency,position",
                                       "order": "position.asc,id.asc"})

    def add_watch(self, user_id, item):
        rows = self.list_watchlist(user_id)
        pos = max((w["position"] for w in rows), default=-1) + 1
        r = self.http.post("/watchlist", params={"select": "id,symbol,name,exchange,currency,position"},
                           json={"user_id": user_id, "position": pos, **{k: item[k] for k in ("symbol", "name", "exchange", "currency")}},
                           headers=self.REP)
        if r.status_code == 409:  # gibt es schon (eindeutig je Konto, Kürzel und Börse)
            return None
        r.raise_for_status()
        return r.json()[0]

    def delete_watch(self, user_id, watch_id):
        r = self.http.delete("/watchlist", params={"id": f"eq.{watch_id}", "user_id": f"eq.{user_id}"}, headers=self.REP)
        r.raise_for_status()
        return bool(r.json())

    def get_briefing(self, user_id, day):
        rows = self._get("market_briefings", {"user_id": f"eq.{user_id}", "day": f"eq.{day}", "select": "content,created_at"})
        return rows[0] if rows else None

    def save_briefing(self, user_id, day, content, created_at):
        r = self.http.post("/market_briefings", json={"user_id": user_id, "day": day, "content": content, "created_at": created_at},
                           headers={"Prefer": "resolution=merge-duplicates"})
        r.raise_for_status()

    # --- Freunde ---
    def _pair(self, a_col, b_col, a, b):
        return f"(and({a_col}.eq.{a},{b_col}.eq.{b}),and({a_col}.eq.{b},{b_col}.eq.{a}))"

    def get_friendship(self, a, b):
        rows = self._get("friendships", {"or": self._pair("requester_id", "addressee_id", a, b),
                                         "select": "id,requester_id,addressee_id,status"})
        return rows[0] if rows else None

    def create_friendship(self, requester_id, addressee_id):
        r = self.http.post("/friendships", params={"select": "id,requester_id,addressee_id,status"},
                           json={"requester_id": requester_id, "addressee_id": addressee_id}, headers=self.REP)
        r.raise_for_status()
        return r.json()[0]

    def accept_friendship(self, requester_id, addressee_id):
        r = self.http.patch("/friendships", params={"requester_id": f"eq.{requester_id}", "addressee_id": f"eq.{addressee_id}"},
                            json={"status": "accepted"})
        r.raise_for_status()
        r = self.http.post("/shares", json=[{"owner_id": requester_id, "viewer_id": addressee_id},
                                            {"owner_id": addressee_id, "viewer_id": requester_id}],
                           headers={"Prefer": "resolution=ignore-duplicates"})
        r.raise_for_status()

    def delete_friendship(self, a, b):
        r = self.http.delete("/friendships", params={"or": self._pair("requester_id", "addressee_id", a, b)}, headers=self.REP)
        r.raise_for_status()
        n = len(r.json())
        r2 = self.http.delete("/shares", params={"or": self._pair("owner_id", "viewer_id", a, b)})
        r2.raise_for_status()
        return n > 0

    def list_friendships(self, user_id):
        return self._get("friendships", {"or": f"(requester_id.eq.{user_id},addressee_id.eq.{user_id})",
                                         "select": "id,requester_id,addressee_id,status", "order": "id.asc"})

    def get_share(self, owner_id, viewer_id):
        rows = self._get("shares", {"owner_id": f"eq.{owner_id}", "viewer_id": f"eq.{viewer_id}", "select": "calendar,timetable,todos"})
        return {k: bool(rows[0][k]) if rows else False for k in SHARE_FIELDS}

    def set_share(self, owner_id, viewer_id, calendar, timetable, todos):
        share = {"calendar": bool(calendar), "timetable": bool(timetable), "todos": bool(todos)}
        r = self.http.post("/shares", json={"owner_id": owner_id, "viewer_id": viewer_id, **share},
                           headers={"Prefer": "resolution=merge-duplicates"})
        r.raise_for_status()
        return share


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
set_avatar = _impl.set_avatar
set_layout = _impl.set_layout
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
list_recipes = _impl.list_recipes
get_recipe = _impl.get_recipe
create_recipe = _impl.create_recipe
update_recipe = _impl.update_recipe
delete_recipe = _impl.delete_recipe
get_friendship = _impl.get_friendship
create_friendship = _impl.create_friendship
accept_friendship = _impl.accept_friendship
delete_friendship = _impl.delete_friendship
list_friendships = _impl.list_friendships
get_share = _impl.get_share
set_share = _impl.set_share
list_watchlist = _impl.list_watchlist
add_watch = _impl.add_watch
delete_watch = _impl.delete_watch
get_briefing = _impl.get_briefing
save_briefing = _impl.save_briefing
