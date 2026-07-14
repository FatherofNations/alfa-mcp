import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TEMPLATE_DIR, resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
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
   nefor-dash): панель tools, канон анимаций, verify, CI, vercel.json. */

// файлы, существующие только при включённой фиче
const FEATURE_FILES: Record<keyof Features, string[]> = {
  toolsPanel: ["components/tools/ToolsProvider.tsx", "components/tools/ToolsPanel.tsx", "styles/tools.css"],
  neuroBar: ["components/neuro/NeuroBar.tsx", "components/neuro/useNeuroBar.ts", "styles/neuro.css"],
  mobileGate: ["styles/mobile-gate.css"],
  deepLinks: [],
};

// шаблоны-заготовки: инстанцируются по дашбордам, не копируются как есть
const PER_DASHBOARD = ["app/__dash__/page.tsx", "components/dashboards/__Dash__.tsx"];

export function registerScaffold(server: McpServer) {
  server.registerTool(
    "scaffold_project",
    {
      title: "Скаффолд проекта-прототипа",
      description:
        "Создаёт новый проект интерактивного прототипа из шаблона proto-forge " +
        "(Next.js 15, панель tools, канон анимаций, deep-links, verify, CI). " +
        "После скаффолда: install_fonts → extract_tokens → вёрстка по гайдам.",
      inputSchema: {
        name: z.string().min(1).describe("имя проекта = имя создаваемой директории (kebab-case)"),
        title: z.string().optional().describe("человеческий заголовок прототипа (default = name)"),
        dashboards: z
          .array(z.string().min(1))
          .min(1)
          .describe("имена дашбордов-заготовок; первый получает роут /"),
        features: z
          .object({
            toolsPanel: z.boolean().default(true).describe("панель прототипа"),
            neuroBar: z.boolean().default(false).describe("модуль умной строки"),
            deepLinks: z.boolean().default(true).describe("состояние в URL"),
            mobileGate: z.boolean().default(true).describe("заглушка <1024px"),
          })
          .default({})
          .describe("фичи шаблона"),
      },
    },
    async ({ name, title, dashboards, features }) => {
      const feats: Features = {
        toolsPanel: features?.toolsPanel ?? true,
        neuroBar: features?.neuroBar ?? false,
        deepLinks: features?.deepLinks ?? true,
        mobileGate: features?.mobileGate ?? true,
      };
      const projectDir = resolveInProject(name);
      if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
        return fail(`директория ${projectDir} существует и не пуста — не перезаписываю`);
      }
      const projectTitle = title ?? name;
      const r = new Report();
      r.add(`# scaffold_project → ${projectDir}`);
      r.add(`Фичи: ${Object.entries(feats).map(([k, v]) => `${k}=${v ? "on" : "off"}`).join(", ")}`);
      r.add("");

      // отключённые фичи: их файлы и заготовки не копируем
      const skip = new Set<string>(PER_DASHBOARD);
      for (const [flag, files] of Object.entries(FEATURE_FILES)) {
        if (!feats[flag as keyof Features]) files.forEach((f) => skip.add(f));
      }

      const vars = { PROJECT_NAME: name, PROJECT_TITLE: projectTitle };
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
          text = applyFeatureMarkers(text, feats);
          text = applyPlaceholders(text, vars);
          writeFileEnsured(dest, text);
        } else {
          writeFileEnsured(dest, fs.readFileSync(src));
        }
        copied++;
      }
      r.add(`Скопировано файлов шаблона: ${copied}`);

      // ── дашборды: роут + компонент на каждый, реестр для панели ──
      const pageTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "app/__dash__/page.tsx"), "utf8");
      const dashTpl = applyFeatureMarkers(
        fs.readFileSync(path.join(TEMPLATE_DIR, "components/dashboards/__Dash__.tsx"), "utf8"),
        feats
      );
      const entries: string[] = [];
      const seen = new Set<string>();
      dashboards.forEach((dashName, i) => {
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
        entries.push(
          `  { id: "${id}", route: "${route}", title: "${dashName}", subtitle: "Прототип" },`
        );
        r.add(`Дашборд «${dashName}»: роут ${route} → components/dashboards/${comp}.tsx`);
      });

      // реестр: подставляем записи в lib/dashboards.ts
      const regPath = path.join(projectDir, "lib/dashboards.ts");
      const reg = fs
        .readFileSync(regPath, "utf8")
        .replace("  /* proto-forge:dashboards */", `${entries.join("\n")}\n  /* proto-forge:dashboards */`);
      fs.writeFileSync(regPath, reg, "utf8");
      r.add(`Реестр дашбордов: lib/dashboards.ts (${dashboards.length} шт.)`);

      r.add("");
      r.add("## Следующие шаги");
      r.add(`1. cd ${name} && npm install`);
      r.add("2. install_fonts — шрифты дизайн-системы (core-ds)");
      r.add("3. get_variable_defs (Figma MCP) → extract_tokens → styles/tokens.css");
      r.add("4. Перед разбором макета прочитать proto://knowledge/figma-import");
      r.add("5. npm run dev; перед сдачей — npm run verify + get_checklist(qa)");
      return r.toResult();
    }
  );
}
