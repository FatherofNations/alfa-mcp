#!/usr/bin/env python3
"""Dev-сервер статики: python3 scripts/serve.py [порт] (default 8000).

Запускать из КОРНЯ проекта. Обязательно смотреть по http://localhost, не по
file:// — по file:// часть <img> стабильно не дорисовывается к скриншоту
(см. proto://knowledge/pixel-perfect). Кеш выключен: правка CSS видна по F5.
"""

import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".woff2": "font/woff2",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"http://localhost:{PORT}/ (Ctrl+C — остановить)")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
