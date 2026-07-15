import fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { Report, fail, ok } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { sanitizeSvg } from "../lib/svg.js";
import { processAssetsDir } from "../lib/process.js";

/* Пайплайн ассетов. Скачивает ассеты официальный Figma MCP
   (download_assets, батчем!) — proto-forge их пост-процессит одной
   операцией: это самый быстрый путь без потери качества.
   Никаких Figma-токенов не нужно. */

export function registerAssets(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "process_assets",
    {
      title: "Пост-процессинг ассетов из Figma",
      description:
        "Обрабатывает ВСЮ папку ассетов, скачанных download_assets (Figma MCP), " +
        "одной операцией: SVG — санитайзер (CSS-переменные → цвет, фоновые path); " +
        "PNG — детект пустых экспортов, опц. flood-fill чистка фона и rounded-маска " +
        "(по именам файлов), lossless WebP если меньше. Вызывай СРАЗУ после " +
        "download_assets, до вёрстки (webp переименовывает файлы).",
      inputSchema: {
        dir: z
          .string()
          .default("public/assets/figma")
          .describe("папка с ассетами (next: public/assets/figma, static: assets/figma)"),
        webp: z.boolean().default(true).describe("конвертировать png → lossless webp, если меньше"),
        cleanBackground: z
          .array(z.string())
          .default([])
          .describe("имена png-файлов (без расширения) для flood-fill чистки запечённого фона"),
        rounded: z
          .array(z.object({ file: z.string(), radius: z.number() }))
          .default([])
          .describe("png-файлы для rounded-rect маски (запечённые углы секции)"),
      },
    },
    async ({ dir, webp, cleanBackground, rounded }) => {
      const opts = { webp, cleanBackground, rounded };
      if (ctx.mode === "http") {
        // файлов агента не видим — round-trip папки через /process (один curl)
        const q = new URLSearchParams();
        if (webp === false) q.set("webp", "0");
        if (cleanBackground?.length) q.set("clean", cleanBackground.join(","));
        if (rounded?.length) q.set("round", rounded.map((r) => `${r.file}:${r.radius}`).join(","));
        const url = `${ctx.processUrl}${q.size ? `?${q}` : ""}`;
        const d = dir ?? "public/assets/figma";
        return ok([
          "# process_assets (командный режим): выполни в корне проекта",
          "```bash",
          `COPYFILE_DISABLE=1 tar czf /tmp/pf-assets.tgz -C ${d} . \\`,
          `  && curl -fsS -X POST --data-binary @/tmp/pf-assets.tgz -H "Content-Type: application/gzip" \\`,
          `       "${url}" -o /tmp/pf-assets-out.tgz \\`,
          `  && rm -rf ${d} && mkdir -p ${d} && tar xzf /tmp/pf-assets-out.tgz -C ${d} \\`,
          `  && cat ${d}/_report.txt && rm ${d}/_report.txt /tmp/pf-assets*.tgz`,
          "```",
          "Папка вернётся обработанной (png может стать webp — учитывай в путях <img>).",
          "В _report.txt — что почищено и какие экспорты ПУСТЫЕ (их перевыгрузить).",
        ]);
      }
      const abs = resolveInProject(dir ?? "public/assets/figma");
      const report = await processAssetsDir(abs, opts);
      const r = new Report();
      r.add(`# process_assets: ${abs}`);
      r.addAll(report);
      r.add("");
      r.add("Пути в коде — от корня: /assets/figma/<имя>.<ext> (webp мог сменить расширение).");
      return r.toResult();
    }
  );

  server.registerTool(
    "sanitize_svg",
    {
      title: "Санитайзер SVG-экспортов",
      description:
        "Точечная чистка SVG (для папки целиком используй process_assets): " +
        "fill=var(--fill-0,…) → цвет, фоновые path, предупреждения для CSS-масок. " +
        "files — правка на месте; svgs (имя+контент) — вернёт очищенный контент.",
      inputSchema: {
        files: z.array(z.string().min(1)).optional().describe("пути к SVG-файлам (правка на месте)"),
        svgs: z
          .array(z.object({ name: z.string(), content: z.string() }))
          .optional()
          .describe("SVG контентом (вернётся очищенным — для командного режима)"),
      },
    },
    async ({ files, svgs }) => {
      const r = new Report();
      if (svgs?.length) {
        r.add(`# sanitize_svg: ${svgs.length} inline`);
        for (const s of svgs) {
          const { svg, changes, warnings } = sanitizeSvg(s.content);
          r.add(`${changes.length ? "✓" : "•"} ${s.name}${changes.length ? ` — ${changes.join("; ")}` : " — чисто"}`);
          warnings.forEach((w) => r.add(`  ⚠ ${w}`));
          if (changes.length) {
            r.add("```svg");
            r.add(svg);
            r.add("```");
          }
        }
        return r.toResult();
      }
      if (!files?.length) return fail("передай files (пути) или svgs (контент)");
      if (ctx.mode === "http") {
        return fail(
          "командный режим не видит файлов агента — передай svgs:[{name,content}] " +
            "или обработай папку целиком через process_assets"
        );
      }
      r.add(`# sanitize_svg: ${files.length} файлов`);
      for (const f of files) {
        const p = resolveInProject(f);
        if (!fs.existsSync(p)) {
          r.add(`✗ ${f}: файл не найден`);
          continue;
        }
        const { svg, changes, warnings } = sanitizeSvg(fs.readFileSync(p, "utf8"));
        if (changes.length) fs.writeFileSync(p, svg, "utf8");
        r.add(`${changes.length ? "✓" : "•"} ${f}${changes.length ? ` — ${changes.join("; ")}` : " — чисто"}`);
        warnings.forEach((w) => r.add(`  ⚠ ${w}`));
      }
      return r.toResult();
    }
  );
}
