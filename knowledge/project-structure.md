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
    tools/
      ToolsProvider.tsx   # контекст прототипа: dashboard, panelOpen, swapTo,
                          # deep-links, body-классы
      ToolsPanel.tsx      # панель: карточки дашбордов, секции параметров
    neuro/                # (опция neuroBar) умная строка + чат
    BodyClass.tsx         # класс на <body> на время жизни роута
  lib/
    dashboards.ts         # РЕЕСТР дашбордов (правится register_dashboard)
    usePageBehavior.ts    # заготовка хука поведения страницы
  styles/
    tokens.css            # CSS-переменные из Figma (extract_tokens)
    fonts.css             # @font-face (install_fonts)
    canon.css             # анимационный канон utility-классами
    tools.css             # панель, .board/.board-body, рамка, диссолв
    mobile-gate.css       # заглушка <1024px
    app.css               # стили страниц проекта (сюда верстается макет)
  data/                   # демо-данные ОТДЕЛЬНО от вёрстки
  public/
    assets/figma/         # ассеты из Figma (import_figma_assets)
    fonts/                # woff2 (install_fonts)
  scripts/
    extract.py            # экстрактор byte-perfect партиалов (путь миграции)
    verify.mjs            # parity-QA: роуты, битые img, консоль
  .github/workflows/ci.yml# lint + tsc + build
  vercel.json             # {"framework":"nextjs"} — страховка пресета
  HANDOFF.md              # handoff-документ (заполняется по ходу)
```

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

## Роли файлов панели

- `ToolsProvider` живёт в **root layout** → переживает смену роута.
  Держит состояние прототипа и body-классы. Свои состояния прототипа
  (варианты, тогглы) добавлять сюда.
- `ToolsPanel` — только разметка панели. Динамическая часть ремаунтится
  по `key` → стаггер-проявление по канону.
- `lib/dashboards.ts` — единственный источник списка дашбордов: роуты,
  тайтлы карточек. Его читают и панель, и deep-links.
