# alfa-mcp

MCP-сервер для скоростной разработки интерактивных прототипов по
Figma-макетам. Конденсат опыта реальных проектов (пиксель-перфект
дашборды Альфа-Бизнеса): база знаний, скаффолд проекта, быстрый пайплайн
ассетов, канон анимаций, чек-листы.

Работает **в паре** с официальным Figma MCP: данные и ассеты макета —
оттуда (`get_design_context` / `get_variable_defs` / `download_assets`),
обработка и экспертиза — отсюда. **Figma-токены не нужны.** alfa-mcp
не трогает git и не деплоит — это решения агента/человека.

## Подключение (Claude Code)

Командный сервер уже развёрнут (HTTPS через Traefik) и открыт — подключение
просто по URL, без токена:

```bash
claude mcp add --transport http alfa-mcp https://alfa-mcp.leggit.ru/mcp
```

Или в настройках claude.ai → Connectors: добавить URL `https://alfa-mcp.leggit.ru/mcp`.

Аутентификацию можно включить: задать `PROTO_AUTH_TOKEN` в
`/root/alfa-mcp/.env` и `docker compose up -d` — тогда нужен заголовок
`Authorization: Bearer <токен>`.

Альтернатива — локально по stdio (файловые тулы тогда пишут напрямую
в проект):

```bash
git clone https://github.com/FatherofNations/alfa-mcp.git
cd alfa-mcp && npm install && npm run build
claude mcp add alfa-mcp -- node /path/to/alfa-mcp/dist/server.js
```

## Что внутри

### Resources — база знаний (`alfa://knowledge/*`)

Оглавление: `alfa://knowledge/index`. Документы: stack-choice,
figma-import (включая «Быстрый пайплайн ассетов»), **table-import**,
pixel-perfect, **animation-canon** (12 рецептов с выверенными кривыми),
react-patterns, project-structure, tools-panel, deep-links,
deploy-vercel, verification, design-system. Агент читает нужный гайд
ПЕРЕД задачей.

**Каноны читаются тулом `read_knowledge`**: MCP-ресурсы поддерживают не
все клиенты, и на практике агент оставался вообще без базы знаний.
Ресурсы никуда не делись — там, где они работают, они удобнее.

### Tools

| Тул | Что делает |
|---|---|
| `read_knowledge` | база знаний текстом; без аргументов — оглавление. Основной способ читать каноны |
| `digest_design_context` | сжимает выдачу Figma MCP, не влезшую в лимит, до 1–3%: `layout` (дерево со схлопнутыми повторами), `rows` (таблица: подложка строк + геометрия ячеек + матрица текстов), `text` (типографика по стилям), `assets` (именованные ассеты + curl) |
| `parity_check` | попиксельная сверка рендера с эталоном Figma: метрики, карта горячих блоков, смещения текстовых ранов — находит то, что не видно глазом |
| `scaffold_project` | новый проект: Next.js 15, канон-анимации, шрифты core-ds сразу, verify, CI. Достаточно `name`. Панель tools — только по явной просьбе |
| `process_assets` | пост-процессинг ВСЕЙ папки ассетов после `download_assets` (Figma MCP): SVG-санитайзер, детект пустых экспортов, flood-fill чистка фонов, lossless WebP |
| `sanitize_svg` | точечная чистка SVG (для папки — process_assets) |
| `extract_tokens` | выдача `get_variable_defs` → `styles/tokens.css` (kebab-case переменные) |
| `add_animation` | канон-рецепт под конкретный селектор (9 рецептов) |
| `register_dashboard` | новый дашборд: роут + заготовка (+ карточка панели, если панель есть) |
| `install_fonts` | до-установка шрифтов (скаффолд ставит их сам) |
| `get_checklist` | чек-лист стадии: import / layout / animation / qa / deploy |

### Prompts

`new-dashboard`, `new-widget`, `port-animation`, `parity-qa`, `ship` —
готовые сценарии с правильным порядком шагов.

### Шаблон (`template/`)

Стартер прототипа: канон-анимации (`canon.css` utility-классами),
mobile-gate, `scripts/verify.mjs` (parity-QA), `scripts/extract.py`
(byte-perfect партиалы), CI, `vercel.json`. Опционально (по явной
просьбе): панель tools с рамкой-обрезкой, свопом дашбордов через диссолв
и deep-links; свитчи в свежей панели — заглушки «Параметр 1/2».

## Типовой цикл

```
read_knowledge() → scaffold_project (шрифты уже внутри) → get_variable_defs
→ extract_tokens → разбор фрейма по под-узлам (большие выдачи —
digest_design_context) → ОДИН батч download_assets → process_assets
→ вёрстка + parity_check ПОСЛЕ КАЖДОЙ секции → add_animation
→ npm run verify <url> → get_checklist(qa) → деплой по deploy-vercel.md
```

`parity_check` после каждой секции, а не один раз в конце: ошибка в общем
правиле (размер шрифта, выравнивание ячейки) размножается по всей
странице, и чем позже её ловишь, тем дороже.

## Хостинг (HTTP-режим)

```bash
docker compose up -d --build     # PROTO_AUTH_TOKEN в .env
```

`docker-compose.yml` подключает контейнер к внешней сети Traefik `proxy`
и вешает роутер на `alfa-mcp.leggit.ru` (HTTP→HTTPS редирект, TLS через
Let's Encrypt resolver `myresolver`). Host-порт наружу не публикуется —
только через Traefik. За обратным прокси включён `trust proxy`, чтобы
`/dl` и `/process` генерили `https://`-ссылки.

Аутентификация опциональна: `PROTO_AUTH_TOKEN` пустой (default) →
сервер открыт, `/process` без суффикса; непустой → Bearer на `/mcp` +
неугадываемый суффикс `/process-<hash>`.

Эндпоинты: `POST /mcp` (Streamable HTTP, stateless), `GET /dl/…`
(тарбол скаффолда, TTL 30 мин), `POST /process…` (round-trip обработка
ассетов), `POST /digest…` (сжатие выдачи Figma MCP, текст → текст),
`POST /parity…` (бленд-дифф двух PNG, tar.gz → текст), `GET /healthz`.
В HTTP-режиме файловые тулы отдают готовые curl-команды/контент — агент
применяет их локально одной операцией.

При включённом `PROTO_AUTH_TOKEN` все три round-trip эндпоинта получают
тот же неугадываемый суффикс `-<hash>`, что и `/process`.

## Разработка

```bash
npm install
npm test          # build + smoke stdio (JSON-RPC) + smoke http
npm run dev       # tsx src/server.ts (stdio)
PROTO_HTTP_PORT=8811 npm run dev   # http-режим локально
```

## Роадмап

- Версионирование базы знаний (знания пополняются с каждого проекта).
- Библиотека готовых блоков (сайдбар-стек, лента операций) как
  параметризуемые генераторы.

Полная спецификация: `docs/mcp-spec.md` в проекте nefor-dash.
