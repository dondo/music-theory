"""Bundle the app into a single self-contained file: dist/index.html.

Inlines styles.css and the scripts listed in index.html. Run from the webapp folder:
    python3 tools/build.py
"""
import os
import shutil
import re

with open("index.html", encoding="utf-8") as f:
    html = f.read()


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


html = re.sub(
    r'<link rel="stylesheet" href="([^"]+)">',
    lambda m: "<style>\n" + read(m.group(1)) + "</style>",
    html,
)
html = re.sub(
    r'<script src="([^"]+)"></script>',
    lambda m: "<script>\n" + read(m.group(1)).replace("</script>", "<\\/script>") + "</script>",
    html,
)

with open("dist/index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("wrote dist/index.html (%d KB)" % (len(html.encode("utf-8")) // 1024))

# a local-only marker (gitignored): keep it beside dist/index.html so that copy shows the LOCAL badge too; docs/ never gets it
if os.path.exists("local.js"):
    shutil.copy("local.js", "dist/local.js")

# --- GitHub Pages / PWA output: docs/ -------------------------------------
import hashlib, os, shutil

os.makedirs("docs/icons", exist_ok=True)
shutil.copy("dist/index.html", "docs/index.html")
shutil.copy("manifest.webmanifest", "docs/manifest.webmanifest")
for name in os.listdir("icons"):
    shutil.copy(os.path.join("icons", name), os.path.join("docs/icons", name))
version = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
with open("docs/sw.js", "w", encoding="utf-8") as f:
    f.write(read("sw.js").replace("__VERSION__", version))
open("docs/.nojekyll", "w").close()
print("wrote docs/ (cache version %s)" % version)
