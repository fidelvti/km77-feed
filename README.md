# km77-feed

Notificaciones push (vía [ntfy.sh](https://ntfy.sh)) con las novedades de la portada de
[km77.com](https://www.km77.com/), generadas automáticamente una vez al día (20:00) desde
un `launchd` local. Como subproducto también se publica un `docs/feed.xml` (RSS 2.0) vía
GitHub Pages, aunque en la práctica no es una vía fiable — ver "Nota histórica" más abajo.

km77.com no ofrece ni RSS ni notificaciones propias. La portada mezcla en una sola lista
cronológica artículos de la revista (WordPress), fichas de "novedades" de modelos nuevos
(`/coches/.../informacion`, que no son posts de WordPress) y galerías de imágenes. Este
proyecto hace scraping de la portada (`/` y `/page/2`) y, por cada artículo genuinamente
nuevo respecto a la ejecución anterior, envía un push a ntfy.sh.

> Nota: se probó primero con la API REST de WordPress
> (`/revista/wp-json/wp/v2/posts`), más robusta que el scraping, pero esa API solo expone
> los posts de la revista — se queda fuera todo lo publicado directamente en la base de
> datos de coches (como las fichas de modelos nuevos), así que se cambió a leer la portada.

## Uso

**Notificaciones push (la vía que funciona):**
1. Instala la app **ntfy** (gratis, App Store / Play Store — sin necesidad de cuenta).
2. Añade una suscripción al topic: `km77-feed-a0efcc40`

Cada push lleva el título del artículo como título de la notificación y enlaza
directamente a él (tocar la notificación abre el artículo en km77.com). La primera vez
que corre el generador (sin estado previo) no envía nada, solo guarda el estado inicial,
para no bombardear con notificaciones de todo el historial ya existente.

El topic es como una "sala" pública de ntfy.sh identificada solo por ese nombre (sin
autenticación) — cualquiera que lo conozca podría suscribirse o publicar en él, por eso es
una cadena aleatoria y no algo adivinable como "km77". No contiene información sensible,
así que el riesgo es solo que alguien más reciba las mismas notificaciones de coches.

**Vía alternativa, RSS (poco fiable, ver nota histórica):**

```
https://fidelvti.github.io/km77-feed/feed.xml?v=5
```

## Por qué no corre en GitHub Actions

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API). Por eso la generación corre en local (este Mac, con IP
residencial) mediante un `launchd` agent, y solo el resultado (`docs/feed.xml`,
`state/seen_links.json`) se sube a GitHub. GitHub Pages sirve `feed.xml` e `index.html`
desde la carpeta `docs/` de la rama `main`.

## Cómo funciona

- `scripts/generate_feed.py`: descarga la portada (`/` y `/page/2`), extrae cada tarjeta
  (`li.js-relocation-destination`) con título, enlace, resumen y fecha relativa ("hace X
  horas/días"). Compara contra `state/seen_links.json` (estado de la ejecución anterior) y
  envía un push a ntfy.sh por cada artículo genuinamente nuevo. También genera
  `docs/feed.xml` con la lista completa y sabe avisar al hub de WebSub con `--ping-only`
  (ver nota histórica más abajo).
- `scripts/write_index.py`: genera una página `docs/index.html` mínima con enlace al feed.
- `scripts/update_and_push.sh`: ejecuta ambos scripts, y si hay cambios hace commit, push,
  espera ~90s a que GitHub Pages despliegue, y avisa al hub de WebSub.
- `~/Library/LaunchAgents/com.fidelvti.km77feed.plist`: agente de `launchd` que llama a
  `update_and_push.sh` todos los días a las 20:00 (`StartCalendarInterval`). Requiere que
  el Mac esté encendido y con red en ese momento; si estaba dormido, macOS lo ejecuta en
  cuanto despierta. Si el Mac está despierto pero por lo que sea `launchd` no dispara ese
  día en concreto (ha pasado alguna vez, sin causa clara), simplemente no hay actualización
  ese día — no hay ahora mismo un mecanismo de reintento automático para ese caso. Si te lo
  has perdido (por ejemplo, el Mac estaba apagado a las 20:00), lánzalo a mano en cualquier
  momento con el comando de ejecución manual de abajo.

## Ejecutar en local

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./scripts/update_and_push.sh
```

Si el venv ya existe (uso normal, para recuperar una ejecución que te hayas perdido), basta
con la última línea:

```bash
./scripts/update_and_push.sh
```

## Notas

- Este proyecto no es oficial ni está afiliado a km77.com.
- Al ser scraping de HTML (no una API estable), si km77.com cambia las clases CSS de su
  plantilla el parser puede romperse o dejar de encontrar tarjetas; revisa los logs en
  `~/Library/Logs/km77-feed.log`.
- Las fechas de los artículos son aproximadas: se derivan de texto relativo ("hace X
  horas/días") tal y como lo muestra la web, no de una marca de tiempo exacta.

## Nota histórica: por qué RSS no fue suficiente

RSS es por diseño un modelo "pull": el lector decide cuándo volver a mirar la URL, no el
publicador. Feedly mantiene una caché de cada feed compartida entre todos sus usuarios y
decide con qué frecuencia rastrearla según un algoritmo interno de popularidad — para un
feed personal con un único suscriptor ese ciclo puede ser de muchas horas, sin ningún
ajuste desde nuestro lado (cabeceras, `ttl`) que lo fuerce a mirar más a menudo.

Se probó WebSub (antes PubSubHubbub) para que el feed avisara activamente al hub tras cada
push — el XML declara `<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/" />` y
`update_and_push.sh` hace un POST a ese hub tras cada `git push` exitoso — pero tras varios
días Feedly siguió sin enterarse: no implementa el lado "suscriptor" de WebSub para este
feed (o no de forma fiable). Se mantiene el aviso al hub porque no hace daño, pero para uso
real se pasó a las notificaciones push de ntfy.sh descritas en "Uso", que no dependen de
que ningún tercero decida escuchar.

Truco manual si aún así quieres forzar a Feedly a rastrear el feed RSS: cambia el `?v=N` de
la URL a un número que nunca haya visto y vuelve a suscribirte con esa URL — al ser
desconocida, la rastrea desde cero al instante (quitar y volver a añadir la *misma* URL no
sirve, te reconecta a la caché vieja). Si algún día se cambia ese número, hay que
actualizar `FEED_SELF_URL` en `scripts/generate_feed.py` a la vez que la URL usada en el
lector.

## Comandos útiles

Ver las últimas ejecuciones del despliegue de GitHub Pages y detectar si alguna falló:

```bash
gh run list --repo fidelvti/km77-feed --limit 5
```

Relanzar una que haya fallado (copia su ID de la columna numérica larga):

```bash
gh run rerun <RUN_ID> --repo fidelvti/km77-feed
gh run watch <RUN_ID> --repo fidelvti/km77-feed --exit-status   # opcional, para verla en directo
```

No hace falta estar dentro de la carpeta del repo para estos comandos (usan `--repo`
explícito), solo tener `gh` autenticado (ya lo está en este Mac).
