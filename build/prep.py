#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يبني ملفات بيانات التطبيق من مصدرين مستقلين بعد التحقق المتقاطع."""
import json, os, re, hashlib, unicodedata

import os
HERE0 = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE0, "..", "data")
os.makedirs(OUT, exist_ok=True)

# ---------- القرآن ----------
A = json.load(open(os.path.join(HERE0, "src", "A.json")))["quran"]          # fawazahmed0 / ara-quranuthmanihaf
B = json.load(open(os.path.join(HERE0, "src", "B.json")))                    # risan/quran-json

def clean(t):
    t = t.replace("\u200f", "").replace("\ufeff", "")
    t = re.sub(r"[ \t]+", " ", t).strip()
    # المصدر يضع مسافة بعد التنوين المفتوح (هُدࣰ ى) — تُحوَّل لمسافة غير فاصلة
    # حتى لا ينكسر السطر داخل الكلمة الواحدة
    t = re.sub(r"([\u08F0-\u08F2]) ", "\\1\u00A0", t)
    return t

ayat = {}
for v in A:
    ayat.setdefault(v["chapter"], []).append(clean(v["text"]))

# التحقق: عدد السور والآيات
assert len(ayat) == 114, "عدد السور غير صحيح"
assert sum(len(v) for v in ayat.values()) == 6236, "عدد الآيات غير صحيح"
for s in B:
    assert s["total_verses"] == len(ayat[s["id"]]), f"عدد آيات سورة {s['id']}"

meta = [{"i": s["id"], "n": s["name"], "tr": s["transliteration"],
         "t": "مكية" if s["type"] == "meccan" else "مدنية",
         "c": s["total_verses"]} for s in B]

text = [ayat[i] for i in range(1, 115)]
quran = {"source": "Tanzil Uthmani (Hafs) — مدقق بمقارنة مصدرين مستقلين",
         "surahs": meta, "text": text}
open(f"{OUT}/quran.json", "w", encoding="utf-8").write(
    json.dumps(quran, ensure_ascii=False, separators=(",", ":")))

digest = hashlib.sha256("".join("".join(s) for s in text).encode()).hexdigest()

# ---------- الأذكار ----------
raw = json.load(open(os.path.join(HERE0, "src", "azkar_raw.json")))
cols = [c["name"] for c in raw["columns"]]
rows = [dict(zip(cols, r)) for r in raw["rows"]]

WANT = [
    ("الأذكار بعد السلام من الصلاة", "أذكار ما بعد الصلاة", "دبر كل صلاة مكتوبة"),
    ("أذكار الصباح", "أذكار الصباح", "من بعد الفجر إلى طلوع الشمس"),
    ("أذكار المساء", "أذكار المساء", "من بعد العصر إلى المغرب"),
    ("التسبيح، التحميد، التهليل، التكبير", "التسبيح والتهليل وفضله", "أحاديث في فضل الذكر"),
    ("كيف كان النبي يسبح؟", "كيف كان النبي ﷺ يسبّح", "صفة التسبيح"),
    ("فضل الصلاة على النبي صلى الله عليه و سلم", "فضل الصلاة على النبي ﷺ", "أحاديث في فضلها"),
    ("الاستغفار و التوبة", "الاستغفار والتوبة", "سيد الاستغفار وغيره"),
    ("أذكار النوم", "أذكار النوم", "قبل المنام"),
    ("أذكار الاستيقاظ من النوم", "أذكار الاستيقاظ", "عند القيام من النوم"),
    ("الرقية الشرعية من القرآن الكريم", "الرقية من القرآن", "آيات الرقية"),
    ("الرقية الشرعية من السنة النبوية", "الرقية من السنة", "أدعية نبوية للرقية"),
]

FIX = {"مترل": "منزل", "مترلا": "منزلا", "اﻟﻤﺠلس": "المجلس", "ﺗﻬنئة": "تهنئة",
       "اﻟﻤﺠ": "المج", "ﻬ": "ه", "ﻟ": "ل", "ﻤ": "م", "ﺠ": "ج", "ﺗ": "ت"}

def fix(t):
    if not t:
        return ""
    t = unicodedata.normalize("NFKC", t)
    for k, v in FIX.items():
        t = t.replace(k, v)
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")]
    t = "\n".join(l for l in lines if l)
    t = t.replace("((", "").replace("))", "").replace("  ", " ").strip()
    while t.startswith("(") and t.endswith(")"):
        t = t[1:-1].strip()
    return t

groups = []
for src, title, sub in WANT:
    items = []
    for r in rows:
        if r["category"] != src:
            continue
        z = fix(r["zekr"])
        if not z:
            continue
        items.append({
            "z": z,
            "n": max(1, int(r["count"] or 1)),
            "d": fix(r.get("description")),
            "r": fix(r.get("reference")),
        })
    if items:
        groups.append({"t": title, "s": sub, "items": items})

# ===== أذكار ما بعد الصلاة: قائمة منقّحة يدوياً على بطاقات مرجعية =====
HERE = os.path.dirname(os.path.abspath(__file__))
cur = json.load(open(os.path.join(HERE, "after_salah.json"), encoding="utf-8"))

# النصوص القرآنية تُدرَج من ملف المصحف المتحقَّق منه، لا تُكتب يدوياً
qtext = quran["text"]
SLOT = {
    "{AYAT_KURSI}": qtext[1][254],
    "{IKHLAS}":     "\n".join(qtext[111]),
    "{FALAQ}":      "\n".join(qtext[112]),
    "{NAS}":        "\n".join(qtext[113]),
}
items = []
for it in cur["items"]:
    z = SLOT.get(it["z"], it["z"])
    items.append({"z": z, "n": it["n"], "d": it["d"], "r": it["r"]})
for g in groups:
    if g["t"] == "أذكار ما بعد الصلاة":
        g["items"] = items
        g["s"] = "دبر كل صلاة مكتوبة"

open(f"{OUT}/adhkar.json", "w", encoding="utf-8").write(
    json.dumps({"groups": groups}, ensure_ascii=False, separators=(",", ":")))

print("sha256 القرآن:", digest)
print("سور:", len(meta), "| آيات:", sum(len(s) for s in text))
print("أقسام الأذكار:", len(groups), "| مجموع الأذكار:", sum(len(g["items"]) for g in groups))
for g in groups:
    print(f"  - {g['t']}: {len(g['items'])}")
print("حجم quran.json:", os.path.getsize(f"{OUT}/quran.json") // 1024, "KB")
print("حجم adhkar.json:", os.path.getsize(f"{OUT}/adhkar.json") // 1024, "KB")
