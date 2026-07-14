# animation-canon — канон моушена

> Главная ценность базы. Все кривые и тайминги выверены на живых прототипах —
> **переиспользуй эти рецепты, не изобретай новые кривые.** Готовые
> utility-классы лежат в шаблоне (`styles/canon.css`); тул `add_animation`
> генерирует CSS под конкретный селектор.

## Базовые кривые

| Имя | Значение | Где |
|---|---|---|
| Появление (opacity/filter) | `0.5s cubic-bezier(0.25, 0.1, 0.25, 1)` | всё, что проявляется |
| Появление (transform) | `0.55s cubic-bezier(0.32, 0.72, 0, 1)` | подъём при проявлении |
| Скрытие | `0.22s ease-in` | всё, что прячется |
| Структурная | `0.55s cubic-bezier(0.32, 0.72, 0, 1)` | ширины, панели, top-стеки («iOS-ощущение») |
| Сворачивание | `cubic-bezier(0.65, 0, 0.35, 1)` ease-in-out | collapse |

## 1. Появление из блюра (канон)

Скрытое состояние → появление:

```css
.reveal {
  opacity: 0;
  filter: blur(12px);          /* 10–12px */
  transform: translateY(8px);  /* 6–10px */
  transition:
    opacity 0.5s cubic-bezier(0.25, 0.1, 0.25, 1),
    filter 0.5s cubic-bezier(0.25, 0.1, 0.25, 1),
    transform 0.55s cubic-bezier(0.32, 0.72, 0, 1);
}
.reveal.in { opacity: 1; filter: blur(0); transform: translateY(0); }
```

## 2. Скрытие (канон, асимметрия!)

Прячем **быстро**, показываем **медленно** — это осознанная асимметрия:

```css
.reveal.out {
  opacity: 0; filter: blur(12px); transform: translateY(10px);
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
  transition-delay: 0s; /* без задержки! */
}
```

## 3. Стаггер сверху вниз

```css
.stagger > * { transition-delay: calc(120ms + var(--i, 0) * 30ms); }
```

`--i` проставлять на элементах (данные знают индекс) или `nth-child`,
если детей ≤ 12. База задержки 120ms, шаг 30ms.

## 4. Переключение пейнов (табы контента)

Оба пейна absolute в одной точке. Старый — канон скрытия до `opacity:0`;
новый — канон появления со стаггером детей. **Свап состояния — в момент
полной прозрачности** (тогда подмена контента невидима):

```css
.pane { position: absolute; inset: 0; }
.pane.hidden {
  opacity: 0; filter: blur(12px); transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
}
```

```js
// JS: скрыть старый → по таймеру (220–250ms) подменить контент → снять hidden
```

## 5. Своп целых страниц (content-dissolve)

Тот же рецепт пейнов, но на **контент-обёртке страницы**. ФРЕЙМ
(подложка + рамка) не анимируется — растворяется только наполнение.

История итераций (не повторять): равномерный блюр без ухода в 0 и
«вуаль-волна» с mask — **отклонены**, подмена контента видна. Правильно
только через полную прозрачность (`opacity: 0`).

Реализация в шаблоне: `.board` (статичный фрейм) → `.board-body`
(скролл-контейнер, получает `.dash-out` на время свопа). Роут меняется
по таймеру `SWAP_OUT_MS = 250` (0.22s скрытия + кадр запаса).

## 6. Сворачивание/разворачивание

Кривая берётся из состояния-**НАЗНАЧЕНИЯ**, поэтому expand и collapse
разводятся разными кривыми:

```css
.acc          { transition: height 0.55s cubic-bezier(0.32, 0.72, 0, 1); }  /* → развёрнуто */
.acc.collapsed{ transition: height 0.5s cubic-bezier(0.65, 0, 0.35, 1); }   /* → свёрнуто */
```

## 7. Хлопок-морф (пилюля)

Ширина меняется плавно, «живость» добавляет keyframe-scale:

