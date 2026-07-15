# __PROJECT_TITLE__

Статический прототип (чистый HTML/CSS/JS, без сборки) по Figma-макету.
Создан из шаблона [proto-forge](https://github.com/FatherofNations/proto-forge).

```bash
python3 scripts/serve.py        # http://localhost:8000 (из корня проекта!)
```

Смотреть строго по `http://localhost`, не по `file://` (часть `<img>` не
дорисовывается к скриншоту).

## Структура

- `index.html` (+ `<имя>.html` на каждый дашборд) — по странице на экран
- `styles/` — tokens (из extract_tokens) → fonts → canon (анимационный
  канон, НЕ менять) → app (сюда верстается макет)
- `js/app.js` — поведение, vanilla
- `assets/figma/` — ассеты: `download_assets` (Figma MCP) → `process_assets`
- `fonts/` — woff2 дизайн-системы (ставятся при скаффолде)

## Дальнейшие шаги

1. `get_variable_defs` (Figma MCP) → `extract_tokens` → `styles/tokens.css`
2. Разбор макета: `proto://knowledge/figma-import` + `pixel-perfect`
3. Ассеты: один батч `download_assets` → сразу `process_assets`
4. Анимации — только канон (`canon.css` / `add_animation`)
5. Если прототип разрастётся (состояния, панель tools) — миграция на
   Next.js по `proto://knowledge/react-patterns` (byte-perfect партиалы)

Handoff: [HANDOFF.md](HANDOFF.md).
