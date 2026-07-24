import fs from "node:fs";
import path from "node:path";
import { PKG_ROOT } from "./paths.js";
import { writeFileEnsured } from "./template.js";

/* Пресеты наполнения дашбордов — готовые byte-perfect блоки из проверенных
   прототипов (сейчас один: «accountant» — главная дашборда «Бухгалтер» из
   nefor-dash /current). Блоки хранятся в blocks/<preset>/ единым источником
   для обоих стеков: html-фрагменты + blocks.css + assets. */

export const BLOCKS_DIR = path.join(PKG_ROOT, "blocks");

export const ACCOUNTANT_BLOCKS = ["quick-actions", "row1", "tablo", "feed"] as const;
export type AccountantBlock = (typeof ACCOUNTANT_BLOCKS)[number];

const dir = () => path.join(BLOCKS_DIR, "accountant");

function readBlocks(blocks: readonly string[]): string {
  return blocks
    .map((b) => fs.readFileSync(path.join(dir(), `${b}.html`), "utf8").trim())
    .join("\n\n");
}

function copyAssets(destDir: string): number {
  const src = path.join(dir(), "assets");
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    writeFileEnsured(path.join(destDir, f), fs.readFileSync(path.join(src, f)));
    n++;
  }
  return n;
}

/* ── next-стек ──
   Компонент дашборда заменяется на memo + dangerouslySetInnerHTML из
   сгенерированного модуля (методика react-patterns: byte-perfect партиалы). */
export function applyAccountantNext(
  projectDir: string,
  comp: string,
  blocks: readonly string[]
): string[] {
  const report: string[] = [];
  const html = readBlocks(blocks);
  const assets = copyAssets(path.join(projectDir, "public/assets/accountant"));
  report.push(`✓ ассеты пресета: public/assets/accountant (${assets} файлов)`);

  writeFileEnsured(
    path.join(projectDir, "styles/accountant.css"),
    fs.readFileSync(path.join(dir(), "blocks.css"), "utf8")
  );
  report.push("✓ styles/accountant.css (стили блоков, скоуп cur-*)");

  const escaped = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  writeFileEnsured(
    path.join(projectDir, "components/dashboards/accountantHtml.ts"),
    `/* АВТОГЕН alfa-mcp (пресет accountant) — byte-perfect блоки главной
   «Бухгалтера». Правки контента — прямо в этой разметке (или через
   register_dashboard/пресет заново). Блоки: ${blocks.join(", ")}. */

export const ACCOUNTANT_HTML = \`${escaped}\`;
`
  );
  report.push("✓ components/dashboards/accountantHtml.ts (byte-perfect блоки)");

  writeFileEnsured(
    path.join(projectDir, `components/dashboards/${comp}.tsx`),
    `"use client";
import { memo } from "react";
import BodyClass from "@/components/BodyClass";
import { ACCOUNTANT_HTML } from "./accountantHtml";
import "@/styles/accountant.css";

/* Дашборд из пресета «accountant»: контент инжектится byte-perfect
   (см. alfa://knowledge/react-patterns). memo ОБЯЗАТЕЛЕН — иначе апдейт
   контекста tools пере-инжектит статику. body.cur — min-width 1600. */

function ${comp}Inner() {
  return (
    <>
      <BodyClass name="cur" />
      <main className="cur-main">
        <div
          className="cur-content"
          dangerouslySetInnerHTML={{ __html: ACCOUNTANT_HTML }}
        />
      </main>
    </>
  );
}

export default memo(${comp}Inner);
`
  );
  report.push(`✓ components/dashboards/${comp}.tsx заменён на пресет (memo + партиал)`);
  return report;
}

/* ── static-стек ──
   В готовой странице подменяется <main>-заглушка, подключается css,
   на body вешается класс cur. Пути ассетов — относительные. */
export function applyAccountantStatic(
  projectDir: string,
  pageFile: string,
  blocks: readonly string[]
): string[] {
  const report: string[] = [];
  const assets = copyAssets(path.join(projectDir, "assets/accountant"));
  report.push(`✓ ассеты пресета: assets/accountant (${assets} файлов)`);

  writeFileEnsured(
    path.join(projectDir, "styles/accountant.css"),
    fs
      .readFileSync(path.join(dir(), "blocks.css"), "utf8")
      .replace(/url\(\/assets\/accountant\//g, "url(../assets/accountant/")
  );
  report.push("✓ styles/accountant.css (относительные пути)");

  const html = readBlocks(blocks).replace(/src="\/assets\/accountant\//g, 'src="assets/accountant/');
  const pagePath = path.join(projectDir, pageFile);
  let page = fs.readFileSync(pagePath, "utf8");
  page = page.replace(
    '  <link rel="stylesheet" href="styles/app.css">',
    '  <link rel="stylesheet" href="styles/app.css">\n  <link rel="stylesheet" href="styles/accountant.css">'
  );
  page = page.replace("<body>", '<body class="cur">');
  // заглушку <main>…</main> целиком заменяем контентом пресета
  page = page.replace(
    /  <main class="page chrome-main">[\s\S]*?<\/main>/,
    `  <main class="cur-main">\n    <div class="cur-content">\n${html
      .split("\n")
      .map((l) => (l ? `      ${l}` : l))
      .join("\n")}\n    </div>\n  </main>`
  );
  fs.writeFileSync(pagePath, page, "utf8");
  report.push(`✓ ${pageFile}: заглушка заменена блоками (${blocks.join(", ")})`);
  return report;
}
