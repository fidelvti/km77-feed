# km77-feed

Notificaciones push (vía [ntfy.sh](https://ntfy.sh)) con las novedades de la portada de
[km77.com](https://www.km77.com/), generadas automáticamente una vez al día por un
**Cloudflare Worker con Cron Trigger** — sin depender de ningún ordenador encendido. El
propio Worker también sirve un `feed.xml` (RSS 2.0) desde su propia URL, como alternativa
RSS, aunque en la práctica no es una vía fiable — ver "Nota histórica" más abajo.

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
https://km77-feed-worker.fidelvti.workers.dev/feed.xml
```

## Arquitectura (Cloudflare Worker)

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API) — por eso el scraping no puede correr en GitHub Actions.
Comprobado empíricamente que **un Cloudflare Worker sí puede leer km77.com sin problema**
(probablemente porque Cloudflare no trata el tráfico saliente de sus propios Workers igual
que el de rangos de IP de otros proveedores cloud conocidos y bloqueados). De ahí la
arquitectura actual, con tres piezas:

1. **`worker/` (Cloudflare Worker + Cron Trigger, `0 18 * * *` UTC = 20:00 CEST / 19:00
   CET):** hace todo el trabajo que necesita alcanzar km77.com — scraping con
   `HTMLRewriter`, parseo de fechas relativas, generación del RSS, comparación con el
   estado anterior (Workers KV) para detectar artículos nuevos. Guarda el `feed.xml` y el
   `index.html` generados **en su propio almacén KV** (no en este repo — ver "Por qué el
   Worker se sirve a sí mismo" más abajo) y, si hay artículos nuevos, dispara un evento
   `repository_dispatch` con sus datos.
   - El mismo `fetch()` del Worker hace de servidor: una petición normal a `/` o
     `/feed.xml` (sin la cabecera de secreto) simplemente devuelve lo último guardado en
     KV, sin volver a rascar km77.com ni tener ningún efecto secundario.
   - Cloudflare Cron Triggers solo admiten UTC, sin concepto de zona horaria ni cambio de
     hora automático. Para que la ejecución real caiga siempre a las 20:00 en España, el
     `wrangler.toml` registra **dos** horarios (`0 18 * * *` y `0 19 * * *` UTC — uno por
     cada posible desfase, verano/invierno), así que cada día se dispara dos veces: la que
     toca (20:00 locales) y una de más (19:00 o 21:00) que, al ser la pipeline idempotente,
     normalmente no encuentra novedades y no hace nada.
2. **`.github/workflows/notify.yml` (GitHub Actions, disparado por ese
   `repository_dispatch`):** envía las notificaciones a ntfy.sh. Se hace desde aquí y no
   desde el propio Worker porque **ntfy.sh limita las publicaciones (`POST`) por IP, y las
   IPs de salida de los Workers de Cloudflare son compartidas por muchísimos usuarios
   distintos** — en pruebas, el `POST` devolvía `429` de forma consistente desde un Worker,
   mientras que desde un runner de GitHub Actions funciona sin problema (comprobado). Cada
   plataforma se usa para lo que sí puede hacer: el Worker llega a km77.com (que bloquea a
   GitHub Actions); GitHub Actions llega a ntfy.sh sin que le afecte el límite de IP
   compartida de Cloudflare.
3. **`.github/workflows/backup-trigger.yml` (GitHub Actions, `schedule` propio a las 21:00
   UTC):** hace un `curl` autenticado a la URL del Worker para forzar una ejecución real.
   Es una red de seguridad: el Cron Trigger de Cloudflare ha tenido tres incidencias de
   "delayed, missed, and duplicated" en menos de dos semanas (16/23/26 de octubre de 2026,
   reconocidas en [cloudflarestatus.com](https://www.cloudflarestatus.com)) — lo bastante
   seguido como para no fiarse de un único disparador. Al ser una plataforma distinta
   (GitHub Actions en vez de Cloudflare), un fallo de Cloudflare no se lleva también a este
   disparador de repuesto por delante. Como la pipeline es idempotente (compara contra el
   estado en KV), no pasa nada si un día se ejecutan los dos — el segundo simplemente no
   encuentra novedades y no manda nada.

### Por qué el Worker se sirve a sí mismo (y no GitHub Pages)

Hasta el 2026-10-29, el Worker publicaba `docs/feed.xml`/`docs/index.html` en este repo vía
la API de contenidos de GitHub, y GitHub Pages los servía desde ahí. Funcionaba, pero cada
ejecución generaba 1-2 commits automáticos directos a `main` — la misma rama donde se
trabaja en local — así que cualquier clon local se quedaba "atrasado" tras cada ejecución
diaria, y si alguna vez había algo sin subir en local, acababa en conflicto de merge al
hacer `pull` (pasó de verdad, con un commit suelto de una ejecución manual del antiguo
script de Python). La alternativa habría sido mover esos commits a una rama aparte
(`gh-pages`), pero se optó por quitar git de la ecuación del todo: el Worker guarda el
`feed.xml`/`index.html` generados en su propio almacén (Workers KV) y los sirve él mismo
desde su propia URL. Cero commits automáticos — este repo solo cambia cuando se edita
código de verdad. A cambio, la URL pública del feed pasó de
`fidelvti.github.io/km77-feed/feed.xml` a `km77-feed-worker.fidelvti.workers.dev/feed.xml`
(un cambio de dirección, una vez; bajo impacto porque las notificaciones push, el canal
principal, no dependen de esta URL en absoluto).

### Secretos y estado

- `GITHUB_TOKEN` (secreto del Worker, `wrangler secret put GITHUB_TOKEN` desde `worker/`):
  fine-grained PAT limitado únicamente a este repo, con permiso "Contents: Read and write".
  Ya no se usa para subir archivos (eso lo quitamos), solo para disparar el
  `repository_dispatch` que activa `notify.yml`.
- `TRIGGER_SECRET` (secreto del Worker **y** secreto del repo en GitHub Actions, deben
  coincidir): protege la parte del `fetch()` del Worker que ejecuta la pipeline real
  (scraping + posibles pushes). Sin esto, cualquiera que hiciera un `GET` a la URL pública
  del Worker disparaba una ejecución real — pasó de verdad el 2026-10-28: algo externo
  golpeó la URL varias veces y mandó tandas de notificaciones duplicadas (confirmado con el
  historial real de ntfy, `GET https://ntfy.sh/km77-feed-a0efcc40/json?poll=1&since=24h`,
  no solo con los logs de GitHub Actions). Ahora, una petición con la cabecera
  `X-Trigger-Secret` correcta ejecuta la pipeline; sin esa cabecera, se trata como una
  petición de lectura normal y solo se sirve el `feed.xml`/`index.html` ya guardado (sin
  volver a rascar km77.com); con la cabecera pero incorrecta, `401`. `backup-trigger.yml`
  ya la manda. El `scheduled()` (el cron real de Cloudflare) no necesita esto — nunca es
  alcanzable por HTTP, solo lo invoca Cloudflare internamente.
- KV namespace `SEEN_LINKS` (binding en `worker/wrangler.toml`): además de la lista de
  enlaces ya notificados (`seen_links`), guarda también el `feed.xml` y el `index.html` más
  recientes (`feed_xml`, `index_html`) — es lo que sirve el `fetch()` del Worker a los
  lectores normales.

### Desplegar/actualizar el Worker

```bash
cd worker
npx wrangler deploy
```

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
y el Worker hace un POST a ese hub tras cada actualización — pero tras varios días Feedly
siguió sin enterarse: no implementa el lado "suscriptor" de WebSub para este feed (o no de
forma fiable). Se mantiene el aviso al hub porque no hace daño, pero para uso real se pasó
a las notificaciones push de ntfy.sh descritas en "Uso", que no dependen de que ningún
tercero decida escuchar.

## Comandos útiles

Ver las últimas ejecuciones de los workflows y detectar si alguno falló:

```bash
gh run list --repo fidelvti/km77-feed --limit 10
```

Relanzar una que haya fallado (copia su ID de la columna numérica larga):

```bash
gh run rerun <RUN_ID> --repo fidelvti/km77-feed
gh run watch <RUN_ID> --repo fidelvti/km77-feed --exit-status   # opcional, para verla en directo
```

Invocar el Worker a mano (requiere el valor de `TRIGGER_SECRET`):

```bash
curl -H "X-Trigger-Secret: <valor>" https://km77-feed-worker.fidelvti.workers.dev
```

No hace falta estar dentro de la carpeta del repo para los comandos de `gh` (usan `--repo`
explícito), solo tener `gh` autenticado (ya lo está en este Mac).
