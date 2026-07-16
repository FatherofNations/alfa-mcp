import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { STATIC_TEMPLATE_DIR, TEMPLATE_DIR, resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import {
  DEFAULT_FAMILIES,
  FAMILIES,
  FontFile,
  downloadFont,
  fontFaceCss,
  preloadLinksHtml,
  preloadList,
} from "../lib/fonts-core.js";
import {
  Features,
  applyFeatureMarkers,
  applyPlaceholders,
  componentName,
  isTextFile,
  listFiles,
  slugify,
  writeFileEnsured,
} from "../lib/template.js";
import {
  ACCOUNTANT_BLOCKS,
  applyAccountantNext,
  applyAccountantStatic,
} from "../lib/preset.js";

/* scaffold_project — новый проект-прототип. Два стека (выбор — ЗА
   ПОЛЬЗОВАТЕЛЕМ, агент обязан спросить, см. proto://knowledge/stack-choice):
   - static: чистый HTML/CSS/JS без сборки — максимальная скорость
     pixel-perfect вёрстки;
   - next: Next.js 15 + React — масштабируемость, панель tools,
     deep-links, компоненты core-ds. */

/* записи с "/" на конце — префиксы-директории */
const FEATURE_FILES: Record<keyof Features, string[]> = {
  toolsPanel: [
    "components/tools/ToolsProvider.tsx",
    "components/tools/ToolsPanel.tsx",
    "styles/tools.css",
    "lib/dashboards.ts",
  ],
  mobileGate: ["styles/mobile-gate.css"],
  deepLinks: [],
  chrome: ["components/chrome/AppChrome.tsx", "styles/chrome.css", "public/assets/chrome/"],
};

const STATIC_FEATURE_FILES: Record<keyof Features, string[]> = {
  toolsPanel: [],
  mobileGate: ["styles/mobile-gate.css"],
  deepLinks: [],
  chrome: ["styles/chrome.css", "assets/chrome/"],
};

const skipsFile = (skip: string[], relNorm: string) =>
  skip.some((s) => (s.endsWith("/") ? relNorm.startsWith(s) : relNorm === s));

const PER_DASHBOARD = ["app/__dash__/page.tsx", "components/dashboards/__Dash__.tsx"];

interface ScaffoldArgs {
  name: string;
  title: string;
  dashboards: string[];
  feats: Features;
  installFonts: boolean;
  preset?: "accountant";
  presetBlocks: readonly string[];
}

/* уникальные slug'и дашбордов: первый — роут/страница по умолчанию */
function dashSlugs(dashboards: string[]) {
  const seen = new Set<string>();
  return dashboards.map((dashName, i) => {
    let slug = slugify(dashName);
    while (seen.has(slug)) slug = `${slug}-2`;
    seen.add(slug);
    return { dashName, slug, first: i === 0 };
  });
}

async function installFontsTo(
  fontsDir: string
): Promise<FontFile[]> {
  const wanted = DEFAULT_FAMILIES.flatMap((fam) => FAMILIES[fam]);
  const installed: FontFile[] = [];
  await Promise.all(
    wanted.map(async (f) => {
      const buf = await downloadFont(f);
      if (buf) {
        writeFileEnsured(path.join(fontsDir, f.file), buf);
        installed.push(f);
      }
    })
  );
  return installed.sort((x, y) => x.file.localeCompare(y.file));
}

/* ── Next.js-стек ── */
async function generateNext(projectDir: string, a: ScaffoldArgs, r: Report) {
  const skip: string[] = [...PER_DASHBOARD];
  for (const [flag, files] of Object.entries(FEATURE_FILES)) {
    if (!a.feats[flag as keyof Features]) skip.push(...files);
  }

  const vars = { PROJECT_NAME: a.name, PROJECT_TITLE: a.title };
  let copied = 0;
  for (const rel of listFiles(TEMPLATE_DIR)) {
    const relNorm = rel.split(path.sep).join("/");
    if (skipsFile(skip, relNorm)) continue;
    const src = path.join(TEMPLATE_DIR, rel);
    // _gitignore → .gitignore (npm не пакует настоящие .gitignore)
    const destRel = relNorm === "_gitignore" ? ".gitignore" : relNorm;
    const dest = path.join(projectDir, destRel);
    if (isTextFile(src)) {
      let text = fs.readFileSync(src, "utf8");
      text = applyFeatureMarkers(text, a.feats);
      text = applyPlaceholders(text, vars);
      writeFileEnsured(dest, text);
    } else {
      writeFileEnsured(dest, fs.readFileSync(src));
    }
    copied++;
  }
  r.add(`Скопировано файлов шаблона (next): ${copied}`);

  const pageTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "app/__dash__/page.tsx"), "utf8");
  const dashTpl = applyFeatureMarkers(
    fs.readFileSync(path.join(TEMPLATE_DIR, "components/dashboards/__Dash__.tsx"), "utf8"),
    a.feats
  );
  const entries: string[] = [];
  for (const { dashName, slug, first } of dashSlugs(a.dashboards)) {
    const comp = componentName(slug);
    const route = first ? "/" : `/${slug}`;
    const id = first ? "main" : slug;
    const dvars = { DASH_TITLE: dashName, DASH_COMPONENT: comp, DASH_ID: id };
    writeFileEnsured(
      path.join(projectDir, first ? "app/page.tsx" : `app/${slug}/page.tsx`),
      applyPlaceholders(pageTpl, dvars)
    );
    writeFileEnsured(
      path.join(projectDir, `components/dashboards/${comp}.tsx`),
      applyPlaceholders(dashTpl, dvars)
    );
    entries.push(`  { id: "${id}", route: "${route}", title: "${dashName}", subtitle: "Прототип" },`);
    r.add(`Дашборд «${dashName}»: роут ${route} → components/dashboards/${comp}.tsx`);
  }

  if (a.feats.toolsPanel) {
    const regPath = path.join(projectDir, "lib/dashboards.ts");
    const reg = fs
      .readFileSync(regPath, "utf8")
      .replace("  /* proto-forge:dashboards */", `${entries.join("\n")}\n  /* proto-forge:dashboards */`);
    fs.writeFileSync(regPath, reg, "utf8");
    r.add(`Панель tools: реестр lib/dashboards.ts (${a.dashboards.length} карточек)`);
  }

  if (a.installFonts) {
    const installed = await installFontsTo(path.join(projectDir, "public/fonts"));
    if (installed.length) {
      writeFileEnsured(path.join(projectDir, "styles/fonts.css"), fontFaceCss(installed, "/fonts"));
      const layoutPath = path.join(projectDir, "app/layout.tsx");
      const layout = fs.readFileSync(layoutPath, "utf8");
      fs.writeFileSync(
        layoutPath,
        layout.replace("  /* proto-forge:fonts */", `${preloadList(installed)}\n  /* proto-forge:fonts */`),
        "utf8"
      );
      r.add(`Шрифты core-ds установлены: ${installed.length} woff2 + fonts.css + preload`);
    } else {
      r.add("⚠ шрифты не скачались (сеть?) — поставь позже тулом install_fonts");
    }
  }

  // пресет наполнения — на ПЕРВЫЙ дашборд
  if (a.preset === "accountant") {
    if (!a.feats.chrome) r.add("⚠ пресет рассчитан на chrome (сайдбар+шапка) — включи features.chrome");
    const firstComp = componentName(dashSlugs(a.dashboards)[0].slug);
    r.addAll(applyAccountantNext(projectDir, firstComp, a.presetBlocks));
  }

  r.add("");
  r.add(`Запуск: cd ${a.name} && npm install && npm run dev`);
}

