# km77-feed

Feed RSS no oficial de la revista de [km77.com](https://www.km77.com/revista/), publicado
con GitHub Pages y actualizado automáticamente una vez al día (20:00) desde un `launchd` local.

km77.com no ofrece un feed RSS propio. Este proyecto consulta la API REST pública de su
WordPress (`https://www.km77.com/revista/wp-json/wp/v2/posts`), que expone las últimas
entradas (noticias, pruebas y novedades de modelos) en JSON, y las convierte en un
`docs/feed.xml` en formato RSS 2.0.

## Uso

Añade esta URL a tu lector RSS:

```
https://fidelvti.github.io/km77-feed/feed.xml
```

## Por qué no corre en GitHub Actions

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API). Por eso la generación del feed corre en local (este Mac, con
IP residencial) mediante un `launchd` agent, y solo el resultado (`docs/feed.xml`) se
sube a GitHub. GitHub Pages sirve ese archivo desde la carpeta `docs/` de la rama `main`.

## Cómo funciona

- `scripts/generate_feed.py`: pide los últimos posts a la API de WordPress y genera `docs/feed.xml`.
- `scripts/write_index.py`: genera una página `docs/index.html` mínima con enlace al feed.
- `scripts/update_and_push.sh`: ejecuta ambos scripts y, si hay cambios, hace commit y push.
- `~/Library/LaunchAgents/com.fidelvti.km77feed.plist`: agente de `launchd` que llama a
  `update_and_push.sh` todos los días a las 20:00 (`StartCalendarInterval`). Requiere que
  el Mac esté encendido y con red en ese momento; si estaba dormido, macOS lo ejecuta en
  cuanto despierta.

## Ejecutar en local

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./scripts/update_and_push.sh
```

## Notas

- Este feed no es oficial ni está afiliado a km77.com. Solo incluye título, enlace, fecha
  y un resumen breve de cada entrada (no el contenido completo del artículo).
- Si km77.com cambia su API o estructura, `update_and_push.sh` puede empezar a fallar;
  revisa los logs en `~/Library/Logs/km77-feed.log`.
