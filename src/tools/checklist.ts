import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok } from "../lib/report.js";

/* get_checklist — короткие чек-листы стадий: выжимка из базы знаний для
   самопроверки агента перед сдачей этапа. Полные гайды — в resources. */

const CHECKLISTS: Record<string, { doc: string; items: string[] }> = {
  import: {
    doc: "proto://knowledge/figma-import",
    items: [
      "get_metadata по фрейму свежий (node-id из старых сессий не использовать)",
      "design context собран по под-узлам (лимит ~25k токенов — ничего не обрезано)",
      "get_variable_defs снят и передан в extract_tokens",
      "эталонный скриншот фрейма сохранён для диффа",
      "ассеты выгружены batch-ом (import_figma_assets), пустые экспорты перевыгружены от родителя",
      "SVG прогнаны через sanitize_svg (CSS-переменные, фоновые path)",
      "недоступные тексты/узлы зафиксированы в handoff списком отступлений",
    ],
  },
  layout: {
    doc: "proto://knowledge/pixel-perfect + react-patterns",
    items: [
      "значения (размеры/цвета/шрифты) — из design context, не со скриншота",
      "крупная статичная разметка перенесена byte-perfect, не «по мотивам»",
      "font-family каждой зоны сверен с design context (контент может отличаться от хрома)",
      "бленд-дифф с эталоном: расходится только font-hinting",
      "React.memo на компонентах с dangerouslySetInnerHTML",
      "эффекты с полным cleanup (StrictMode дважды); DOM-данные при маунте захардкожены",
      "оверлеи вне transform-предков; данные в data/*, не в разметке",
    ],
  },
  animation: {
    doc: "proto://knowledge/animation-canon",
    items: [
      "кривые/тайминги — только из канона (появление 0.5s/0.55s, скрытие 0.22s ease-in)",
      "скрытие быстрее появления (асимметрия) и без задержки",
      "свапы контента — строго в момент полной прозрачности",
      "keyframe с transform не конфликтует с магнитом/сдвигами (переменные обнулены)",
      "z-index выпадашек на контейнере (blur создаёт контекст наложения)",
      "стаггеры: база 120ms, шаг 30ms; капсулы табов перемеряются на fonts.ready",
    ],
  },
  qa: {
    doc: "proto://knowledge/verification",
    items: [
      "npm run verify зелёный (роуты 200, ассеты на месте)",
      "0 битых <img> (naturalWidth !== 0)",
      "консоль без ошибок и hydration-варнингов",
      "интерактив прокликан программно (dispatchEvent), не «на глаз»",
      "тайминги анимаций сэмплированы getComputedStyle",
      "deep-links: каждое состояние панели открывается прямой ссылкой",
      "скриншоты сняты ПОСЛЕ DOM-ассертов (доказательство, не метод)",
    ],
  },
  deploy: {
    doc: "proto://knowledge/deploy-vercel",
    items: [
      "vercel.json с {\"framework\":\"nextjs\"} закоммичен",
      "деплой только по явной команде человека",
      "rm -rf .next .vercel/output → vercel build --prod (не при живом dev!)",
      ".vercel/output/builds.json: use = @vercel/next",
      "vercel deploy --prebuilt --prod; чанки на домене == чанки деплоя (иначе promote)",
      "ssoProtection выключен при публичном шаринге",
      "токен CLI не печатается в вывод и не коммитится",
    ],
  },
};

export function registerChecklist(server: McpServer) {
  server.registerTool(
    "get_checklist",
    {
      title: "Чек-лист стадии",
      description:
        "Короткий чек-лист для самопроверки перед сдачей стадии: import (выгрузка " +
        "из Figma), layout (вёрстка), animation (моушен), qa (parity-QA), deploy.",
      inputSchema: {
        stage: z.enum(["import", "layout", "animation", "qa", "deploy"]).describe("стадия работы"),
      },
    },
    async ({ stage }) => {
      const c = CHECKLISTS[stage];
      return ok([
        `# Чек-лист: ${stage} (полный гайд — ${c.doc})`,
        "",
        ...c.items.map((i) => `- [ ] ${i}`),
      ]);
    }
  );
}
