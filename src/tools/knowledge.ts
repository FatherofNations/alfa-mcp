import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok } from "../lib/report.js";
import { knowledgeNames, readKnowledge } from "../resources.js";

/* Каноны тулом, а не только ресурсом.

   Зачем: MCP-ресурсы (alfa://knowledge/*) читают НЕ ВСЕ клиенты. В реальной
   сессии агент не смог прочитать ни одного канона — инструмента для чтения
   ресурсов в его клиенте не оказалось, ToolSearch по «read mcp resource»
   ничего не нашёл. Каноны, которые нельзя прочитать, не существуют:
   агент пошёл верстать без пайплайна ассетов и методики диффа.

   Тулы доступны везде, где доступен MCP, поэтому база знаний дублируется
   тулом. Ресурс остаётся — там, где он работает, он удобнее. */

export function registerKnowledge(server: McpServer) {
  server.registerTool(
    "read_knowledge",
    {
      title: "Читать канон базы знаний",
      description:
        "Отдаёт документ базы знаний Альфы текстом. ЭТО ОСНОВНОЙ способ " +
        "читать каноны: ресурсы alfa://knowledge/* поддерживают не все клиенты. " +
        "Без имени — оглавление (index) и список документов. " +
        "Перед задачей по Figma-макету зови read_knowledge() без аргументов, " +
        "дальше нужные документы по одному.",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe(
            "имя документа без .md (index, figma-import, table-import, pixel-perfect, " +
              "verification, animation-canon, react-patterns, project-structure, " +
              "tools-panel, deep-links, design-system, stack-choice, deploy-vercel). " +
              "Без имени — оглавление"
          ),
      },
    },
    async ({ name }) => {
      const names = knowledgeNames();
      if (!name) {
        const index = readKnowledge("index");
        return ok([
          `# База знаний Альфы (${names.length} документов)`,
          "",
          `Доступные: ${names.join(", ")}`,
          "",
          index ?? "(index.md не найден)",
        ]);
      }
      const text = readKnowledge(name);
      if (text === null) {
        return fail(`нет документа «${name}». Доступные: ${names.join(", ")}`);
      }
      return ok([`# alfa://knowledge/${name}`, "", text]);
    }
  );
}
