import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/* Prompts — готовые сценарии для агента. Каждый разворачивается в
   пошаговую инструкцию со ссылками на resources и tools proto-forge. */

function p(text: string) {
  return {
    messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
  };
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "new-dashboard",
    {
      title: "Новый дашборд по Figma-фрейму",
      description: "Полный цикл: разбор фрейма → ассеты → вёрстка → регистрация → verify",
      argsSchema: {
        fileKey: z.string().describe("ключ Figma-файла"),
        nodeId: z.string().describe("node-id фрейма дашборда"),
        name: z.string().describe("имя дашборда (и роут)"),
      },
    },
    ({ fileKey, nodeId, name }) =>
      p(`Сверстай новый дашборд «${name}» по Figma-фрейму ${nodeId} (файл ${fileKey}).

Порядок (не пропускать шаги):
1. Прочитай proto://knowledge/figma-import и proto://knowledge/pixel-perfect.
2. get_metadata по фрейму ${nodeId} → список под-узлов; get_design_context ПО КАЖДОМУ крупному под-узлу (лимит ~25k токенов). get_screenshot фрейма — сохранить как эталон.
3. get_variable_defs → extract_tokens (если токены ещё не выгружены).
4. Собери список ассетов (иконки svg, картинки png) с node-id → import_figma_assets одним batch-ом.
5. Если проект ещё не создан — scaffold_project; иначе register_dashboard (name="${name}").
6. Вёрстка строго по design context (не по скриншоту), данные — в data/*. Анимации — только add_animation / канон.
7. Бленд-дифф с эталоном; npm run verify; get_checklist(stage:"qa") — пройди все пункты.
Отступления от макета фиксируй в HANDOFF.md.`)
  );

  server.registerPrompt(
    "new-widget",
    {
      title: "Новый виджет в существующий пейн",
      description: "Разбор узла → ассеты → вёрстка в канон-сетке → стаггер",
      argsSchema: {
        fileKey: z.string().describe("ключ Figma-файла"),
        nodeId: z.string().describe("node-id виджета"),
        pane: z.string().describe("селектор/описание пейна, куда встраивать"),
      },
    },
    ({ fileKey, nodeId, pane }) =>
      p(`Добавь виджет из Figma-узла ${nodeId} (файл ${fileKey}) в пейн ${pane}.

1. Прочитай proto://knowledge/figma-import (грабли под-узлов и инстансов).
2. get_design_context по узлу ${nodeId} (при обрезке — по под-узлам); get_screenshot узла — эталон.
3. Ассеты узла → import_figma_assets (svg — санитайзер отработает автоматически).
4. Вёрстка в сетке пейна ${pane}; появление виджета — в общий стаггер пейна (не отдельная анимация).
5. Дифф: SVG-экспорт узла + бленд (точечная сверка, pixel-perfect.md).
6. get_checklist(stage:"layout") перед сдачей.`)
  );

  server.registerPrompt(
    "port-animation",
    {
      title: "Подобрать канон-рецепт анимации",
      description: "По описанию/референсу выбрать рецепт из канона и применить",
      argsSchema: {
        description: z.string().describe("что должно происходить (или референс)"),
        selector: z.string().optional().describe("селектор цели, если известен"),
      },
    },
    ({ description, selector }) =>
      p(`Нужна анимация: ${description}${selector ? ` (цель: ${selector})` : ""}.

1. Прочитай proto://knowledge/animation-canon.
2. Подбери ближайший рецепт (blur-reveal / stagger / pane-switch / content-dissolve / tab-pill / ticker / spin-ring / magnet / stream-reveal). НЕ изобретай новые кривые.
3. add_animation с выбранным рецептом и селектором → вставь CSS в styles/app.css, подключи по инструкции из выдачи.
4. Проверь тайминги getComputedStyle (verification.md), середину — трюком transition-delay:-30s.`)
  );

  server.registerPrompt(
    "parity-qa",
    {
      title: "Parity-QA страницы",
      description: "Прогнать verification-чеклист с измерениями",
      argsSchema: {
        route: z.string().describe("роут страницы, например / или /reports"),
      },
    },
    ({ route }) =>
      p(`Прогони parity-QA для ${route}.

1. Прочитай proto://knowledge/verification.
2. npm run verify (сервер должен быть запущен) — приложи вывод.
3. Вручную через браузер: программный проклик всех тогглов/табов (dispatchEvent, не «на глаз»), после каждого — assert DOM.
4. Сэмплируй тайминги ключевых анимаций getComputedStyle — сверь с каноном.
5. Проверь deep-links: каждое состояние панели открывается прямой ссылкой.
6. get_checklist(stage:"qa") — отчёт по каждому пункту с измерениями, не «выглядит ок».`)
  );

  server.registerPrompt(
    "ship",
    {
      title: "Чек-лист деплоя",
      description: "Прод-деплой на Vercel по надёжному флоу (выполняет агент)",
      argsSchema: {},
    },
    () =>
      p(`Задеплой прототип на Vercel по надёжному флоу.

1. Прочитай proto://knowledge/deploy-vercel ЦЕЛИКОМ (там три невидимых грабли).
2. Убедись, что dev-сервер остановлен; rm -rf .next .vercel/output.
3. vercel build --prod → проверь .vercel/output/builds.json (use = @vercel/next; иначе vercel.json не подхватился).
4. vercel deploy --prebuilt --prod.
5. Сверь hash чанков на каноническом домене и на URL деплоя; расходятся → vercel promote.
6. При публичном шаринге — проверь/выключи ssoProtection.
7. get_checklist(stage:"deploy") — финальная сверка. Токены в вывод не печатать.`)
  );
}
