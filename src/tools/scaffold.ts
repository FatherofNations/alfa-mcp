import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TEMPLATE_DIR, resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { DEFAULT_FAMILIES, FAMILIES, downloadFont, fontFaceCss, preloadList } from "../lib/fonts-core.js";
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

/* scaffold_project — новый проект-прототип из шаблона (обобщённый
   nefor-dash). Базовая настройка максимально лёгкая: достаточно name —
   шрифты дизайн-системы ставятся сразу, дашборд один («Главная»).
   Панель tools — ТОЛЬКО по явной просьбе пользователя. */

const FEATURE_FILES: Record<keyof Features, string[]> = {
  toolsPanel: [
    "components/tools/ToolsProvider.tsx",
    "components/tools/ToolsPanel.tsx",
    "styles/tools.css",
    "lib/dashboards.ts",
  ],
  mobileGate: ["styles/mobile-gate.css"],
  deepLinks: [],
};

const PER_DASHBOARD = ["app/__dash__/page.tsx", "components/dashboards/__Dash__.tsx"];

interface ScaffoldArgs {
  name: string;
  title: string;
  dashboards: string[];
  feats: Features;
  installFonts: boolean;
}

/* Генерация проекта в указанную директорию (общая для stdio и http). */
async function generate(projectDir: string, a: ScaffoldArgs, r: Report) {
  const skip = new Set<string>(PER_DASHBOARD);
  for (const [flag, files] of Object.entries(FEATURE_FILES)) {
    if (!a.feats[flag as keyof Features]) files.forEach((f) => skip.add(f));
  }

  const vars = { PROJECT_NAME: a.name, PROJECT_TITLE: a.title };
  let copied = 0;
  for (const rel of listFiles(TEMPLATE_DIR)) {
    const relNorm = rel.split(path.sep).join("/");
    if (skip.has(relNorm)) continue;
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
  r.add(`Скопировано файлов шаблона: ${copied}`);

  // ── дашборды ──
  const pageTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "app/__dash__/page.tsx"), "utf8");
  const dashTpl = applyFeatureMarkers(
    fs.readFileSync(path.join(TEMPLATE_DIR, "components/dashboards/__Dash__.tsx"), "utf8"),
    a.feats
  );
  const entries: string[] = [];
  const seen = new Set<string>();
  a.dashboards.forEach((dashName, i) => {
    let slug = slugify(dashName);
    while (seen.has(slug)) slug = `${slug}-2`;
    seen.add(slug);
    const comp = componentName(slug);
    const route = i === 0 ? "/" : `/${slug}`;
    const id = i === 0 ? "main" : slug;
    const dvars = { DASH_TITLE: dashName, DASH_COMPONENT: comp, DASH_ID: id };
    writeFileEnsured(
      path.join(projectDir, i === 0 ? "app/page.tsx" : `app/${slug}/page.tsx`),
      applyPlaceholders(pageTpl, dvars)
    );
    writeFileEnsured(
      path.join(projectDir, `components/dashboards/${comp}.tsx`),
      applyPlaceholders(dashTpl, dvars)
    );
    entries.push(`  { id: "${id}", route: "${route}", title: "${dashName}", subtitle: "Прототип" },`);
    r.add(`Дашборд «${dashName}»: роут ${route} → components/dashboards/${comp}.tsx`);
  });

  // реестр — только при включённой панели (без неё список не нужен)
  if (a.feats.toolsPanel) {
    const regPath = path.join(projectDir, "lib/dashboards.ts");
    const reg = fs
      .readFileSync(regPath, "utf8")
      .replace("  /* proto-forge:dashboards */", `${entries.join("\n")}\n  /* proto-forge:dashboards */`);
    fs.writeFileSync(regPath, reg, "utf8");
    r.add(`Панель tools: реестр lib/dashboards.ts (${a.dashboards.length} карточек)`);
  }

  // ── шрифты дизайн-системы: сразу, чтобы не было отдельного шага ──
  if (a.installFonts) {
    const wanted = DEFAULT_FAMILIES.flatMap((fam) => FAMILIES[fam]);
    const installed: typeof wanted = [];
    await Promise.all(
      wanted.map(async (f) => {
        const buf = await downloadFont(f);
        if (buf) {
          writeFileEnsured(path.join(projectDir, "public/fonts", f.file), buf);
          installed.push(f);
        }
      })
    );
    if (installed.length) {
      installed.sort((x, y) => x.file.localeCompare(y.file));
      writeFileEnsured(path.join(projectDir, "styles/fonts.css"), fontFaceCss(installed));
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
}

export function registerScaffold(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "scaffold_project",
    {
      title: "Скаффолд проекта-прототипа",
      description:
        "Создаёт новый проект интерактивного прототипа из шаблона proto-forge " +
        "(Next.js 15, канон анимаций, шрифты дизайн-системы, verify, CI). " +
        "Достаточно передать name. ВАЖНО: features.toolsPanel (панель " +
        "переключения состояний) включать ТОЛЬКО если пользователь явно " +
        "попросил панель — по умолчанию её нет.",
      inputSchema: {
        name: z.string().min(1).describe("имя проекта = имя создаваемой директории (kebab-case)"),
        title: z.string().optional().describe("человеческий заголовок прототипа (default = name)"),
        dashboards: z
          .array(z.string().min(1))
          .default(["Главная"])
          .describe("имена дашбордов; первый получает роут / (default: один «Главная»)"),
        features: z
          .object({
            toolsPanel: z
              .boolean()
              .default(false)
              .describe("панель прототипа — ТОЛЬКО по явной просьбе пользователя"),
            deepLinks: z
              .boolean()
              .default(true)
              .describe("состояние в URL (работает вместе с toolsPanel)"),
            mobileGate: z.boolean().default(true).describe("заглушка <1024px"),
          })
          .default({})
          .describe("фичи шаблона (по умолчанию: без панели, с mobile-gate)"),
        installFonts: z
          .boolean()
          .default(true)
          .describe("сразу установить шрифты core-ds (default true)"),
      },
    },
    async ({ name, title, dashboards, features, installFonts }) => {
      const a: ScaffoldArgs = {
        name,
        title: title ?? name,
        dashboards: dashboards?.length ? dashboards : ["Главная"],
        feats: {
          toolsPanel: features?.toolsPanel ?? false,
          deepLinks: features?.deepLinks ?? true,
          mobileGate: features?.mobileGate ?? true,
        },
        installFonts: installFonts ?? true,
      };
      const r = new Report();
      r.add(`# scaffold_project: ${a.name}`);
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
        r.add(`cd ${a.name} && npm install`);
        r.add("```");
        r.add("Ссылка одноразовая по смыслу и живёт 30 минут.");
      } else {
        const projectDir = resolveInProject(a.name);
        if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
          return fail(`директория ${projectDir} существует и не пуста — не перезаписываю`);
        }
        await generate(projectDir, a, r);
        r.add("");
        r.add(`Проект создан: ${projectDir}. Дальше: cd ${a.name} && npm install`);
      }

      r.add("");
      r.add("## Следующие шаги");
      r.add("1. get_variable_defs (Figma MCP) → extract_tokens → styles/tokens.css");
      r.add("2. Перед разбором макета прочитать proto://knowledge/figma-import (быстрый пайплайн ассетов)");
      r.add("3. Ассеты: download_assets (Figma MCP) в public/assets/figma → process_assets");
      r.add("4. npm run dev; перед сдачей — npm run verify + get_checklist(qa)");
      return r.toResult();
    }
  );
}
