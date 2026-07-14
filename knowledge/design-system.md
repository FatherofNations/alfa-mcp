# design-system — работа с core-ds (дизайн-система Альфы)

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

Шрифты не вшиваются в пакет proto-forge — качаются из публичного
репозитория core-ds в момент скаффолда. Прототипы — внутренние.
