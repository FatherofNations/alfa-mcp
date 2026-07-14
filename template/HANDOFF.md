# __PROJECT_TITLE__ — Handoff

> Заполняется по ходу работы. Каркас — из proto-forge.

Интерактивный прототип по Figma-макету. Стек: Next.js 15 (App Router),
React 19, TypeScript. Без UI-библиотек, глобальный CSS.

## Запуск

```bash
npm install
npm run dev        # dev-сервер :3000
npm run build      # прод-сборка. НЕ запускать при живом dev (общий .next)
npm run verify     # parity-QA (сервер должен быть запущен)
```

## Роуты

| URL | Что это |
|-----|---------|
| `/` | _<первый дашборд>_ |

## Источник макета

- Figma-файл: _<ссылка>_
- Ключевые фреймы: _<node-id и названия>_

## Осознанные отступления от макета

_Каждое отступление — строкой: что, почему, где в коде._

- —

## Панель tools

Живёт в root layout (переживает смену роута). Карточки — свопы дашбордов
через диссолв; Esc закрывает; рамка-обрезка `clip-path` при открытии.
Состояния прототипа — `ProtoState` в `components/tools/ToolsProvider.tsx`,
все отражаются в URL (deep-links).

## Подводные камни

- StrictMode (dev) дважды прогоняет эффекты — во всех хуках полный cleanup.
- `React.memo` обязателен на компонентах с `dangerouslySetInnerHTML`.
- Не запускать `next build` при живом `next dev` (общий `.next`).
- Оверлеи держать вне transform-предков.

## Деплой

- Прод: _<URL>_
- Флоу и грабли: `proto://knowledge/deploy-vercel` (framework preset,
  protection, promote).
