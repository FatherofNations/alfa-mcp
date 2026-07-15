# project-structure — структура проекта-прототипа

> Что где лежит в проекте, созданном `scaffold_project`, и правила слоёв.

## Дерево

```
<project>/
  app/
    layout.tsx            # <html>/<body>, глобальные CSS, preload шрифтов,
                          # ToolsProvider, mobile-gate
    page.tsx              # первый дашборд (роут /)
    <dashboard>/page.tsx  # остальные дашборды — по роуту на каждый
    robots.ts             # noindex: прототипы не индексируем
    icon.svg              # фавикон-плейсхолдер
  components/
    chrome/
      AppChrome.tsx       # БАЗОВЫЙ ХРОМ (default on): сайдбар 248 + шапка 56,
                          # 1:1 из проверенного дашборда; меню — medium.
                          # Пункты меню/данные шапки правь прямо здесь
    tools/                # (опция toolsPanel — ТОЛЬКО по явной просьбе)
      ToolsProvider.tsx   # контекст прототипа: dashboard, panelOpen, swapTo,
                          # deep-links, body-классы
      ToolsPanel.tsx      # панель: карточки дашбордов, секции параметров
    BodyClass.tsx         # класс на <body> на время жизни роута
  lib/
    dashboards.ts         # (при toolsPanel) РЕЕСТР дашбордов для панели
    usePageBehavior.ts    # заготовка хука поведения страницы
  styles/
    tokens.css            # CSS-переменные из Figma (extract_tokens)
    fonts.css             # @font-face (ставится при скаффолде)
    canon.css             # анимационный канон utility-классами
    chrome.css            # (при chrome) сайдбар/шапка + .chrome-main
    tools.css             # (при toolsPanel) панель, .board, рамка, диссолв
    mobile-gate.css       # заглушка <1024px
    app.css               # стили страниц проекта (сюда верстается макет)
  data/                   # демо-данные ОТДЕЛЬНО от вёрстки
  public/
    assets/chrome/        # ассеты хрома (лого, иконки меню/шапки)
    assets/figma/         # ассеты макета: download_assets → process_assets
    fonts/                # woff2 (ставятся при скаффолде)
  scripts/
    extract.py            # экстрактор byte-perfect партиалов (путь миграции)
    verify.mjs            # parity-QA: роуты, битые img, консоль
  .github/workflows/ci.yml# lint + tsc + build
  vercel.json             # {"framework":"nextjs"} — страховка пресета
  HANDOFF.md              # handoff-документ (заполняется по ходу)
```

## Базовый хром (default on)

Каждая страница получает готовые **боковое меню (248, fixed слева)** и
**шапку (56, fixed сверху)** — перенесены 1:1 из проверенного дашборда,
их не нужно разрабатывать заново. Контент страницы кладётся в
`<main class="page chrome-main">` — отступы под хром даёт `chrome.css`.
Пункты меню и данные шапки правятся прямо в `AppChrome.tsx` (next) или в
html-страницах (static). Отключение: `scaffold_project` c
`features.chrome: false`.

## Правила слоёв

- **Глобальный CSS, без UI-библиотек.** Никаких tailwind/styled — вёрстка
  переносится из макета как есть, классы читаются в devtools 1:1.
- **Ассеты** — только `public/assets/figma`, пути в коде от корня
  (`/assets/figma/...`), `<img>` с явными width/height из макета.
- **Данные** (цифры, списки операций, лейблы) — в `data/*.ts`. Вёрстка
  и данные не смешиваются: смену демо-контента делает правка данных.
- **Один дашборд = роут + карточка панели.** Новый дашборд добавляется
  тулом `register_dashboard` (роут + реестр + карточка).
- **Оверлеи** (панель, модалки) — сиблинги `.board`, не потомки
  трансформируемого контента (см. react-patterns).
- Импорты CSS — только в `app/layout.tsx`, порядок: tokens → fonts →
  canon → app → tools → mobile-gate.

## Роли файлов панели (если панель включена)

Панель tools скаффолдится **только по явной просьбе пользователя**
(`features.toolsPanel: true`). Без неё layout рендерит `<main>{children}</main>`,
роуты дашбордов доступны по URL напрямую.

- `ToolsProvider` живёт в **root layout** → переживает смену роута.
  Держит состояние прототипа и body-классы. Свои состояния прототипа
  (варианты, тогглы — вместо заглушек «Параметр 1/2») добавлять сюда.
- `ToolsPanel` — только разметка панели. Динамическая часть ремаунтится
  по `key` → стаггер-проявление по канону.
- `lib/dashboards.ts` — единственный источник списка дашбордов: роуты,
  тайтлы карточек. Его читают и панель, и deep-links.
