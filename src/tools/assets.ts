import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { writeFileEnsured } from "../lib/template.js";
import { sanitizeSvg } from "../lib/svg.js";
import {
  analyzePng,
  floodFillClean,
  getSharp,
  roundedMask,
  toWebpIfSmaller,
} from "../lib/images.js";

/* import_figma_assets — batch-экспорт через Figma REST API (обходит грабли
   официального MCP: пустые экспорты, запечённые фоны, 7-дневные URL).
   sanitize_svg — чистка SVG-экспортов (CSS-переменные, фоновые path). */

const FIGMA_API = "https://api.figma.com/v1";

async function figmaImageUrls(
  fileKey: string,
  ids: string[],
  format: "png" | "svg",
  scale: number,
  token: string
): Promise<Record<string, string | null>> {
  const url =
    `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids.join(","))}` +
    `&format=${format}${format === "png" ? `&scale=${scale}` : ""}`;
  const res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    throw new Error(`Figma API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { err?: string; images: Record<string, string | null> };
  if (json.err) throw new Error(`Figma API: ${json.err}`);
  return json.images;
}

export function registerAssets(server: McpServer) {
  server.registerTool(
    "import_figma_assets",
    {
      title: "Batch-экспорт ассетов из Figma",
      description:
        "Скачивает узлы через Figma REST API (нужен env FIGMA_TOKEN) и прогоняет " +
        "пайплайн: PNG — проверка непустоты → опц. flood-fill чистка фона → " +
        "опц. rounded-маска → lossless WebP; SVG — санитайзер. Отдаёт манифест.",
      inputSchema: {
        fileKey: z.string().min(1).describe("ключ Figma-файла (из URL)"),
        nodes: z
          .array(
            z.object({
              id: z.string().min(1).describe("node-id (например 199:56451)"),
              name: z.string().min(1).describe("имя файла без расширения (camelCase)"),
              format: z.enum(["png", "svg"]),
              scale: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(2),
              cleanBackground: z
                .boolean()
                .default(false)
                .describe("flood-fill чистка запечённого фона от краёв (png)"),
              roundedRadius: z
                .number()
                .optional()
                .describe("радиус rounded-rect маски в px (png, для запечённых углов)"),
            })
          )
          .min(1),
        outDir: z.string().default("public/assets/figma").describe("куда класть файлы"),
      },
    },
    async ({ fileKey, nodes, outDir }) => {
      const token = process.env.FIGMA_TOKEN;
      if (!token) {
        return fail(
          "нет env FIGMA_TOKEN. Добавь токен в конфиг MCP-сервера " +
            '("env": {"FIGMA_TOKEN": "figd_…"}). Либо используй download_assets ' +
            "официального Figma MCP по гайду proto://knowledge/figma-import."
        );
      }
      const dest = resolveInProject(outDir ?? "public/assets/figma");
      const r = new Report();
      r.add(`# import_figma_assets: ${nodes.length} узлов → ${dest}`);
      if (!(await getSharp())) {
        r.add("⚠ sharp не загрузился — PNG сохраняются без чисток/WebP");
      }
      r.add("");

      // URL пачками по формату+масштабу
      const groups = new Map<string, typeof nodes>();
      for (const n of nodes) {
        const key = `${n.format}:${n.scale ?? 2}`;
        groups.set(key, [...(groups.get(key) ?? []), n]);
      }
      const urls = new Map<string, string | null>();
      for (const [key, group] of groups) {
        const [format, scale] = key.split(":");
        const images = await figmaImageUrls(
          fileKey,
          group.map((n) => n.id),
          format as "png" | "svg",
          Number(scale),
          token
        );
        for (const n of group) urls.set(n.id, images[n.id] ?? null);
      }

      for (const n of nodes) {
        const url = urls.get(n.id);
        if (!url) {
          r.add(`✗ ${n.name} (${n.id}): Figma не отдала URL — узел не экспортируется в изоляции; выгрузи узел-родитель и обрежь (figma-import.md)`);
          continue;
        }
        const res = await fetch(url);
        if (!res.ok) {
          r.add(`✗ ${n.name}: скачивание HTTP ${res.status}`);
          continue;
        }
        let buf: Buffer = Buffer.from(await res.arrayBuffer());
        const applied: string[] = [];
        const warns: string[] = [];

        if (n.format === "svg") {
          const { svg, changes, warnings } = sanitizeSvg(buf.toString("utf8"));
          applied.push(...changes);
          warns.push(...warnings);
          const file = path.join(dest, `${n.name}.svg`);
          writeFileEnsured(file, svg);
          r.add(`✓ ${n.name}.svg (${(svg.length / 1024).toFixed(1)} KB)${applied.length ? ` — ${applied.join("; ")}` : ""}`);
          warns.forEach((w) => r.add(`  ⚠ ${w}`));
          continue;
        }

        // PNG-пайплайн
        const analysis = await analyzePng(buf);
        if (analysis?.empty) {
          r.add(
            `✗ ${n.name} (${n.id}): ПУСТОЙ экспорт (${analysis.width}×${analysis.height}, alpha=0) — ` +
              "перевыгрузи узел-родитель и обрежь, или экспортируй через use_figma exportAsync (figma-import.md)"
          );
          continue;
        }
        if (n.cleanBackground) {
          const cleaned = await floodFillClean(buf);
          if (cleaned) {
            buf = cleaned;
            applied.push("flood-fill чистка фона");
          } else warns.push("sharp недоступен — фон не чищен");
        }
        if (typeof n.roundedRadius === "number") {
          const masked = await roundedMask(buf, n.roundedRadius);
          if (masked) {
            buf = masked;
            applied.push(`rounded-маска r=${n.roundedRadius}`);
          } else warns.push("sharp недоступен — маска не применена");
        }
        const webp = await toWebpIfSmaller(buf);
        let file: string;
        if (webp) {
          file = path.join(dest, `${n.name}.webp`);
          writeFileEnsured(file, webp);
          applied.push(`WebP lossless (${(webp.length / 1024).toFixed(1)} KB < png ${(buf.length / 1024).toFixed(1)} KB)`);
        } else {
          file = path.join(dest, `${n.name}.png`);
          writeFileEnsured(file, buf);
          if ((await getSharp()) !== null) applied.push("PNG оставлен (WebP не меньше)");
        }
        r.add(
          `✓ ${path.basename(file)} (${analysis ? `${analysis.width}×${analysis.height}` : "?"})${applied.length ? ` — ${applied.join("; ")}` : ""}`
        );
        warns.forEach((w) => r.add(`  ⚠ ${w}`));
      }

      r.add("");
      r.add("Пути в коде — от корня: /assets/figma/<имя>.<ext>. Figma-URL живут 7 дней — в код их не класть.");
      return r.toResult();
    }
  );

  server.registerTool(
    "sanitize_svg",
    {
      title: "Санитайзер SVG-экспортов",
      description:
        "Чистит SVG из Figma: fill=var(--fill-0,…) → конкретный цвет (в <img> " +
        "CSS-переменные не работают), удаляет фоновые path, предупреждает о " +
        "fill-opacity для CSS-масок. Правит файлы на месте.",
      inputSchema: {
        files: z.array(z.string().min(1)).min(1).describe("пути к SVG-файлам (относительно корня проекта)"),
      },
    },
    async ({ files }) => {
      const r = new Report();
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
