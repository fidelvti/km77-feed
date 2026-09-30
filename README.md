# km77-feed

Notificaciones push (vía [ntfy.sh](https://ntfy.sh)) con las novedades de la portada de
[km77.com](https://www.km77.com/), generadas automáticamente una vez al día por un
**Cloudflare Worker con Cron Trigger** — sin depender de que ningún Mac esté encendido.
Como subproducto también se publica un `docs/feed.xml` (RSS 2.0) vía GitHub Pages, aunque
en la práctica no es una vía fiable — ver "Nota histórica" más abajo.

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

## Arquitectura (Cloudflare Worker)

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API) — por eso el scraping no puede correr en GitHub Actions.
Comprobado empíricamente que **un Cloudflare Worker sí puede leer km77.com sin problema**
(probablemente porque Cloudflare no trata el tráfico saliente de sus propios Workers igual
que el de rangos de IP de otros proveedores cloud conocidos y bloqueados). De ahí la
arquitectura actual, con dos piezas:

1. **`worker/` (Cloudflare Worker + Cron Trigger, `0 18 * * *` UTC = 20:00 CEST / 19:00
   CET):** hace todo el trabajo que necesita alcanzar km77.com — scraping con
   `HTMLRewriter`, parseo de fechas relativas, generación del RSS, comparación con el
   estado anterior (Workers KV) para detectar artículos nuevos. Publica `docs/feed.xml` y
   `docs/index.html` en este repo vía la API de contenidos de GitHub (para que GitHub
   Pages los siga sirviendo en la misma URL de siempre), y si hay artículos nuevos dispara
   un evento `repository_dispatch` con sus datos.
   - El cron en UTC no se autoajusta al cambio de hora: en invierno la ejecución pasará a
     ser a las 19:00 hora española en vez de las 20:00. Cambiar esto exigiría dos entradas
     de cron distintas activas/inactivas según la época del año — no se ha hecho, el
     desfase de una hora dos veces al año no se considera un problema real.
2. **`.github/workflows/notify.yml` (GitHub Actions, disparado por ese
   `repository_dispatch`):** envía las notificaciones a ntfy.sh. Se hace desde aquí y no
   desde el propio Worker porque **ntfy.sh limita las publicaciones (`POST`) por IP, y las
   IPs de salida de los Workers de Cloudflare son compartidas por muchísimos usuarios
   distintos** — en pruebas, el `POST` devolvía `429` de forma consistente desde un Worker,
   mientras que desde un runner de GitHub Actions funciona sin problema (comprobado). Cada
   plataforma se usa para lo que sí puede hacer: el Worker llega a km77.com (que bloquea a
   GitHub Actions); GitHub Actions llega a ntfy.sh sin que le afecte el límite de IP
   compartida de Cloudflare.

### Secretos y estado

- `GITHUB_TOKEN` (secreto del Worker, `wrangler secret put GITHUB_TOKEN` desde `worker/`):
  fine-grained PAT limitado únicamente a este repo, con permiso "Contents: Read and write".
  Se usa tanto para el `PUT` a la API de contenidos como para disparar el
  `repository_dispatch`.
- KV namespace `SEEN_LINKS` (binding en `worker/wrangler.toml`): guarda la lista de enlaces
  ya notificados, equivalente al antiguo `state/seen_links.json`.

### Desplegar/actualizar el Worker

```bash
cd worker
npx wrangler deploy
```

## Vía histórica: Mac + `launchd` (en desuso)

Antes de migrar a Cloudflare Workers, todo esto corría en local desde este Mac, vía un
agente de `launchd` que ejecutaba `scripts/update_and_push.sh` cada día a las 20:00. Ese
camino sigue existiendo en el repo (`scripts/generate_feed.py`,
`scripts/update_and_push.sh`, `state/seen_links.json`) como referencia y respaldo. Una vez
confirmado que el Worker funciona de forma fiable, hay que descargar el agente para que no
corran ambos a la vez (haría doble trabajo, aunque no debería romper nada al ser ambos
idempotentes):

```bash
launchctl unload ~/Library/LaunchAgents/com.fidelvti.km77feed.plist
```

y, si se confirma que el Worker es estable a largo plazo, este apartado y los scripts de
Python pueden borrarse del todo. Para revivirlo si el Worker da problemas:

```bash
launchctl load ~/Library/LaunchAgents/com.fidelvti.km77feed.plist
```

(revisa `~/Library/Logs/km77-feed.log` para ver su actividad pasada).

## Notas

- Este proyecto no es oficial ni está afiliado a km77.com.
- Al ser scraping de HTML (no una API estable), si km77.com cambia las clases CSS de su
  plantilla el parser puede romperse o dejar de encontrar tarjetas; revisa los logs del
  Worker (`npx wrangler tail` desde `worker/`, o la pestaña Logs en el dashboard de
  Cloudflare).
- Las fechas de los artículos son aproximadas: se derivan de texto relativo ("hace X
  horas/días") tal y como lo muestra la web, no de una marca de tiempo exacta.

## Nota histórica: por qué RSS no fue suficiente

RSS es por diseño un modelo "pull": el lector decide cuándo volver a mirar la URL, no el
publicador. Feedly mantiene una caché de cada feed compartida entre todos sus usuarios y
decide con qué frecuencia rastrearla según un algoritmo interno de popularidad — para un
feed personal con un único suscriptor ese ciclo puede ser de muchas horas, sin ningún
ajuste desde nuestro lado (cabeceras, `ttl`) que lo fuerce a mirar más a menudo.

Se probó WebSub (antes PubSubHubbub) para que el feed avisara activamente al hub tras cada
publicación — el XML declara `<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/" />`
y tanto el Worker como (antes) `update_and_push.sh` hacen un POST a ese hub tras cada
actualización — pero tras varios días Feedly siguió sin enterarse: no implementa el lado
"suscriptor" de WebSub para este feed (o no de forma fiable). Se mantiene el aviso al hub
porque no hace daño, pero para uso real se pasó a las notificaciones push de ntfy.sh
descritas en "Uso", que no dependen de que ningún tercero decida escuchar.

Truco manual si aún así quieres forzar a Feedly a rastrear el feed RSS: cambia el `?v=N` de
la URL a un número que nunca haya visto y vuelve a suscribirte con esa URL — al ser
desconocida, la rastrea desde cero al instante (quitar y volver a añadir la *misma* URL no
sirve, te reconecta a la caché vieja). Si algún día se cambia ese número, hay que
actualizar `FEED_SELF_URL` tanto en `worker/src/index.js` como en
`scripts/generate_feed.py`, a la vez que la URL usada en el lector.

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
