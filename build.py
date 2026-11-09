#!/usr/bin/env python3
"""Build the public website from the artifact page.

Reads ../riviera-maya-planner.html (the Claude artifact, single file), keeps all of its
data, styles and UI, and swaps the Claude-capability persistence layer for the Firebase
layer in src/cloud.js. Writes index.html and app.js next to this script.

Run:  python3 build.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "riviera-maya-planner.html"
html = SRC.read_text(encoding="utf-8")


def between(text, start, end, *, include_start=False, include_end=False):
    i = text.index(start)
    j = text.index(end, i + len(start))
    a = i if include_start else i + len(start)
    b = j + len(end) if include_end else j
    return text[a:b]


title = between(html, "<title>", "</title>").strip()
fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', html).group(0)
style = between(html, "<style>", "</style>", include_start=True, include_end=True)
body = between(html, "</style>", "<script>").strip("\n")
script = between(html, "<script>", "</script>")

# --- script: drop the IIFE wrapper (a module has its own scope) -----------------------------
head_marker = "(() => {\n  'use strict';\n"
tail_marker = "})();\n"
assert script.lstrip("\n").startswith(head_marker), "unexpected script head"
assert script.rstrip().endswith(tail_marker.rstrip()), "unexpected script tail"
core = script.lstrip("\n")[len(head_marker):]
core = core[: core.rstrip().rfind(tail_marker.rstrip())]

# --- script: replace the artifact persistence layer with the Firebase one --------------------
p_start = core.index("  // ---------- persistence:")
p_end = core.index("  // ---------- map ----------")
core = core[:p_start] + (HERE / "src" / "cloud.js").read_text(encoding="utf-8") + "\n" + core[p_end:]
assert "window.claude" not in core, "a Claude-only call survived the swap"

imports = """import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

'use strict';
"""
app_js = imports + "\n" + core.rstrip() + "\n"

# --- body: swap the Claude share panel for the login / invite panel --------------------------
share = between(body, '      <details class="share" id="share">', "      </details>\n", include_start=True, include_end=True)
body = body.replace(share, (HERE / "src" / "auth.html").read_text(encoding="utf-8"))
assert 'id="share"' not in body
old_note = "改动会自动保存。两人共同编辑：页面主人在右上角 Share 里用邮箱把对方加为 Contributor，对方登录后打开同一个网址即可，改动按天实时同步。"
assert old_note in body, "footnote text changed; update build.py"
body = body.replace(old_note, "改动会自动保存。用邮箱登录后，在行程表里输入朋友的邮箱发出邀请，对方注册登录即可共同编辑，改动按天实时同步。")

# --- style: add the panel styles -------------------------------------------------------------
style = style.replace("</style>", (HERE / "src" / "extra.css").read_text(encoding="utf-8") + "</style>")

index = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="2026.11.20–25 普拉亚卡门之行：周边洞穴、天然井、遗址、海岛景点与酒店内活动，按天排进行程，两人共同编辑。">
<meta name="theme-color" content="#0a3c42">
{fonts}
<style>body{{margin:0;font:14px system-ui}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{style}
</head>
<body>
{body}
<script type="module" src="./app.js"></script>
</body>
</html>
"""

(HERE / "index.html").write_text(index, encoding="utf-8")
(HERE / "app.js").write_text(app_js, encoding="utf-8")
print(f"built index.html ({len(index):,} bytes) and app.js ({len(app_js):,} bytes)")
