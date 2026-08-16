#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يدمج التطبيق كله في ملف HTML واحد يعمل من الجهاز مباشرة بلا استضافة."""
import base64, io, os, re

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(SRC, "sahar-mushaf.html")

read = lambda p: io.open(os.path.join(SRC, p), encoding="utf-8").read()
b64 = lambda p: base64.b64encode(open(os.path.join(SRC, p), "rb").read()).decode()

html = read("index.html")
css = read("app.css")
js = read("app.js")
quran = read("data/quran.json")
adhkar = read("data/adhkar.json")

# الخطوط والأيقونة داخل الملف نفسه
for name, f in (("amiri-quran", "fonts/amiri-quran.woff2"), ("amiri", "fonts/amiri.woff2")):
    css = css.replace(f"url('fonts/{name}.woff2')",
                      f"url(data:font/woff2;base64,{b64(f)})")
icon = "data:image/png;base64," + b64("icons/icon-192.png")

# لا حاجة لملف بيان ولا أيقونات خارجية في وضع الملف الواحد
html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', "", html)
html = html.replace('<link rel="icon" href="icons/icon-192.png">',
                    f'<link rel="icon" href="{icon}">')
html = html.replace('<link rel="stylesheet" href="app.css">',
                    "<style>\n" + css + "\n</style>")

esc = lambda t: t.replace("<", "\\u003c")
data_block = (
    '<script type="application/json" id="d-quran">' + esc(quran) + "</script>\n"
    '<script type="application/json" id="d-adhkar">' + esc(adhkar) + "</script>\n"
)
html = html.replace('<script src="app.js"></script>',
                    data_block + "<script>\n" + js + "\n</script>")

assert "app.css" not in html and 'src="app.js"' not in html and "data/quran.json" not in html.split("id=\"d-quran\"")[0]
io.open(OUT, "w", encoding="utf-8").write(html)
print("تم:", OUT, round(os.path.getsize(OUT) / 1048576, 2), "ميجابايت")
