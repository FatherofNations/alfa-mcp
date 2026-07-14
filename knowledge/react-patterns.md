# react-patterns — перенос статики в Next.js

> Проверенная архитектура миграции «статический прототип → Next.js 15 /
> React 19» с сохранением пиксель-перфекта и анимаций 1:1.

## Архитектура миграции

**Разметка**: byte-perfect HTML через `dangerouslySetInnerHTML` из
автогенерённого `htmlPartials.ts`. Экстрактор (`scripts/extract.py` в
шаблоне) вырезает блоки из исходных HTML и нормализует пути ассетов
(`../assets | assets → /assets`).

**Поведение**: типизированные хуки, которые опрашивают DOM
(`document.querySelector`) в `useEffect` — прямой порт vanilla-скриптов:

```tsx
export function usePageBehavior() {
  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>(".hero-cta");
    if (!btn) return;
    const onClick = () => { /* … */ };
    btn.addEventListener("click", onClick);
    const t = window.setTimeout(reveal, 300);
    return () => {                    // ПОЛНЫЙ cleanup — обязательный
      btn.removeEventListener("click", onClick);
      window.clearTimeout(t);
    };
  }, []);
}
```

## StrictMode: эффекты гоняются дважды (dev)

React 19 StrictMode прогоняет mount-эффекты **два раза**. Следствия:

- каждый эффект обязан снимать ВСЁ: слушатели, `clearTimeout/Interval`,
  `cancelAnimationFrame`;
- данные, читаемые из DOM при маунте, — **захардкодить в код** (второй
  прогон читает уже очищенный/изменённый DOM и получает мусор).

## React.memo на компонентах с dangerouslySetInnerHTML — обязателен

Без memo апдейт любого контекста выше по дереву перерисовывает компонент,
`dangerouslySetInnerHTML` **пере-инжектит статику** и стирает все стили,
выставленные JS-ом (top-координаты стеков, инлайн-ширины):

```tsx
const MainV1 = memo(function MainV1() {
  return <div dangerouslySetInnerHTML={{ __html: partials.sidebar }} />;
});
```

## Оверлеи и transform/filter

- fixed-модалки (панель, spotlight, чат) держать **вне трансформируемого
  контента**: `transform`/`filter` на предке делает его containing block
  для fixed-потомков — модалка начинает позиционироваться от предка.
- Обёртки без своей геометрии — `display: contents`. НО: на
  `display:contents` не работают `filter/opacity/transform` — анимируемая
  обёртка должна быть реальным боксом `position:fixed; inset:0`.
- `filter` на предке безопасен только если предок сам `fixed inset:0`
  (его геометрия совпадает с вьюпортом → fixed-потомки не съезжают).
  Именно поэтому `.board-body` в шаблоне — `fixed inset:0`.

## Поэтапный уход от партиалов

Партиалы — техника миграции, не конечная цель. Перевод в JSX по одному:

1. Переписать партиал в JSX.
2. **Доказать паритет**: сравнить нормализованный `outerHTML`
   (длина + хеш) до и после — в браузере, не глазами.
3. Удалить мёртвый экспорт из `htmlPartials.ts`.

```js
// в консоли браузера: нормализованный отпечаток узла
const norm = (el) => el.outerHTML.replace(/\s+/g, " ");
const s = norm(document.querySelector(".sidebar"));
console.log(s.length, await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
```

## Грабли dev-окружения

- **НЕ запускать `next build` при живом `next dev`** — общий `.next`
  ломается (`Cannot find module './NNN.js'`). Лечение: остановить dev,
  `rm -rf .next`, рестарт.
- **Fast Refresh не переживает смену числа хуков** «на горячую» — после
  рефакторинга хука полный рестарт dev-сервера.
- Данные — в `data/*`, не в разметке: правка демо-цифр не должна трогать
  byte-perfect партиалы.
