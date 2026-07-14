import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TEMPLATE_DIR, resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import {
  applyFeatureMarkers,
  applyPlaceholders,
  componentName,
  writeFileEnsured,
} from "../lib/template.js";

/* register_dashboard — новый дашборд в существующий проект: роут,
   компонент-заготовка, карточка в панели (через реестр lib/dashboards.ts).
   swapTo и deep-links подхватывают запись из реестра автоматически. */

export function registerDashboards(server: McpServer) {
  server.registerTool(
    "register_dashboard",
    {
      title: "Новый дашборд в проект",
      description:
        "Создаёт app/<route>/page.tsx + компонент-заготовку и добавляет карточку " +
        "в панель tools (реестр lib/dashboards.ts). Свопы и deep-links подключаются сами.",
      inputSchema: {
        name: z.string().min(1).describe("имя дашборда (id/имя компонента строится из него)"),
        route: z
          .string()
          .regex(/^\/[a-z0-9-]*$/, "роут вида /reports (латиница/цифры/дефис)")
          .describe("путь роута, например /reports"),
        cardTitle: z.string().min(1).describe("заголовок карточки в панели"),
        cardSubtitle: z.string().default("Прототип").describe("подзаголовок карточки"),
        targetDir: z.string().default(".").describe("корень проекта-прототипа"),
      },
    },
    async ({ name, route, cardTitle, cardSubtitle, targetDir }) => {
      const root = resolveInProject(targetDir ?? ".");
      const regPath = path.join(root, "lib/dashboards.ts");
      if (!fs.existsSync(regPath)) {
        return fail(`нет ${regPath} — проект не из шаблона proto-forge (сначала scaffold_project)`);
      }
      if (route === "/") return fail("роут / занят первым дашбордом — выбери /<slug>");
      const reg = fs.readFileSync(regPath, "utf8");
      if (!reg.includes("/* proto-forge:dashboards */")) {
        return fail("в lib/dashboards.ts нет маркера proto-forge:dashboards — добавь запись вручную");
      }
      const slug = route.slice(1);
      const id = slug;
      if (new RegExp(`route:\\s*"${route}"`).test(reg)) {
        return fail(`роут ${route} уже зарегистрирован`);
      }
      const pagePath = path.join(root, `app/${slug}/page.tsx`);
      if (fs.existsSync(pagePath)) return fail(`${pagePath} уже существует`);

      const r = new Report();
      const comp = componentName(slug);
      // фичи проекта уже применены при скаффолде: neuroBar есть, если есть его файлы
      const feats = {
        toolsPanel: true,
        deepLinks: true,
        mobileGate: true,
        neuroBar: fs.existsSync(path.join(root, "components/neuro/NeuroBar.tsx")),
      };
      const vars = { DASH_TITLE: name, DASH_COMPONENT: comp, DASH_ID: id };

      const pageTpl = fs.readFileSync(path.join(TEMPLATE_DIR, "app/__dash__/page.tsx"), "utf8");
      writeFileEnsured(pagePath, applyPlaceholders(pageTpl, vars));
      r.add(`✓ app/${slug}/page.tsx (роут ${route})`);

      const compPath = path.join(root, `components/dashboards/${comp}.tsx`);
      if (!fs.existsSync(compPath)) {
        const dashTpl = applyFeatureMarkers(
          fs.readFileSync(path.join(TEMPLATE_DIR, "components/dashboards/__Dash__.tsx"), "utf8"),
          feats
        );
        writeFileEnsured(compPath, applyPlaceholders(dashTpl, vars));
        r.add(`✓ components/dashboards/${comp}.tsx (заготовка)`);
      } else {
        r.add(`• components/dashboards/${comp}.tsx уже есть — не трогаю`);
      }

      const entry = `  { id: "${id}", route: "${route}", title: "${cardTitle}", subtitle: "${cardSubtitle}" },`;
      fs.writeFileSync(
        regPath,
        reg.replace("  /* proto-forge:dashboards */", `${entry}\n  /* proto-forge:dashboards */`),
        "utf8"
      );
      r.add(`✓ lib/dashboards.ts: карточка «${cardTitle}» добавлена`);
      r.add("");
      r.add("Своп из панели и префетч роута работают из реестра автоматически.");
      r.add(`Дальше: вёрстка по макету в components/dashboards/${comp}.tsx (сначала figma-import + pixel-perfect).`);
      return r.toResult();
    }
  );
}
