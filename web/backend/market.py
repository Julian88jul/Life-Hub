"""Kurse und Suche über Twelve Data (kostenloser Tarif: nur Titel mit Zugang "Basic", Kurse verzögert)."""
import os
import time

import httpx

TD_URL = "https://api.twelvedata.com"
QUOTE_TTL = 300  # Sekunden; spart das Tageskontingent
_quote_cache: dict[str, tuple[float, dict]] = {}


class MarketError(Exception):
    pass


def configured() -> bool:
    return bool(os.getenv("TWELVEDATA_API_KEY"))


def _key() -> str:
    return os.getenv("TWELVEDATA_API_KEY", "")


async def search(q: str) -> list[dict]:
    """Aktien/ETFs per Name oder Kürzel; nur Treffer, die im kostenlosen Tarif Kurse liefern."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{TD_URL}/symbol_search", params={"symbol": q, "outputsize": 30, "show_plan": "true", "apikey": _key()})
        data = r.json().get("data", [])
    except (httpx.HTTPError, ValueError) as exc:
        raise MarketError("Suche gerade nicht erreichbar.") from exc
    out, seen = [], set()
    for h in data:
        if (h.get("access") or {}).get("plan") != "Basic":
            continue
        sym = str(h.get("symbol") or "")
        if not sym or sym in seen:
            continue
        seen.add(sym)
        out.append({"symbol": sym, "name": str(h.get("instrument_name") or "")[:120], "exchange": str(h.get("exchange") or "")[:20],
                    "currency": str(h.get("currency") or "")[:8], "type": str(h.get("instrument_type") or "")[:40]})
        if len(out) >= 8:
            break
    return out


def _num(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


async def quotes(symbols: list[str]) -> dict[str, dict]:
    """Kurse für mehrere Kürzel (ein Aufruf). Ergebnis je Kürzel: {price, change_pct, currency} oder {error}."""
    now = time.time()
    result, missing = {}, []
    for s in symbols:
        hit = _quote_cache.get(s)
        if hit and now - hit[0] < QUOTE_TTL:
            result[s] = hit[1]
        else:
            missing.append(s)
    if missing:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{TD_URL}/quote", params={"symbol": ",".join(missing), "apikey": _key()})
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MarketError("Kurse gerade nicht erreichbar.") from exc
        # Ein Kürzel: flaches Objekt; mehrere: nach Kürzel geordnet
        per = {missing[0]: data} if len(missing) == 1 else data
        for s in missing:
            d = per.get(s) if isinstance(per, dict) else None
            if not isinstance(d, dict) or d.get("code") or d.get("close") is None:
                entry = {"error": "Kurs nicht verfügbar"}
            else:
                entry = {"price": _num(d.get("close")), "change_pct": _num(d.get("percent_change")), "currency": str(d.get("currency") or "")}
                _quote_cache[s] = (now, entry)
            result[s] = entry
    return result


SERIES_TTL = 3600  # Kurven ändern sich langsam; spart Kontingent
_series_cache: dict[str, tuple[float, list[float]]] = {}


async def series(symbols: list[str], days: int = 30) -> dict[str, list[float]]:
    """Schlusskurse der letzten `days` Handelstage je Kürzel, älteste zuerst (fehlt etwas: leere Liste)."""
    now = time.time()
    result, missing = {}, []
    for s in symbols:
        hit = _series_cache.get(s)
        if hit and now - hit[0] < SERIES_TTL:
            result[s] = hit[1]
        else:
            missing.append(s)
    if missing:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(f"{TD_URL}/time_series", params={"symbol": ",".join(missing), "interval": "1day", "outputsize": days, "apikey": _key()})
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MarketError("Kursverläufe gerade nicht erreichbar.") from exc
        per = {missing[0]: data} if len(missing) == 1 else data
        for s in missing:
            d = per.get(s) if isinstance(per, dict) else None
            values = d.get("values") if isinstance(d, dict) else None
            closes = []
            for v in reversed(values or []):  # Twelve Data liefert die neuesten zuerst
                n = _num(v.get("close"))
                if n is not None:
                    closes.append(n)
            if closes:
                _series_cache[s] = (now, closes)
            result[s] = closes
    return result


_rate_cache: tuple[float, float] | None = None  # (Zeitpunkt, Euro je Dollar)


async def eur_per_usd() -> float | None:
    """Aktueller Umrechnungskurs (Euro je US-Dollar), 5 Minuten zwischengespeichert."""
    global _rate_cache
    now = time.time()
    if _rate_cache and now - _rate_cache[0] < QUOTE_TTL:
        return _rate_cache[1]
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{TD_URL}/quote", params={"symbol": "EUR/USD", "apikey": _key()})
        usd_per_eur = _num(r.json().get("close"))
    except (httpx.HTTPError, ValueError, AttributeError):
        return _rate_cache[1] if _rate_cache else None
    if not usd_per_eur:
        return _rate_cache[1] if _rate_cache else None
    _rate_cache = (now, round(1 / usd_per_eur, 6))
    return _rate_cache[1]