/* ── static-стек: HTML/CSS/JS без сборки ── */
async function generateStatic(projectDir: string, a: ScaffoldArgs, r: Report) {
  if (a.feats.toolsPanel) {
    r.add(
      "⚠ панель tools доступна ТОЛЬКО в next-стеке — пропущена. НЕ мигрируй проект " +
        "на next сам: объясни пользователю, что панель требует react-сборки, и спроси " +
        "явное подтверждение на пересоздание с stack: next."
    );
  }
  const vars = { PROJECT_NAME: a.name, PROJECT_TITLE: a.title };
  const skip: string[] = [];
  for (const [flag, files] of Object.entries(STATIC_FEATURE_FILES)) {
    if (!a.feats[flag as keyof Features]) skip.push(...files);
  }
  let copied = 0;
  for (const rel of listFiles(STATIC_TEMPLATE_DIR)) {
    const relNorm = rel.split(path.sep).join("/");
    if (relNorm === "__dash__.html") continue; // инстанцируется по дашбордам
    if (skipsFile(skip, relNorm)) continue;
    const src = path.join(STATIC_TEMPLATE_DIR, rel);
    const destRel = relNorm === "_gitignore" ? ".gitignore" : relNorm;
    const dest = path.join(projectDir, destRel);
    if (isTextFile(src)) {
      let text = fs.readFileSync(src, "utf8");
      text = applyFeatureMarkers(text, a.feats);
      text = applyPlaceholders(text, vars);
      writeFileEnsured(dest, text);
    } else {
      writeFileEnsured(dest, fs.readFileSync(src));
    }
    copied++;
  }
  r.add(`Скопировано файлов шаблона (static): ${copied}`);

  // шрифты — до генерации страниц (preload-линки вшиваются в html)
  let preloadHtml = "";
  if (a.installFonts) {
    const installed = await installFontsTo(path.join(projectDir, "fonts"));
    if (installed.length) {
      writeFileEnsured(path.join(projectDir, "styles/fonts.css"), fontFaceCss(installed, "../fonts"));
      preloadHtml = preloadLinksHtml(installed, "fonts");
      r.add(`Шрифты core-ds установлены: ${installed.length} woff2 + fonts.css + preload`);
    } else {
      r.add("⚠ шрифты не скачались (сеть?) — поставь позже тулом install_fonts");
    }
  }

  const pageTpl = applyFeatureMarkers(
    fs.readFileSync(path.join(STATIC_TEMPLATE_DIR, "__dash__.html"), "utf8"),
    a.feats
  );
  for (const { dashName, slug, first } of dashSlugs(a.dashboards)) {
    const file = first ? "index.html" : `${slug}.html`;
    let html = applyPlaceholders(pageTpl, { ...vars, DASH_TITLE: dashName });
    if (preloadHtml) {
      html = html.replace("  <!-- proto-forge:fonts -->", `${preloadHtml}\n  <!-- proto-forge:fonts -->`);
    }
    writeFileEnsured(path.join(projectDir, file), html);
    r.add(`Дашборд «${dashName}»: ${file}`);
  }
  fs.mkdirSync(path.join(projectDir, "assets/figma"), { recursive: true });

  // пресет наполнения — на первую страницу (index.html)
  if (a.preset === "accountant") {
    if (!a.feats.chrome) r.add("⚠ пресет рассчитан на chrome (сайдбар+шапка) — включи features.chrome");
    r.addAll(applyAccountantStatic(projectDir, "index.html", a.presetBlocks));
  }

  r.add("");
  r.add(`Запуск: cd ${a.name} && python3 scripts/serve.py (http://localhost:8000)`);
  r.add("Вёрстка прямо в html/styles/app.css — без сборки, F5 показывает правки.");
}

