import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { writeFileEnsured } from "../lib/template.js";

/* install_fonts — шрифты дизайн-системы из публичного репозитория core-ds.
   Шрифты НЕ вшиты в proto-forge (лицензия) — качаются в момент установки.
   Подключение — @font-face с font-display:swap (не next/font/local: он
   хеширует имя семейства, а вербатим-CSS ссылается литералом). */

const CORE_DS_RAW =
  "https://raw.githubusercontent.com/core-ds/core-components/HEAD/.storybook/public/fonts";

interface FontFile {
  file: string;
  family: string;
  weight: number;
}
const FAMILIES: Record<string, FontFile[]> = {
  "alfa-interface-sans": [
    { file: "alfa-interface-sans_regular.woff2", family: "Alfa Interface Sans", weight: 400 },
    { file: "alfa-interface-sans_medium.woff2", family: "Alfa Interface Sans", weight: 500 },
    { file: "alfa-interface-sans_bold.woff2", family: "Alfa Interface Sans", weight: 700 },
  ],
  "styrene-ui": [
    { file: "styrene-ui_regular.woff2", family: "Styrene UI", weight: 400 },
    { file: "styrene-ui_medium.woff2", family: "Styrene UI", weight: 500 },
    { file: "styrene-ui_bold.woff2", family: "Styrene UI", weight: 700 },
  ],
};

function fontFaceCss(fonts: FontFile[]): string {
  const blocks = fonts.map(
    (f) => `@font-face {
  font-family: '${f.family}';
  src: url('/fonts/${f.file}') format('woff2');
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
}`
  );
  return `/* Сгенерировано proto-forge install_fonts (источник: core-ds).
   См. proto://knowledge/design-system — почему @font-face, а не next/font. */

${blocks.join("\n\n")}
`;
}

export function registerFonts(server: McpServer) {
  server.registerTool(
    "install_fonts",
    {
      title: "Установка шрифтов дизайн-системы",
      description:
        "Качает woff2 из core-ds (alfa-interface-sans, styrene-ui) в public/fonts, " +
        "генерирует styles/fonts.css (@font-face) и сниппет preload для layout.",
      inputSchema: {
        families: z
          .array(z.enum(["alfa-interface-sans", "styrene-ui"]))
          .min(1)
          .describe("семейства для установки"),
        weights: z
          .array(z.number())
          .optional()
          .describe("веса (default: все доступные — 400/500/700)"),
        targetDir: z
          .string()
          .default(".")
          .describe("корень проекта-прототипа (где лежат public/ и styles/)"),
      },
    },
    async ({ families, weights, targetDir }) => {
      const root = resolveInProject(targetDir ?? ".");
      if (!fs.existsSync(root)) return fail(`нет директории ${root}`);
      const fontsDir = path.join(root, "public/fonts");
      const r = new Report();
      r.add(`# install_fonts → ${fontsDir}`);

      const wanted: FontFile[] = families
        .flatMap((fam) => FAMILIES[fam])
        .filter((f) => !weights || weights.includes(f.weight));
      if (wanted.length === 0) return fail("после фильтра по weights не осталось файлов");

      const installed: FontFile[] = [];
      for (const f of wanted) {
        const url = `${CORE_DS_RAW}/${f.file}`;
        const res = await fetch(url);
        if (!res.ok) {
          r.add(`✗ ${f.file}: HTTP ${res.status} (${url})`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        // валидность: woff2 начинается с magic 'wOF2'
        if (buf.length < 4 || buf.toString("ascii", 0, 4) !== "wOF2") {
          r.add(`✗ ${f.file}: скачан не-woff2 (${buf.length} байт) — пропущен`);
          continue;
        }
        writeFileEnsured(path.join(fontsDir, f.file), buf);
        installed.push(f);
        r.add(`✓ ${f.file} (${(buf.length / 1024).toFixed(1)} KB, weight ${f.weight})`);
      }
      if (installed.length === 0) return fail("ни один шрифт не скачался — проверьте сеть");

      // styles/fonts.css
      const cssPath = path.join(root, "styles/fonts.css");
      writeFileEnsured(cssPath, fontFaceCss(installed));
      r.add(`✓ styles/fonts.css перегенерирован (${installed.length} @font-face)`);

      // preload-массив в layout (если layout из шаблона — подставим на место маркера)
      const layoutPath = path.join(root, "app/layout.tsx");
      const preloadList = installed.map((f) => `  "/fonts/${f.file}",`).join("\n");
      if (fs.existsSync(layoutPath)) {
        const layout = fs.readFileSync(layoutPath, "utf8");
        if (layout.includes("/* proto-forge:fonts */")) {
          fs.writeFileSync(
            layoutPath,
            layout.replace("  /* proto-forge:fonts */", `${preloadList}\n  /* proto-forge:fonts */`),
            "utf8"
          );
          r.add("✓ app/layout.tsx: массив FONTS (preload) заполнен");
        } else {
          r.add("⚠ app/layout.tsx без маркера proto-forge:fonts — добавьте preload вручную:");
          r.add(preloadList);
        }
      } else {
        r.add("⚠ app/layout.tsx не найден — сниппет preload:");
        r.add(preloadList);
      }
      r.add("");
      r.add("Preload обязателен с crossOrigin=anonymous (CORS-режим даже same-origin).");
      return r.toResult();
    }
  );
}
