import fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { fail, ok } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { digest } from "../lib/digest.js";

/* digest_design_context — сжатие выдачи Figma MCP.

   Выдача get_design_context на секцию с таблицей не влезает в лимит
   контекста: клиент сохраняет её в файл, и агент каждый раз пишет разовый
   парсер. Этот тул — тот самый парсер, один на всех.

   Командный режим (http): файлов агента не видим, поэтому возвращаем curl
   на /digest — как process_assets возвращает curl на /process. */

export function registerDigest(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "digest_design_context",
    {
      title: "Сжать выдачу Figma MCP до полезного",
      description:
        "Сжимает СЛИШКОМ БОЛЬШУЮ выдачу get_design_context / get_metadata до дайджеста " +
        "(обычно 2–5% исходного размера). Зови ВСЕГДА, когда ответ Figma MCP не влез в " +
        "лимит и клиент сохранил его в файл — вместо того чтобы писать разовый парсер. " +
        "Режимы: layout — дерево get_metadata с ПОВТОРАМИ СХЛОПНУТЫМИ («14× BodyRow, " +
        "шаг 49»); rows — таблица: геометрия одной строки + матрица текстов всех строк; " +
        "text — инвентарь типографики по стилям (ловит «шрифт контента ≠ шрифт хрома»); " +
        "assets — именованные ассеты из констант + готовый curl. auto — определить по входу.",
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe(
            "путь к файлу с сохранённой выдачей Figma MCP (клиент пишет его при " +
              "превышении лимита; путь есть в тексте ошибки)"
          ),
        content: z
          .string()
          .optional()
          .describe("выдача текстом — если она у тебя на руках и небольшая"),
        mode: z
          .enum(["auto", "layout", "rows", "text", "assets"])
          .default("auto")
          .describe("что извлекать; auto определяет по содержимому"),
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(8)
          .default(3)
          .describe("для layout: глубина дерева"),
      },
    },
    async ({ file, content, mode, maxDepth }) => {
      if (content) return ok(digest(content, mode ?? "auto", maxDepth ?? 3));
      if (!file) return fail("передай file (путь к сохранённой выдаче) или content (текст)");

      if (ctx.mode === "http") {
        const q = new URLSearchParams();
        if (mode && mode !== "auto") q.set("mode", mode);
        if (maxDepth && maxDepth !== 3) q.set("depth", String(maxDepth));
        const url = `${ctx.digestUrl}${q.size ? `?${q}` : ""}`;
        return ok([
          "# digest_design_context (командный режим): выполни команду",
          "```bash",
          `curl -fsS -X POST --data-binary @"${file}" -H "Content-Type: text/plain" "${url}"`,
          "```",
          "Вернётся дайджест текстом — он и есть результат, читай его вместо исходного файла.",
        ]);
      }

      const abs = resolveInProject(file);
      if (!fs.existsSync(abs)) return fail(`файл не найден: ${abs}`);
      const raw = fs.readFileSync(abs, "utf8");
      return ok(digest(raw, mode ?? "auto", maxDepth ?? 3));
    }
  );
}
