# deep-links — состояние прототипа в URL

> Любое состояние, которое показываешь на демо, должно открываться прямой
> ссылкой: `/dash?menu=v2&stack=over,usd`.

## Схема

- **Дашборд — в пути**: `/`, `/current`, `/reports` (клиентская навигация
  через `swapTo`).
- **Параметры — в query**: `?menu=v2&stack=over,usd` (короткие имена,
  списки через запятую).

## Запись: history.replaceState

Состояние живёт в контексте (React state), URL — производная. Писать через
`window.history.replaceState` — Next 15 официально поддерживает это без
навигации и ре-фетча:

```tsx
useEffect(() => {
  if (!urlSynced.current) return;      // не писать до первого чтения
  const url = variant === "v2"
    ? `/?menu=v2&stack=${keys.filter((k) => state[k]).join(",")}`
    : "/";                              // дефолт — чистая ссылка
  if (url !== location.pathname + location.search) {
    window.history.replaceState(null, "", url);
  }
}, [variant, state]);
```

Дефолтное состояние сериализуется в **чистую ссылку** (без query) — ссылки
с демо шарятся людям, мусорные параметры пугают.

## Чтение: один mount-эффект

```tsx
const urlSynced = useRef(false);
useEffect(() => {
  const sp = new URLSearchParams(window.location.search);
  const menu = sp.get("menu");
  if (menu === "v1" || menu === "v2") setVariant(menu);
  if (sp.has("stack")) { /* … теми же сеттерами, что дергает UI */ }
  urlSynced.current = true;
}, []);
```

Применять параметры **теми же сеттерами, что и UI** — тогда deep-link
гарантированно эквивалентен ручному накликиванию.

## НЕ использовать useSearchParams

`useSearchParams` затягивает Suspense-boundary и ломает статическую
генерацию (SSR/SSG целы только без него). `location.search` в mount-эффекте
даёт то же самое без затрат.

## Известный компромисс: первый кадр

По deep-link на не-дефолтный вариант SSR отдаёт **дефолтный** первый кадр,
состояние применяется на маунте (один кадр «дефолта»). Это осознанный
компромисс статической сборки; лечится только переводом роута в
динамический рендер — для прототипов не оправдано.

## Чек-лист

- [ ] каждый тоггл панели отражён в URL
- [ ] дефолт = чистый URL без query
- [ ] заход по ссылке восстанавливает состояние теми же сеттерами
- [ ] `useSearchParams` в проекте отсутствует
