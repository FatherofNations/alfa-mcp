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
  applyFeatureMarkers,
  applyPlaceholders,
  componentName,
  writeFileEnsured,
} from "../lib/template.js";
import { ACCOUNTANT_BLOCKS, applyAccountantNext, applyAccountantStatic } from "../lib/preset.js";

/* register_dashboard — новый дашборд в существующий проект: роут,
   компонент-заготовка; при включённой панели tools — карточка в реестре
   lib/dashboards.ts (свопы и deep-links подхватываются сами). */

function renderFiles(nameArg: string, route: string, hasToolsPanel: boolean) {
  const slug = route.slice(1);
  const comp = componentName(slug);
  const feats = { toolsPanel: hasToolsPanel, deepLinks: true, mobileGate: true, chrome: true };
  const vars = { DASH_TITLE: nameArg, DASH_COMPONENT: comp, DASH_ID: slug };
  const page = applyPlaceholders(
    fs.readFileSync(path.join(TEMPLATE_DIR, "app/__dash__/page.tsx"), "utf8"),
    vars
  );
  const dash = applyPlaceholders(
    applyFeatureMarkers(
      fs.readFileSync(path.join(TEMPLATE_DIR, "components/dashboards/__Dash__.tsx"), "utf8"),
      feats
    ),
    vars
  );
  return { slug, comp, page, dash };
}

