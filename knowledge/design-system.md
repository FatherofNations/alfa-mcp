# design-system — работа с core-ds (дизайн-система Альфы)

## React-компоненты (next-стек)

Публичная библиотека [core-ds/core-components](https://github.com/core-ds/core-components):
`npm i @alfalab/core-components` (umbrella, v50+) или точечные пакеты
(`@alfalab/core-components-button` и т.д.). Витрина:
https://alfabank.github.io/core-components.

Использовать для **стандартных контролов** (кнопки, инпуты, свитчи,
селекты, модалки) — стабильнее ручной вёрстки: состояния, a11y и края
уже сделаны. Уникальные виджеты макета верстать кастомным CSS — против
конкретного макета он точнее (версия компонента может отличаться от
макета дизайнера). Подробнее о выборе — alfa://knowledge/stack-choice.

## Шрифты

Источник: `github.com/core-ds/core-components`, путь
`.storybook/public/fonts/*.woff2`. Нужные семейства:

- **Alfa Interface Sans** — regular (400), medium (500), bold (700) —
  основной интерфейсный шрифт;
- **Styrene UI** — bold (700) — акцентные кнопки/плашки (ближайший
  доступный аналог Styrene A LC).

Шрифты ставятся автоматически при `scaffold_project` (woff2 с
raw.githubusercontent → `public/fonts/` + `styles/fonts.css` + preload).
Тул `install_fonts` — для до-установки весов/семейств в существующий проект.

### Подключение — @font-face, НЕ next/font/local

```css
@font-face {
  font-family: 'Alfa Interface Sans';
  src: url('/fonts/alfa-interface-sans_regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Причина: глобальный CSS (перенесённый из макета вербатим) ссылается на
имя семейства **литералом** — `next/font/local` хеширует имя семейства,
и весь вербатим-CSS перестаёт находить шрифт.

### Preload против FOUT

В `app/layout.tsx`:

```tsx
import { preload } from "react-dom";
const FONTS = ["/fonts/alfa-interface-sans_regular.woff2", /* … */];
for (const f of FONTS) {
  preload(f, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}
```

`crossOrigin` обязателен: шрифты грузятся в CORS-режиме даже same-origin —
без него preload дублирует загрузку.

## Иконки

Пакет `core-ds/icons` — SVG. Использование как **CSS-маска** (перекраска
через background-color):

```css
.icon-back {
  width: 24px; height: 24px;
  background: currentColor;
  mask: url('/assets/icons/arrow-back-m.svg') center / contain no-repeat;
}
```

**Грабля**: из экспортов вычищать запечённый `fill-opacity` — при
использовании в маске он даёт двойную полупрозрачность (иконка бледнее
макета). Тул `sanitize_svg` предупреждает о таких файлах.

### SVG или PNG: когда растеризовать

Не всякую иконку держать как SVG. Флаги/валюты/мультицветные иллюстрации
в `<img>` часто встают **криво** (нецелый `transform`/`viewBox`, обрезка
маской) или мылят при масштабе. Условия:

- **Монохромная иконка** (один цвет, простые path) → **оставляй SVG**:
  перекраска CSS-маской, чёткость на любом DPI.
- **Флаг / валюта / мультицвет / градиент / встроенный растр** →
  **растеризуй в PNG @2×**. `process_assets` делает это по списку
  `rasterize: ["flag-usd", "cur-eur", …]` (имена без расширения), а SVG со
  встроенным `<image>` конвертит **автоматически**. var() резолвятся до
  растеризации (librsvg их не понимает), цвета не «чернеют».

### Выравнивание иконок валют/флагов (частая грабля)

«Криво встали» — почти всегда контейнер, а не файл:

- контейнер **квадратный** и фиксированный: `width:20px; height:20px`
  (или сколько в макете), не только один из размеров;
- `<img>` внутри — `display:block; width:100%; height:100%;
  object-fit:contain` (или `cover` для флага-кружка), иначе неквадратный
  экспорт растянется;
- флаг-кружок обрезать маской контейнера, а не надеяться на клип внутри
  svg: `border-radius:50%; overflow:hidden` на обёртке;
- если и после растеризации край «съезжает» — экспортировать узел в Figma
  **с квадратным bounding box** (обернуть во фрейм 1:1) и перевыгрузить.

## Шрифты контента ≠ шрифты хрома

В макетах контентные области могут быть набраны другим шрифтом, чем
интерфейсный хром (реальный случай: контент — SF Pro = `-apple-system`,
хром — Alfa Interface Sans). **Проверять `font_family` в design context
каждой зоны, не предполагать.**

```css
:root {
  --font: 'Alfa Interface Sans', -apple-system, 'SF Pro Text', system-ui, sans-serif;
  /* контентная зона может переопределять: font-family: -apple-system, … */
}
```

## Токены

`get_variable_defs` по корневому узлу макета → `extract_tokens` →
`styles/tokens.css` с CSS-переменными в `:root`. Имена Figma
конвертируются в kebab-case (`text/primary` → `--text-primary`).
Letter-spacing в макетах Альфы задан per-размер (`--ls-16-regular` и т.п.)
— переносить как токены, не округлять.

## Лицензия

Шрифты не вшиваются в пакет alfa-mcp — качаются из публичного
репозитория core-ds в момент скаффолда. Прототипы — внутренние.
