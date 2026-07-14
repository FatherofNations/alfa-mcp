# proto-forge

MCP-сервер для скоростной разработки интерактивных прототипов по
Figma-макетам. Конденсат опыта реальных проектов (пиксель-перфект
дашборды Альфа-Бизнеса): база знаний, скаффолд проекта, пайплайн ассетов,
канон анимаций, чек-листы.

Работает **в паре** с официальным Figma MCP: данные макета — оттуда,
экспертиза и автоматизация — отсюда. proto-forge не проксирует Figma MCP
(кроме batch-экспорта ассетов через Figma REST), не трогает git и не
деплоит — это решения агента/человека.

## Подключение

```bash
git clone https://github.com/FatherofNations/proto-forge.git
cd proto-forge && npm install && npm run build
```

Claude Code (`.mcp.json` проекта или `claude mcp add`):

```json
{
  "mcpServers": {
    "proto-forge": {
      "command": "node",
      "args": ["/path/to/proto-forge/dist/server.js"],
      "env": { "FIGMA_TOKEN": "figd_… (опционально, для import_figma_assets)" }
    }
  }
}
```

Cursor/Windsurf — аналогично (stdio). `FIGMA_TOKEN` нужен только тулу
`import_figma_assets` (Figma REST); остальное работает без токенов.
`PROTO_TEMPLATE_DIR` — переопределение пути к шаблону (форк под другую
дизайн-систему).

## Что внутри

### Resources — база знаний (`proto://knowledge/*`)

Оглавление: `proto://knowledge/index`. Документы: figma-import,
pixel-perfect, **animation-canon** (12 рецептов с выверенными кривыми),
react-patterns, project-structure, tools-panel, deep-links, deploy-vercel,
verification, design-system. Агент читает нужный гайд ПЕРЕД задачей.

### Tools

| Тул | Что делает |
|---|---|
| `scaffold_project` | новый проект из шаблона: Next.js 15, панель tools, канон-анимации, deep-links, verify, CI |
| `import_figma_assets` | batch-экспорт через Figma REST: проверка пустых экспортов, flood-fill чистка фонов, rounded-маски, lossless WebP |
| `sanitize_svg` | чистка SVG: `var(--fill-0,…)` → цвет, фоновые path, предупреждения для CSS-масок |
| `install_fonts` | woff2 из core-ds → `public/fonts` + `styles/fonts.css` + preload в layout |
| `extract_tokens` | выдача `get_variable_defs` → `styles/tokens.css` (kebab-case переменные) |
| `add_animation` | канон-рецепт под конкретный селектор (9 рецептов) |
| `register_dashboard` | новый дашборд: роут + заготовка + карточка в панели |
| `get_checklist` | чек-лист стадии: import / layout / animation / qa / deploy |

### Prompts

`new-dashboard`, `new-widget`, `port-animation`, `parity-qa`, `ship` —
готовые сценарии с правильным порядком шагов.

### Шаблон (`template/`)

Обобщённый стартер прототипа: панель tools с рамкой-обрезкой и свопом
дашбордов через диссолв, `canon.css` (весь канон utility-классами),
deep-links, mobile-gate, опциональный neuro-модуль (умная строка + чат),
`scripts/verify.mjs` (parity-QA), `scripts/extract.py` (byte-perfect
партиалы), CI, `vercel.json`.

## Типовой цикл

```
scaffold_project → install_fonts → get_variable_defs → extract_tokens
→ (чтение figma-import + pixel-perfect) → разбор фрейма по под-узлам
→ import_figma_assets → вёрстка → add_animation → npm run verify
→ get_checklist(qa) → деплой по deploy-vercel.md
```

## Разработка

```bash
npm install
npm run build     # tsc → dist/
npm test          # build + smoke-тест (JSON-RPC по stdio, 40 проверок)
npm run dev       # tsx src/server.ts
```

Структура: `src/server.ts` (stdio), `src/tools/*` (по файлу на тул),
`knowledge/*.md` (resources), `template/` (шаблон, версионируется вместе
с сервером).

## Роадмап

- v2: Streamable HTTP + auth для командного хостинга; версионирование
  базы знаний; библиотека готовых блоков (сайдбар-стек, лента операций)
  как параметризуемые генераторы.

Полная спецификация: `docs/mcp-spec.md` в проекте nefor-dash.
