#!/usr/bin/env python3
from datetime import datetime, timezone
from pathlib import Path

OUTPUT_PATH = Path("public/index.html")

HTML = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>km77 feed</title>
</head>
<body>
<h1>Feed no oficial de km77.com</h1>
<p>Generado autom&aacute;ticamente a partir de la revista de km77.com. No es un feed oficial del sitio.</p>
<p><a href="feed.xml">feed.xml</a></p>
<p>&Uacute;ltima actualizaci&oacute;n: {timestamp}</p>
</body>
</html>
"""


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    OUTPUT_PATH.write_text(HTML.format(timestamp=timestamp), encoding="utf-8")


if __name__ == "__main__":
    main()