export function registerScaffold(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "scaffold_project",
    {
      title: "Скаффолд проекта-прототипа",
      description:
        "Создаёт новый проект интерактивного прототипа. ПЕРЕД вызовом ОБЯЗАТЕЛЬНО " +
        "спроси пользователя, на каком стеке собирать (параметр stack, сам не выбирай): " +
        "static — чистый HTML/CSS/JS, максимальная скорость pixel-perfect вёрстки; " +
        "next — Next.js 15 + React, масштабируемость, панель tools, deep-links, " +
        "компоненты core-ds. Критерии выбора: proto://knowledge/stack-choice. " +
        "Панель tools (features.toolsPanel, только next) — тоже ТОЛЬКО по явной " +
        "просьбе пользователя. Шрифты дизайн-системы ставятся сразу.",
      inputSchema: {
        stack: z
          .enum(["static", "next"])
          .describe(
            "выбор ПОЛЬЗОВАТЕЛЯ (спроси его, не решай сам): static = HTML/CSS/JS без сборки, next = Next.js/React"
          ),
        name: z.string().min(1).describe("имя проекта = имя создаваемой директории (kebab-case)"),
        title: z.string().optional().describe("человеческий заголовок прототипа (default = name)"),
        dashboards: z
          .array(z.string().min(1))
          .default(["Главная"])
          .describe("имена дашбордов; первый получает / (next) или index.html (static)"),
        features: z
          .object({
            toolsPanel: z
              .boolean()
              .default(false)
              .describe("панель прототипа (только next) — ТОЛЬКО по явной просьбе пользователя"),
            deepLinks: z
              .boolean()
              .default(true)
              .describe("состояние в URL (работает вместе с toolsPanel)"),
            mobileGate: z.boolean().default(true).describe("заглушка <1024px"),
            chrome: z
              .boolean()
              .default(true)
              .describe("базовый хром: боковое меню + шапка на всех страницах (default true)"),
          })
          .default({})
          .describe("фичи шаблона (по умолчанию: без панели, с mobile-gate и хромом)"),
        installFonts: z
          .boolean()
          .default(true)
          .describe("сразу установить шрифты core-ds (default true)"),
        preset: z
          .enum(["accountant"])
          .optional()
          .describe(
            "готовое наполнение ПЕРВОГО дашборда: accountant = главная «Бухгалтера» " +
              "(быстрые действия, баланс, дела в работе, баннеры, табло, лента операций) — " +
              "byte-perfect из проверенного прототипа, собирается мгновенно"
          ),
        presetBlocks: z
          .array(z.enum(["quick-actions", "row1", "tablo", "feed"]))
          .optional()
          .describe("какие блоки пресета взять (default: все, в канонном порядке)"),
      },
    },
    async ({ stack, name, title, dashboards, features, installFonts, preset, presetBlocks }) => {
      const a: ScaffoldArgs = {
        name,
        title: title ?? name,
        dashboards: dashboards?.length ? dashboards : ["Главная"],
        feats: {
          toolsPanel: features?.toolsPanel ?? false,
          deepLinks: features?.deepLinks ?? true,
          mobileGate: features?.mobileGate ?? true,
          chrome: features?.chrome ?? true,
        },
        installFonts: installFonts ?? true,
        preset,
        presetBlocks: presetBlocks?.length
          ? ACCOUNTANT_BLOCKS.filter((b) => presetBlocks.includes(b)) // канонный порядок
          : ACCOUNTANT_BLOCKS,
      };
      const generate = stack === "static" ? generateStatic : generateNext;
      const r = new Report();
      r.add(`# scaffold_project: ${a.name} (стек: ${stack}${preset ? `, пресет: ${preset}` : ""})`);
      r.add(
        `Фичи: ${Object.entries(a.feats).map(([k, v]) => `${k}=${v ? "on" : "off"}`).join(", ")}, шрифты=${a.installFonts ? "да" : "нет"}`
      );
      r.add("");

      if (ctx.mode === "http") {
        // командный хостинг: собираем во временную папку → тарбол → /dl
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-scaffold-"));
        const projectDir = path.join(tmp, a.name);
        await generate(projectDir, a, r);
        const tgz = path.join(tmp, `${a.name}.tgz`);
        execFileSync("tar", ["-C", tmp, "-czf", tgz, a.name]);
        const url = ctx.publish(tgz, `${a.name}.tgz`);
        r.add("");
        r.add("## Развернуть проект (выполни в корне рабочей директории)");
        r.add("```bash");
        r.add(`curl -fsS -o ${a.name}.tgz "${url}" && tar xzf ${a.name}.tgz && rm ${a.name}.tgz`);
        if (stack === "next") r.add(`cd ${a.name} && npm install`);
        r.add("```");
        r.add("Ссылка живёт 30 минут.");
      } else {
        const projectDir = resolveInProject(a.name);
        if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
          return fail(`директория ${projectDir} существует и не пуста — не перезаписываю`);
        }
        await generate(projectDir, a, r);
      }

      r.add("");
      r.add("## Следующие шаги");
      r.add("1. get_variable_defs (Figma MCP) → extract_tokens → styles/tokens.css");
      r.add("2. Перед разбором макета прочитать proto://knowledge/figma-import (быстрый пайплайн ассетов)");
      r.add(
        `3. Ассеты: download_assets (Figma MCP) в ${stack === "next" ? "public/assets/figma" : "assets/figma"} → process_assets`
      );
      r.add(
        stack === "next"
          ? "4. npm run dev; перед сдачей — npm run verify + get_checklist(qa)"
          : "4. python3 scripts/serve.py; перед сдачей — get_checklist(qa)"
      );
      return r.toResult();
    }
  );
}
