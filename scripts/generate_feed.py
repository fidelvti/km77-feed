#!/usr/bin/env python3
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urljoin
from xml.sax.saxutils import escape

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.km77.com"
PAGE_URLS = [f"{BASE_URL}/", f"{BASE_URL}/page/2"]
FEED_TITLE = "km77 - Portada (noticias y novedades)"
FEED_LINK = f"{BASE_URL}/"
FEED_DESCRIPTION = (
    "Feed no oficial generado a partir de la portada de km77.com: "
    "noticias, pruebas y novedades de modelos"
)
FEED_SELF_URL = "https://fidelvti.github.io/km77-feed/feed.xml?v=5"
HUB_URL = "https://pubsubhubbub.appspot.com/"
OUTPUT_PATH = Path("docs/feed.xml")
MAX_ITEMS = 40
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


def fetch_html(url):
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    resp.raise_for_status()
    return resp.text


def parse_relative_date(text, now):
    text = text.strip().lower()
    m = re.match(r"hace (\d+) minuto", text)
    if m:
        return now - timedelta(minutes=int(m.group(1)))
    m = re.match(r"hace (\d+) hora", text)
    if m:
        return now - timedelta(hours=int(m.group(1)))
    m = re.match(r"hace (\d+) d[ií]a", text)
    if m:
        return now - timedelta(days=int(m.group(1)))
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        day, month, year = (int(x) for x in m.groups())
        return datetime(year, month, day, 12, 0, tzinfo=timezone.utc)
    return now


def parse_items(html, now):
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for li in soup.select("li.js-relocation-destination"):
        content_a = li.find("a", class_="order-3") or li.find("a", href=True)
        if content_a is None:
            continue
        href = content_a.get("href")
        title_tag = content_a.find("h2")
        title = title_tag.get_text(strip=True) if title_tag else None
        if not href or not title:
            continue
        date_tag = content_a.find("p", class_="publish-date")
        date_text = date_tag.get_text(strip=True) if date_tag else ""
        summary_tag = content_a.find("p", class_="summary")
        summary = summary_tag.get_text(strip=True) if summary_tag else ""
        items.append(
            {
                "title": title,
                "link": urljoin(BASE_URL, href),
                "description": summary,
                "pub_date": parse_relative_date(date_text, now),
            }
        )
    return items


def fetch_all_items():
    now = datetime.now(timezone.utc)
    seen = set()
    items = []
    for url in PAGE_URLS:
        html = fetch_html(url)
        for item in parse_items(html, now):
            if item["link"] in seen:
                continue
            seen.add(item["link"])
            items.append(item)
    items.sort(key=lambda i: i["pub_date"], reverse=True)
    return items[:MAX_ITEMS]


def build_rss(items):
    entries = []
    for item in items:
        entries.append(
            f"""
    <item>
      <title>{escape(item['title'])}</title>
      <link>{escape(item['link'])}</link>
      <guid isPermaLink="true">{escape(item['link'])}</guid>
      <pubDate>{format_datetime(item['pub_date'])}</pubDate>
      <description>{escape(item['description'])}</description>
    </item>"""
        )

    now = format_datetime(datetime.now(timezone.utc))
    entries_xml = "".join(entries)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{escape(FEED_TITLE)}</title>
    <link>{escape(FEED_LINK)}</link>
    <description>{escape(FEED_DESCRIPTION)}</description>
    <language>es-ES</language>
    <lastBuildDate>{now}</lastBuildDate>
    <atom:link rel="self" type="application/rss+xml" href="{escape(FEED_SELF_URL)}" />
    <atom:link rel="hub" href="{escape(HUB_URL)}" />{entries_xml}
  </channel>
</rss>
"""


def ping_hub():
    try:
        resp = requests.post(
            HUB_URL,
            data={"hub.mode": "publish", "hub.url": FEED_SELF_URL},
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        print(f"Pinged hub {HUB_URL}: HTTP {resp.status_code}")
    except requests.RequestException as exc:
        print(f"Hub ping failed (non-fatal): {exc}")


def main():
    if "--ping-only" in sys.argv:
        ping_hub()
        return

    items = fetch_all_items()
    if not items:
        raise SystemExit("No items parsed, aborting to avoid overwriting feed with empty content")

    rss = build_rss(items)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(rss, encoding="utf-8")
    print(f"Wrote {len(items)} items to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
