#!/usr/bin/env python3
"""Экстрактор byte-perfect партиалов из статического HTML.

Путь миграции «статика → Next.js» (см. alfa://knowledge/react-patterns):
крупная разметка переносится байт-в-байт в htmlPartials.ts и инжектится
через dangerouslySetInnerHTML — НЕ переписывается вручную в JSX.

Использование:
    python3 scripts/extract.py index.html sidebar=aside.sidebar content=div#content

Каждый аргумент name=selector: selector — тег с опц. #id или .class
(первое вхождение). Блок вырезается текстуально (без парсер-нормализации,
это и даёт byte-perfect), пути ассетов нормализуются к /assets|/fonts.
Результат: components/dashboard/htmlPartials.ts
"""

import re
import sys
from pathlib import Path


def find_block(html: str, tag: str, attr_pat: str) -> str:
    """Найти открывающий тег по паттерну и вырезать блок, балансируя
    вложенные <tag>. Текстуально: исходные байты не трогаем."""
    open_re = re.compile(rf"<{tag}\b[^>]*{attr_pat}[^>]*>", re.S)
    m = open_re.search(html)
    if not m:
        raise SystemExit(f"не найден <{tag} …{attr_pat}…>")
    start = m.start()
    depth = 0
    tok = re.compile(rf"<{tag}\b[^>]*?(/?)>|</{tag}\s*>", re.S)
    for t in tok.finditer(html, start):
        if t.group(0).startswith(f"</{tag}"):
            depth -= 1
        elif not t.group(1):  # не self-closing
            depth += 1
        if depth == 0:
            return html[start : t.end()]
    raise SystemExit(f"незакрытый <{tag}> (начат на байте {start})")


def selector_to_pat(sel: str):
    m = re.match(r"^([a-zA-Z][\w-]*)(?:#([\w-]+)|\.([\w-]+))?$", sel)
    if not m:
        raise SystemExit(f"плохой селектор: {sel} (формат: tag, tag#id, tag.class)")
    tag, id_, cls = m.groups()
    if id_:
        return tag, rf'id="{id_}"'
    if cls:
        return tag, rf'class="[^"]*\b{cls}\b[^"]*"'
    return tag, ""


def normalize_assets(s: str) -> str:
    # ../assets|assets → /assets; то же для fonts (пути от корня public/)
    s = re.sub(r'(src|href|url\()=?"(?:\.\./)*(assets|fonts)/', r'\1="/\2/', s)
    s = re.sub(r"url\((?:'|\")?(?:\.\./)*(assets|fonts)/", r"url(/\1/", s)
    return s


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1]).read_text(encoding="utf-8")
    parts = {}
    for arg in sys.argv[2:]:
        name, sel = arg.split("=", 1)
        tag, pat = selector_to_pat(sel)
        parts[name] = normalize_assets(find_block(src, tag, pat))

    out = Path("components/dashboard/htmlPartials.ts")
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "/* АВТОГЕН scripts/extract.py — byte-perfect партиалы исходной статики.",
        "   Не форматировать и не «чинить» руками: правки — в исходном HTML",
        "   с перегенерацией, либо точечно здесь (см. react-patterns). */",
        "",
    ]
    for name, blob in parts.items():
        lines.append(f"export const {name} = {blob!r};")
        lines.append("")
    out.write_text("\n".join(lines), encoding="utf-8")
    sizes = ", ".join(f"{k}: {len(v)}b" for k, v in parts.items())
    print(f"OK → {out} ({sizes})")


if __name__ == "__main__":
    main()