```css
.pill { transition: width 0.55s cubic-bezier(0.5, 0, 0.2, 1); }
.pill.pop { animation: pill-pop 0.55s cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes pill-pop {
  0% { transform: scale(0.97); } 55% { transform: scale(1.05); } 100% { transform: scale(1); }
}
```

**ВАЖНО:** keyframe с `transform` перебивает ВЕСЬ transform элемента —
если на элементе живёт магнит/сдвиг через переменные, обнулить
`--mx/--my` ПЕРЕД запуском анимации, иначе элемент дёрнется.

## 8. Скользящая капсула табов

Абсолютный слой-«капсула» под кнопками; позиция по `getBoundingClientRect`
(суб-пиксельная точность, не `offsetLeft`):

```js
const r = btn.getBoundingClientRect(), p = bar.getBoundingClientRect();
cap.style.left = `${r.left - p.left}px`;
cap.style.width = `${r.width}px`;
```

- перелёт с squish: keyframe `scale(0.9)` на весь полёт;
- **перемер на `document.fonts.ready`** с временным `transition: none`
  (шрифт доехал → ширины кнопок изменились).

## 9. Вертикальный тикер строк

Клип-контейнер, строки absolute; старая уезжает на `translateY(-H)`,
новая приезжает с `+H`; `0.45s cubic-bezier(0.32, 0.72, 0, 1)`.
Ширину контейнера двигать JS-ом по `getBoundingClientRect` новой строки.

## 10. Вращающаяся обводка

```css
@property --angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
.ring::before {
  content: ""; position: absolute; inset: -2px; border-radius: inherit;
  background: conic-gradient(from var(--angle), transparent 10%, #fff 50%, transparent 90%);
  padding: 2px;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: ring-spin 3s linear infinite;
}
/* цикл с «передышкой»: 0→50% — оборот, 50→100% — hold; 360deg ≡ 0deg — петля бесшовна */
@keyframes ring-spin { 0% { --angle: 0deg; } 50% { --angle: 360deg; } 100% { --angle: 360deg; } }
```

## 11. Магнит к курсору

`mousemove` + rAF-троттл; радиус действия ~210px; смещение
`dx * coef * f` с clamp. Писать в CSS-переменные, транслировать одним
transform:

```js
let raf = 0;
window.addEventListener("mousemove", (e) => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), R = 210;
    const f = Math.max(0, 1 - d / R);
    el.style.setProperty("--mx", `${Math.max(-8, Math.min(8, dx * 0.06 * f))}px`);
    el.style.setProperty("--my", `${Math.max(-6, Math.min(6, dy * 0.06 * f))}px`);
  });
});
```

```css
.magnet { transform: translate(var(--mx, 0), var(--my, 0)); }
```

Выключать при `:active` и при открытых оверлеях (магнит под модалкой —
мусорное движение).

## 12. Blur-стриминг текста (появление «как печатает ИИ»)

Блоки и слова:

```css
.rv-block {
  opacity: 0; filter: blur(10px); transform: translateY(8px);
  transition: opacity 0.5s cubic-bezier(0.25,0.1,0.25,1),
              filter 0.5s cubic-bezier(0.25,0.1,0.25,1),
              transform 0.55s cubic-bezier(0.32,0.72,0,1);
}
.rv-word { opacity: 0; filter: blur(6px); transition: opacity 0.35s ease, filter 0.35s ease; }
.rv-block.in, .rv-word.in { opacity: 1; filter: blur(0); transform: none; }
```

**`transform` на inline-элементах не работает** — слова анимировать только
opacity + blur, подъём — на блоке.

## Системные правила

- Блюр-паттерн создаёт `transform`/`filter` → элемент становится
  **контекстом наложения**: z-index выпадашек/дропдаунов ставить на
  контейнер уровня выше, не на сам анимируемый элемент.
- Один элемент — один источник transform. Совмещение (магнит + подъём) —
  через CSS-переменные в едином `transform`.
- Кривые и тайминги — только из этого документа. Новая кривая = осознанное
  решение, зафиксированное здесь же.
