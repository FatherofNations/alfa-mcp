# deploy-vercel — деплой и его грабли

> Деплой выполняет агент/человек по явной команде. alfa-mcp не деплоит.

## Грабля №1: Framework Preset

Проект, созданный на Vercel под статику, имеет `framework: null`. Пуш
Next.js-кода **НЕ переключает пресет**: билд идёт через
`@vercel/static-build`, статус «Ready», но **все роуты — 404**.

- **Страховка**: коммитить `vercel.json`:

```json
{ "framework": "nextjs" }
```

- **Диагностика**: `.vercel/output/builds.json` — смотреть поля `use`
  (должен быть `@vercel/next`) и `detectedFramework`.

## Грабля №2: Deployment Protection

`ssoProtection` прячет прототип за SSO Vercel-команды — стейкхолдеры по
ссылке видят логин-форму. При публичном шаринге выключать:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}'
```

## Грабля №3: алиас не переехал

Канонический домен (`*.vercel.app`) может **НЕ переехать** на новый
прод-деплой (успешный деплой ≠ обновлённый алиас). Проверка: сверить hash
JS-чанка на домене и на URL деплоя:

```bash
curl -s https://<proj>.vercel.app | grep -o 'chunks/[a-z0-9-]*\.js' | head -3
curl -s https://<deploy-url>      | grep -o 'chunks/[a-z0-9-]*\.js' | head -3
```

Расходятся → `vercel promote <deploy-url>`.

## Надёжный флоу прод-деплоя

```bash
rm -rf .next .vercel/output       # чистая сборка (см. react-patterns: общий .next)
vercel build --prod
cat .vercel/output/builds.json    # проверить: "use": "@vercel/next"
vercel deploy --prebuilt --prod
# сверить чанки на домене ↔ деплое; при рассинхроне:
vercel promote <deploy-url>
git push                          # код в main — после того как прод жив
```

## Гигиена

- Токен CLI (`VERCEL_TOKEN`) использовать только внутри скриптов,
  **не печатать в вывод** и не коммитить.
- Прототипы не индексируем: `robots.ts` с `disallow: /` уже в шаблоне +
  `metadata.robots` в layout.
- Откат: `vercel promote <предыдущий deploy-url>` быстрее, чем revert+rebuild.
