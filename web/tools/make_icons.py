"""Erzeugt die PNG-Icons der App (ohne Zusatzpakete) aus denselben Formen wie frontend/icon.svg.

Aufruf:  python web/tools/make_icons.py
Ergebnis: web/frontend/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "frontend")


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


INDIGO, LIGHT, DOT, WHITE = hex_rgb("#4f46e5"), hex_rgb("#c7c4fb"), hex_rgb("#d9d8f5"), (255, 255, 255)


def rrect(cx, cy, hw, hh, r):
    """Vorzeichenbehaftete Entfernung zu einem Rechteck mit runden Ecken."""
    def f(px, py):
        qx, qy = abs(px - cx) - (hw - r), abs(py - cy) - (hh - r)
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
    return f


def circle(cx, cy, r):
    return lambda px, py: math.hypot(px - cx, py - cy) - r


def rect(x0, y0, x1, y1, r=0):
    return rrect((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, r)


def layers(background_rounded: bool):
    """Formen im 512er-Koordinatensystem, von unten nach oben."""
    bg = rect(0, 0, 512, 512, 112 if background_rounded else 0)
    return [
        (bg, INDIGO),
        (rect(116, 148, 396, 400, 36), WHITE),
        (rect(116, 148, 396, 220, 36), LIGHT),
        (rect(116, 190, 396, 220), LIGHT),
        (rect(172, 112, 198, 176, 13), WHITE),
        (rect(314, 112, 340, 176, 13), WHITE),
        (circle(196, 290, 18), INDIGO),
        (circle(256, 290, 18), DOT),
        (circle(316, 290, 18), DOT),
        (circle(196, 350, 18), DOT),
    ]


def render(size, rounded=True, content=1.0):
    """content < 1 verkleinert das Motiv um die Mitte (für 'maskable' mit Sicherheitsrand)."""
    shapes = layers(rounded)
    k = 512 / size
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            px, py = (x + 0.5) * k, (y + 0.5) * k
            r, g, b, a = 0.0, 0.0, 0.0, 0.0
            for i, (shape, color) in enumerate(shapes):
                if i == 0:
                    sx, sy = px, py  # Hintergrund bleibt volle Fläche
                else:
                    sx, sy = 256 + (px - 256) / content, 256 + (py - 256) / content
                d = shape(sx, sy) * (size / 512) * content if i else shape(sx, sy) * (size / 512)
                cov = min(max(0.5 - d, 0.0), 1.0)
                if cov <= 0:
                    continue
                # "über" zusammensetzen
                out_a = cov + a * (1 - cov)
                r = (color[0] * cov + r * a * (1 - cov)) / out_a
                g = (color[1] * cov + g * a * (1 - cov)) / out_a
                b = (color[2] * cov + b * a * (1 - cov)) / out_a
                a = out_a
            pixels += bytes((round(r), round(g), round(b), round(a * 255)))
    return pixels


def write_png(path, size, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("geschrieben:", os.path.normpath(path), f"({len(png) // 1024} KB)")


if __name__ == "__main__":
    write_png(os.path.join(OUT, "icon-192.png"), 192, render(192))
    write_png(os.path.join(OUT, "icon-512.png"), 512, render(512))
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512, render(512, rounded=False, content=0.78))
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180, render(180, rounded=False))