export function registerDashboards(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "register_dashboard",
    {
      title: "Новый дашборд в проект",
      description:
        "Создаёт app/<route>/page.tsx + компонент-заготовку; если в проекте есть " +
        "панель tools — добавляет карточку в реестр (свопы/deep-links сами). " +
        "preset: accountant — вместо заготовки сразу готовая главная «Бухгалтера» " +
        "(в командном режиме пресет доступен для next; static — через scaffold_project).",
      inputSchema: {
        name: z.string().min(1).describe("имя дашборда (заголовок страницы/карточки)"),
        route: z
          .string()
          .regex(/^\/[a-z0-9-]+$/, "роут вида /reports (латиница/цифры/дефис)")
          .describe("путь роута, например /reports"),
        cardTitle: z.string().optional().describe("заголовок карточки в панели (default = name)"),
        cardSubtitle: z.string().default("Прототип").describe("подзаголовок карточки"),
        targetDir: z.string().default(".").describe("корень проекта-прототипа"),
        preset: z
          .enum(["accountant"])
          .optional()
          .describe("готовое наполнение вместо заготовки (главная «Бухгалтера»)"),
        presetBlocks: z
          .array(z.enum(["quick-actions", "row1", "tablo", "feed"]))
          .optional()
          .describe("какие блоки пресета взять (default: все)"),
      },
    },
    async ({ name, route, cardTitle, cardSubtitle, targetDir, preset, presetBlocks }) => {
      const blocks = presetBlocks?.length
        ? ACCOUNTANT_BLOCKS.filter((b) => presetBlocks.includes(b))
        : ACCOUNTANT_BLOCKS;
      const title = cardTitle ?? name;
      const entry = `  { id: "${route.slice(1)}", route: "${route}", title: "${title}", subtitle: "${cardSubtitle}" },`;

      if (ctx.mode === "http") {
        const { slug, comp, page, dash } = renderFiles(name, route, true);

        // пресет: файлов много (компонент + css + 27 ассетов) — тарбол через /dl
        if (preset === "accountant") {
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-dash-"));
          writeFileEnsured(path.join(tmp, `app/${slug}/page.tsx`), page);
          const applied = applyAccountantNext(tmp, comp, blocks);
          const tgz = path.join(tmp, `${slug}-preset.tgz`);
          execFileSync("tar", ["-C", tmp, "-czf", tgz, "app", "components", "styles", "public"]);
          const url = ctx.publish(tgz, `${slug}-preset.tgz`);
          const r = new Report();
          r.add(`# register_dashboard «${name}» → ${route} (пресет accountant, next-стек)`);
          r.addAll(applied);
          r.add("");
          r.add("## Развернуть (выполни в КОРНЕ проекта)");
          r.add("```bash");
          r.add(`curl -fsS -o dash.tgz "${url}" && tar xzf dash.tgz && rm dash.tgz`);
          r.add("```");
          r.add("Если в проекте есть панель tools — в lib/dashboards.ts вставь ПЕРЕД маркером `/* proto-forge:dashboards */`:");
          r.add("```ts");
          r.add(entry);
          r.add("```");
          return r.toResult();
        }

        // файлов агента не видим — отдаём контент файлов и точную правку
        const r = new Report();
        r.add(`# register_dashboard «${name}» → ${route} (командный режим)`);
        r.add("");
        r.add(`1. Запиши в app/${slug}/page.tsx:`);
        r.add("```tsx");
        r.add(page);
        r.add("```");
        r.add(`2. Запиши в components/dashboards/${comp}.tsx:`);
        r.add("```tsx");
        r.add(dash);
        r.add("```");
        r.add("3. Если в проекте есть панель tools — в lib/dashboards.ts вставь ПЕРЕД строкой-маркером `/* proto-forge:dashboards */`:");
        r.add("```ts");
        r.add(entry);
        r.add("```");
        return r.toResult();
      }

      const root = resolveInProject(targetDir ?? ".");

      // static-проект (index.html в корне, без app/): новая страница <slug>.html
      if (fs.existsSync(path.join(root, "index.html")) && !fs.existsSync(path.join(root, "app"))) {
        const slug = route.slice(1);
        const htmlPath = path.join(root, `${slug}.html`);
        if (fs.existsSync(htmlPath)) return fail(`${htmlPath} уже существует`);
        const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
        let html = applyPlaceholders(
          applyFeatureMarkers(
            fs.readFileSync(path.join(STATIC_TEMPLATE_DIR, "__dash__.html"), "utf8"),
            {
              toolsPanel: false,
              deepLinks: false,
              // фичи наследуем от index.html существующего проекта
              mobileGate: /mobile-gate\.css/.test(indexHtml),
              chrome: /chrome-side/.test(indexHtml),
            }
          ),
          { DASH_TITLE: name, PROJECT_TITLE: name }
        );
        // preload-линки шрифтов — те же, что в index.html
        const preloads = indexHtml.match(/^\s*<link rel="preload"[^>]*>$/gm) ?? [];
        if (preloads.length) {
          html = html.replace("  <!-- proto-forge:fonts -->", `${preloads.join("\n")}\n  <!-- proto-forge:fonts -->`);
        }
        writeFileEnsured(htmlPath, html);
        const r = new Report();
        r.add(`✓ ${slug}.html — страница «${name}» (static-стек)`);
        if (preset === "accountant") {
          r.addAll(applyAccountantStatic(root, `${slug}.html`, blocks));
        }
        r.add(`Открывается по http://localhost:8000/${slug}.html; ссылки между страницами добавь в разметке.`);
        return r.toResult();
      }

      const pagePath = path.join(root, `app/${route.slice(1)}/page.tsx`);
      if (!fs.existsSync(path.join(root, "app"))) {
        return fail(`нет ${root}/app — проект не из шаблона proto-forge (сначала scaffold_project)`);
      }
      if (fs.existsSync(pagePath)) return fail(`${pagePath} уже существует`);

      const regPath = path.join(root, "lib/dashboards.ts");
      const hasPanel = fs.existsSync(regPath);
      const { slug, comp, page, dash } = renderFiles(name, route, hasPanel);
      const r = new Report();

      writeFileEnsured(pagePath, page);
      r.add(`✓ app/${slug}/page.tsx (роут ${route})`);

      const compPath = path.join(root, `components/dashboards/${comp}.tsx`);
      if (preset === "accountant") {
        r.addAll(applyAccountantNext(root, comp, blocks));
      } else if (!fs.existsSync(compPath)) {
        writeFileEnsured(compPath, dash);
        r.add(`✓ components/dashboards/${comp}.tsx (заготовка)`);
      } else {
        r.add(`• components/dashboards/${comp}.tsx уже есть — не трогаю`);
      }

      if (hasPanel) {
        const reg = fs.readFileSync(regPath, "utf8");
        if (new RegExp(`route:\\s*"${route}"`).test(reg)) {
          r.add(`• роут ${route} уже в реестре — не дублирую`);
        } else if (reg.includes("/* proto-forge:dashboards */")) {
          fs.writeFileSync(
            regPath,
            reg.replace("  /* proto-forge:dashboards */", `${entry}\n  /* proto-forge:dashboards */`),
            "utf8"
          );
          r.add(`✓ lib/dashboards.ts: карточка «${title}» добавлена (своп/префетч — сами)`);
        } else {
          r.add("⚠ в lib/dashboards.ts нет маркера proto-forge:dashboards — добавь запись вручную:");
          r.add(entry);
        }
      } else {
        r.add("• панели tools в проекте нет — реестр не трогаю (роут доступен по URL)");
      }
      r.add("");
      r.add(`Дальше: вёрстка по макету в components/dashboards/${comp}.tsx (figma-import + pixel-perfect).`);
      return r.toResult();
    }
  );
}
