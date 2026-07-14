import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { CORE_DS_RAW, FAMILIES, FontFile, downloadFont, fontFaceCss, preloadList } from "../lib/fonts-core.js";
import { writeFileEnsured } from "../lib/template.js";

/* install_fonts — шрифты дизайн-системы из публичного core-ds.
   Обычно НЕ нужен: scaffold_project ставит шрифты сразу. Используй для
   до-установки весов/семейств в существующий проект. */

export function registerFonts(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "install_fonts",
    {
      title: "Установка шрифтов дизайн-системы",
      description:
        "Доустановка woff2 из core-ds (alfa-interface-sans, styrene-ui) + " +
        "styles/fonts.css + preload. Обычно не нужен: scaffold_project уже " +
        "ставит шрифты при создании проекта.",
      inputSchema: {
        families: z
          .array(z.enum(["alfa-interface-sans", "styrene-ui"]))
          .min(1)
          .describe("семейства для установки"),
        weights: z.array(z.number()).optional().describe("веса (default: 400/500/700)"),
        targetDir: z.string().default(".").describe("корень проекта-прототипа"),
      },
    },
    async ({ families, weights, targetDir }) => {
      const wanted: FontFile[] = families
        .flatMap((fam) => FAMILIES[fam])
        .filter((f) => !weights || weights.includes(f.weight));
      if (wanted.length === 0) return fail("после фильтра по weights не осталось файлов");
      const r = new Report();

      if (ctx.mode === "http") {
        // файлов агента не видим — отдаём точные команды и контент
        r.add("# install_fonts (командный режим): выполни в корне проекта");
        r.add("```bash");
        r.add("mkdir -p public/fonts");
        for (const f of wanted) {
          r.add(`curl -fsS -o public/fonts/${f.file} "${CORE_DS_RAW}/${f.file}"`);
        }
        r.add("```");
        r.add("");
        r.add("Запиши в styles/fonts.css:");
        r.add("```css");
        r.add(fontFaceCss(wanted));
        r.add("```");
        r.add("И добавь в массив FONTS в app/layout.tsx (preload):");
        r.add("```");
        r.add(preloadList(wanted));
        r.add("```");
        return r.toResult();
      }

      const root = resolveInProject(targetDir ?? ".");
      if (!fs.existsSync(root)) return fail(`нет директории ${root}`);
      const fontsDir = path.join(root, "public/fonts");
      r.add(`# install_fonts → ${fontsDir}`);

      const installed: FontFile[] = [];
      for (const f of wanted) {
        const buf = await downloadFont(f);
        if (!buf) {
          r.add(`✗ ${f.file}: не скачался (сеть/валидация)`);
          continue;
        }
        writeFileEnsured(path.join(fontsDir, f.file), buf);
        installed.push(f);
        r.add(`✓ ${f.file} (${(buf.length / 1024).toFixed(1)} KB, weight ${f.weight})`);
      }
      if (installed.length === 0) return fail("ни один шрифт не скачался — проверьте сеть");

      writeFileEnsured(path.join(root, "styles/fonts.css"), fontFaceCss(installed));
      r.add(`✓ styles/fonts.css перегенерирован (${installed.length} @font-face)`);

      const layoutPath = path.join(root, "app/layout.tsx");
      const preload = preloadList(installed);
      if (fs.existsSync(layoutPath)) {
        const layout = fs.readFileSync(layoutPath, "utf8");
        if (layout.includes("/* proto-forge:fonts */")) {
          fs.writeFileSync(
            layoutPath,
            layout.replace("  /* proto-forge:fonts */", `${preload}\n  /* proto-forge:fonts */`),
            "utf8"
          );
          r.add("✓ app/layout.tsx: массив FONTS (preload) дополнен");
        } else {
          r.add("⚠ app/layout.tsx без маркера proto-forge:fonts — добавь preload вручную:");
          r.add(preload);
        }
      } else {
        r.add("⚠ app/layout.tsx не найден — сниппет preload:");
        r.add(preload);
      }
      return r.toResult();
    }
  );
}
