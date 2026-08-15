#!/usr/bin/env python3
import html
import re
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

import requests

API_URL = "https://www.km77.com/revista/wp-json/wp/v2/posts"
FEED_TITLE = "km77 - Revista (noticias y novedades)"
FEED_LINK = "https://www.km77.com/revista/"
FEED_DESCRIPTION = "Feed no oficial generado a partir de la revista de km77.com"
OUTPUT_PATH = Path("public/feed.xml")
PER_PAGE = 30
USER_AGENT = (
    "km77-feed-bot/1.0 (+https://github.com/fidelvti/km77-feed; "
    "personal RSS generator, contact: fidelvti@gmail.com)"
)


def fetch_posts():
    params = {
        "per_page": PER_PAGE,
        "_fields": "id,date_gmt,link,title,excerpt",
    }
    resp = requests.get(
        API_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=20
    )
    resp.raise_for_status()
    return resp.json()


def clean_excerpt(raw_html):
    text = re.sub(r"<[^>]+>", "", raw_html)
    text = html.unescape(text)
    text = text.replace("\xa0", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text


def build_rss(posts):
    items = []
    for post in posts:
        title = html.unescape(post["title"]["rendered"])
        link = post["link"]
        pub_date = datetime.fromisoformat(post["date_gmt"] + "+00:00")
        description = clean_excerpt(post["excerpt"]["rendered"])
        items.append(
            f"""
    <item>
      <title>{escape(title)}</title>
      <link>{escape(link)}</link>
      <guid isPermaLink="true">{escape(link)}</guid>
      <pubDate>{format_datetime(pub_date)}</pubDate>
      <description>{escape(description)}</description>
    </item>"""
        )

    now = format_datetime(datetime.now(timezone.utc))
    items_xml = "".join(items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{escape(FEED_TITLE)}</title>
    <link>{escape(FEED_LINK)}</link>
    <description>{escape(FEED_DESCRIPTION)}</description>
    <language>es-ES</language>
    <lastBuildDate>{now}</lastBuildDate>{items_xml}
  </channel>
</rss>
"""


def main():
    posts = fetch_posts()
    if not posts:
        print(
            "No posts fetched, aborting to avoid overwriting feed with empty content",
            file=sys.stderr,
        )
        sys.exit(1)

    rss = build_rss(posts)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(rss, encoding="utf-8")
    print(f"Wrote {len(posts)} items to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
