# km77-feed

Feed RSS no oficial de la revista de [km77.com](https://www.km77.com/revista/), generado
automáticamente cada 3 horas mediante GitHub Actions y publicado con GitHub Pages.

km77.com no ofrece un feed RSS propio. Este proyecto consulta la API REST pública de su
WordPress (`https://www.km77.com/revista/wp-json/wp/v2/posts`), que expone las últimas
entradas (noticias, pruebas y novedades de modelos) en JSON, y las convierte en un
`feed.xml` en formato RSS 2.0.

## Uso

Añade esta URL a tu lector RSS una vez publicado GitHub Pages:

```
https://<usuario>.github.io/km77-feed/feed.xml
```

## Cómo funciona

- `scripts/generate_feed.py`: pide los últimos posts a la API de WordPress y genera `public/feed.xml`.
- `scripts/write_index.py`: genera una página `public/index.html` mínima con enlace al feed.
- `.github/workflows/update-feed.yml`: ejecuta ambos scripts cada 3 horas (`cron: "0 */3 * * *"`)
  y despliega el contenido de `public/` a GitHub Pages.

## Ejecutar en local

```bash
pip install -r requirements.txt
python scripts/generate_feed.py
python scripts/write_index.py
```

Esto genera `public/feed.xml` y `public/index.html`.

## Notas

- Este feed no es oficial ni está afiliado a km77.com. Solo incluye título, enlace, fecha
  y un resumen breve de cada entrada (no el contenido completo del artículo).
- Si km77.com cambia su API o estructura, el workflow puede empezar a fallar; revisa la
  pestaña Actions del repo.
