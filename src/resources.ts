import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KNOWLEDGE_DIR } from "./lib/paths.js";

/* База знаний: каждый knowledge/<name>.md — ресурс proto://knowledge/<name>.
   Документы читаются с диска на каждый запрос (правки базы не требуют
   рестарта сервера при dev-запуске через tsx). */

const DESCRIPTIONS: Record<string, string> = {
  index: "Оглавление базы знаний: какой документ читать перед какой задачей",
  "figma-import": "Выгрузка данных и ассетов из Figma: обрезка контекста, пустые экспорты, живые node-id",
  "pixel-perfect": "Методика точной вёрстки: эталон, бленд-дифф, byte-perfect перенос, скриншоты анимаций",
  "animation-canon": "Канон моушена: кривые, тайминги и 12 готовых рецептов (блюр-ревил, стаггеры, свопы, морфы)",
  "react-patterns": "Перенос статики в Next.js: партиалы, StrictMode, memo, оверлеи и transform/filter",
  "project-structure": "Структура скаффолд-проекта и правила слоёв (CSS, данные, ассеты, роуты)",
  "tools-panel": "Панель прототипа: рамка-обрезка clip-path, board/board-body, свопы дашбордов",
  "deep-links": "Состояние прототипа в URL: history.replaceState, чтение на маунте, без useSearchParams",
  "deploy-vercel": "Деплой на Vercel: framework preset, deployment protection, promote, надёжный флоу",
  verification: "Parity-QA: роуты, битые img, консоль, программный проклик, сэмплинг таймингов",
  "design-system": "core-ds: шрифты Alfa Interface Sans/Styrene UI, иконки-маски, токены",
};

export function knowledgeNames(): string[] {
  return fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function readKnowledge(name: string): string | null {
  // защита от выхода из директории
  const file = path.join(KNOWLEDGE_DIR, `${path.basename(name)}.md`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

export function registerResources(server: McpServer) {
  server.registerResource(
    "knowledge",
    new ResourceTemplate("proto://knowledge/{name}", {
      list: () => ({
        resources: knowledgeNames().map((name) => ({
          uri: `proto://knowledge/${name}`,
          name,
          title: `proto-forge: ${name}`,
          description: DESCRIPTIONS[name] ?? "Документ базы знаний proto-forge",
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "База знаний proto-forge",
      description:
        "Конденсат best practices разработки прототипов по Figma-макетам. Начни с proto://knowledge/index.",
      mimeType: "text/markdown",
    },
    async (uri, { name }) => {
      const text = readKnowledge(String(name));
      if (text === null) {
        throw new Error(
          `Нет документа «${name}». Доступные: ${knowledgeNames().join(", ")}`
        );
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    }
  );
}
