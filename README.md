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
https://fidelvti.github.io/km77-feed/feed.xml
```

## Por qué no corre en GitHub Actions

km77.com está detrás de Cloudflare, cuyo desafío anti-bot devuelve 403 a cualquier
petición que llegue desde las IPs de los runners de GitHub-hosted Actions (todo el
dominio, no solo la API). Por eso la generación del feed corre en local (este Mac, con
IP residencial) mediante un `launchd` agent, y solo el resultado (`docs/feed.xml`) se
sube a GitHub. GitHub Pages sirve ese archivo desde la carpeta `docs/` de la rama `main`.

## Cómo funciona

- `scripts/generate_feed.py`: descarga la portada (`/` y `/page/2`), extrae cada tarjeta
  (`li.js-relocation-destination`) con título, enlace, resumen y fecha relativa ("hace X
  horas/días"), y genera `docs/feed.xml`.
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
- Al ser scraping de HTML (no una API estable), si km77.com cambia las clases CSS de su
  plantilla el parser puede romperse o dejar de encontrar tarjetas; revisa los logs en
  `~/Library/Logs/km77-feed.log`.
- Las fechas de los artículos son aproximadas: se derivan de texto relativo ("hace X
  horas/días") tal y como lo muestra la web, no de una marca de tiempo exacta.

## Si un lector RSS muestra contenido desactualizado (p. ej. Feedly)

Servicios como Feedly no leen tu XML en directo cada vez que refrescas la app: mantienen
una caché propia por URL de feed, compartida entre todos sus usuarios, que rastrean en su
propio ciclo (a veces horas). Si cambias significativamente el contenido del feed (como
pasó al cambiar de la API de WordPress a hacer scraping de la portada) y el lector se
quedó con una versión vieja, quitar y volver a añadir la misma URL no sirve — te
re-vincula a la misma caché desactualizada.

Solución: añade un parámetro cualquiera a la URL para que el lector la trate como una
fuente nueva y la rastree desde cero, por ejemplo:

```
https://fidelvti.github.io/km77-feed/feed.xml?v=2
```

(Puedes comprobar antes qué tiene cacheado Feedly para una URL, sin necesidad de cuenta,
con `https://cloud.feedly.com/v3/streams/contents?streamId=feed%2F<URL-codificada>`.)




## Para forzar un rastreo nuevo (cuando cambies el feed o notes que Feedly no se entera):

Añade un parámetro nuevo a la URL, por ejemplo cambia ?v=3 por ?v=4 (solo incrementa el número).
En Feedly: quita la suscripción antigua y añade la nueva URL con ese parámetro.

Como Feedly nunca ha visto esa URL exacta antes, la rastrea desde cero al instante.

Para comprobar qué tiene Feedly cacheado ahora mismo (sin necesidad de cuenta ni login):
Abre esta URL en el navegador, cambiando solo la parte final por tu feed actual:

`https://cloud.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Ffidelvti.github.io%2Fkm77-feed%2Ffeed.xml%3Fv%3D3&count=5`

Si el ?v= de tu URL cambia, tienes que codificar esa parte también: ? → %3F, = → %3D. Si te resulta confuso, dímelo y te lo compruebo yo en el momento — pero para el "cambiar a v=4 y re-suscribirte" no hace falta nada mío.






## Reinicio del proceso

Estos son los comandos, en orden, para reiniciar el proceso:

1. Ver las últimas ejecuciones y detectar cuál falló:

```
gh run list --repo fidelvti/km77-feed --limit 5
```

Busca la que diga failure y copia su ID (la columna numérica larga).

2. Relanzarla:

```
gh run rerun <RUN_ID> --repo fidelvti/km77-feed
```

3. (Opcional) Verla en directo hasta que termine:

```
gh run watch <RUN_ID> --repo fidelvti/km77-feed --exit-status
```

Por ejemplo, con el caso de hoy habría sido:

```
gh run rerun 32052847874 --repo fidelvti/km77-feed
```

Necesitas tener gh autenticado (ya lo está en tu Mac) y ejecutarlo desde cualquier carpeta, no hace falta estar dentro del repo ya que uso --repo explícito.
