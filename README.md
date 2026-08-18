# km77-feed

Feed RSS no oficial de la portada de [km77.com](https://www.km77.com/), publicado
con GitHub Pages y actualizado automáticamente una vez al día (20:00) desde un `launchd` local.

km77.com no ofrece un feed RSS propio. La portada mezcla en una sola lista cronológica
artículos de la revista (WordPress), fichas de "novedades" de modelos nuevos
(`/coches/.../informacion`, que no son posts de WordPress) y galerías de imágenes. Este
proyecto hace scraping de la portada (`/` y `/page/2`) y la convierte en un `docs/feed.xml`
en formato RSS 2.0.

> Nota: se probó primero con la API REST de WordPress
> (`/revista/wp-json/wp/v2/posts`), más robusta que el scraping, pero esa API solo expone
> los posts de la revista — se queda fuera todo lo publicado directamente en la base de
> datos de coches (como las fichas de modelos nuevos), así que se cambió a leer la portada.

## Uso

Añade esta URL a tu lector RSS:

```
https://fidelvti.github.io/km77-feed/feed.xml?v=5
```

(El `?v=5` no es decorativo: ver la sección de WebSub más abajo — es la URL exacta que el
feed anuncia como su propia identidad y a la que se avisa el hub cuando hay contenido
nuevo. Si algún día se cambia, hay que actualizar `FEED_SELF_URL` en
`scripts/generate_feed.py` a la vez que la URL usada en el lector.)

## Por qué no corre en GitHub Actions

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API). Por eso la generación del feed corre en local (este Mac, con
IP residencial) mediante un `launchd` agent, y solo el resultado (`docs/feed.xml`) se
sube a GitHub. GitHub Pages sirve ese archivo desde la carpeta `docs/` de la rama `main`.

## Cómo funciona

- `scripts/generate_feed.py`: descarga la portada (`/` y `/page/2`), extrae cada tarjeta
  (`li.js-relocation-destination`) con título, enlace, resumen y fecha relativa ("hace X
  horas/días"), y genera `docs/feed.xml`. También sabe avisar al hub de WebSub con
  `--ping-only` (ver más abajo).
- `scripts/write_index.py`: genera una página `docs/index.html` mínima con enlace al feed.
- `scripts/update_and_push.sh`: ejecuta ambos scripts, y si hay cambios hace commit, push,
  espera ~90s a que GitHub Pages despliegue, y avisa al hub de WebSub.
- `~/Library/LaunchAgents/com.fidelvti.km77feed.plist`: agente de `launchd` que llama a
  `update_and_push.sh` todos los días a las 20:00 (`StartCalendarInterval`). Requiere que
  el Mac esté encendido y con red en ese momento; si estaba dormido, macOS lo ejecuta en
  cuanto despierta. Si el Mac está despierto pero por lo que sea `launchd` no dispara ese
  día en concreto (ha pasado alguna vez, sin causa clara), simplemente no hay actualización
  ese día — no hay ahora mismo un mecanismo de reintento automático para ese caso.

## Ejecutar en local

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./scripts/update_and_push.sh
```

## Notas

- Este feed no es oficial ni está afiliado a km77.com. Solo incluye título, enlace, fecha
  y un resumen breve de cada entrada (no el contenido completo del artículo).
- Al ser scraping de HTML (no una API estable), si km77.com cambia las clases CSS de su
  plantilla el parser puede romperse o dejar de encontrar tarjetas; revisa los logs en
  `~/Library/Logs/km77-feed.log`.
- Las fechas de los artículos son aproximadas: se derivan de texto relativo ("hace X
  horas/días") tal y como lo muestra la web, no de una marca de tiempo exacta.

## Por qué Feedly tarda en enterarse de contenido nuevo (y qué se intentó)

RSS es por diseño un modelo "pull": el lector decide cuándo volver a mirar la URL, no el
publicador. Feedly mantiene una caché de cada feed **compartida entre todos sus usuarios**,
y decide con qué frecuencia rastrearla según un algoritmo interno de popularidad — para un
feed personal con un único suscriptor, ese ciclo puede ser de muchas horas o más, y no hay
ningún ajuste desde nuestro lado (cabeceras, `ttl`) que lo fuerce a mirar más a menudo.
Confirmado consultando directamente su caché pública (sin necesidad de cuenta):

```
https://cloud.feedly.com/v3/streams/contents?streamId=feed%2F<URL-codificada>&count=5
```

**Truco manual (siempre funciona, pero hay que repetirlo):** cambiar el `?v=N` de la URL a
un número que Feedly nunca haya visto, y volver a suscribirse con esa URL — al ser
desconocida, Feedly la rastrea desde cero al instante. Quitar y volver a añadir la *misma*
URL no sirve, porque te reconecta a la misma caché vieja.

**Intento de solución de fondo — WebSub (antes PubSubHubbub):** en vez de esperar a que
Feedly pregunte, el feed avisa activamente cuando hay contenido nuevo. El feed declara:

```xml
<atom:link rel="self" href="https://fidelvti.github.io/km77-feed/feed.xml?v=5" />
<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/" />
```

y tras cada `git push` exitoso, `update_and_push.sh` hace un POST a ese hub
(`hub.mode=publish&hub.url=<FEED_SELF_URL>`), que es exactamente el mecanismo que usan por
defecto los sitios de WordPress.com para notificar en tiempo real. Si el lector implementa
el lado "suscriptor" de WebSub, debería enterarse casi al instante en vez de esperar su
ciclo de rastreo habitual. No hay garantía de que Feedly lo respete para un feed personal
tan pequeño — es lo más parecido a una solución de fondo que existe dentro del estándar RSS,
pero no dejar de tener el truco del `?v=N` como respaldo si no funciona.

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
