import fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { fail, ok } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { parity } from "../lib/parity.js";

/* parity_check — попиксельная сверка рендера с эталоном Figma.

   Два входа:
   1) url + reference (+viewport) — отдаём готовый bash: снять локальный
      скриншот headless-хромом, скачать эталон, сравнить. В командном
      режиме сравнение уезжает на /parity одним curl'ом.
   2) referenceFile + localFile — сравнить уже снятые PNG.

   Эталон берётся из get_screenshot (Figma MCP) — там короткоживущий url. */

const rectsToQuery = (rects: { x: number; y: number; w: number; h: number }[]) =>
  rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";");

export function registerParity(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "parity_check",
    {
      title: "Бленд-дифф: рендер против эталона Figma",
      description:
        "Сверяет отрендеренную страницу с эталонным скриншотом узла Figma и находит то, " +
        "что НЕ ВИДНО ГЛАЗОМ: смещения текстовых ранов (типовой случай — колонка сумм " +
        "уехала на 75px, но выглядит правильной, потому что все суммы одной длины), " +
        "неверный размер шрифта (ширина строки растёт с длиной), потерянные трансформы " +
        "иллюстраций. Отдаёт метрики, карту горячих блоков и список смещений с точностью " +
        "до пикселя. Зови ПОСЛЕ КАЖДОЙ свёрстанной секции, а не один раз в конце: " +
        "ошибка в общем правиле (шрифт, выравнивание ячейки) размножается по всей странице. " +
        "Эталон — url из get_screenshot (Figma MCP).",
      inputSchema: {
        url: z.string().optional().describe("URL локальной страницы, например http://localhost:3000/"),
        reference: z
          .string()
          .optional()
          .describe("URL эталонного PNG из get_screenshot (Figma MCP), живёт недолго"),
        referenceFile: z.string().optional().describe("путь к уже скачанному эталону"),
        localFile: z.string().optional().describe("путь к уже снятому локальному скриншоту"),
        width: z.number().int().default(1600).describe("ширина вьюпорта = ширина фрейма макета"),
        height: z.number().int().default(1000).describe("высота вьюпорта = высота фрейма макета"),
        threshold: z.number().int().default(32).describe("порог |Δ| яркости для «расходится»"),
        ignore: z
          .array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
          .default([])
          .describe(
            "прямоугольники вне сравнения: хром прототипа (FAB панели tools) и зоны " +
              "осознанных отступлений — чтобы они не забивали метрику"
          ),
      },
    },
    async ({ url, reference, referenceFile, localFile, width, height, threshold, ignore }) => {
      const q = new URLSearchParams();
      if (threshold && threshold !== 32) q.set("thr", String(threshold));
      if (ignore?.length) q.set("ignore", rectsToQuery(ignore));

      // ── вход 2: оба файла уже есть ──
      if (referenceFile && localFile) {
        if (ctx.mode === "http") {
          return ok([
            "# parity_check (командный режим): выполни команду",
            "```bash",
            `tar czf /tmp/pf-parity.tgz -C "$(dirname "${referenceFile}")" "$(basename "${referenceFile}")" \\`,
            `  -C "$(dirname "${localFile}")" "$(basename "${localFile}")" \\`,
            `  && curl -fsS -X POST --data-binary @/tmp/pf-parity.tgz \\`,
            `       -H "Content-Type: application/gzip" \\`,
            `       "${ctx.parityUrl}${q.size ? `?${q}` : ""}&ref=$(basename "${referenceFile}")" \\`,
            `  && rm /tmp/pf-parity.tgz`,
            "```",
          ]);
        }
        const a = resolveInProject(referenceFile);
        const b = resolveInProject(localFile);
        if (!fs.existsSync(a)) return fail(`эталон не найден: ${a}`);
        if (!fs.existsSync(b)) return fail(`локальный скриншот не найден: ${b}`);
        const rep = await parity(fs.readFileSync(a), fs.readFileSync(b), {
          threshold,
          ignore: ignore ?? [],
        });
        return ok(rep.lines);
      }

      // ── вход 1: url + эталон ──
      if (!url || !reference) {
        return fail(
          "передай url + reference (URL эталона из get_screenshot), либо " +
            "referenceFile + localFile (уже снятые PNG)"
        );
      }

      const script = [
        "# parity_check: снять оба скриншота и сравнить",
        "```bash",
        'CH="$(ls -d /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\',
        '      /Applications/Chromium.app/Contents/MacOS/Chromium \\',
        '      "$(command -v google-chrome)" "$(command -v chromium)" 2>/dev/null | head -1)"',
        '[ -n "$CH" ] || { echo "headless-браузер не найден"; exit 1; }',
        `curl -fsSL -o /tmp/pf-ref.png "${reference}"`,
        // ревил по канону 0.5s + задержки: ждём, иначе транзишен даст ложный сдвиг
        `curl -fsS -o /dev/null "${url}" && sleep 4`,
        `"$CH" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \\`,
        `  --window-size=${width},${height} --screenshot=/tmp/pf-local.png "${url}" 2>/dev/null`,
      ];
      if (ctx.mode === "http") {
        script.push(
          "tar czf /tmp/pf-parity.tgz -C /tmp pf-ref.png pf-local.png \\",
          `  && curl -fsS -X POST --data-binary @/tmp/pf-parity.tgz \\`,
          `       -H "Content-Type: application/gzip" "${ctx.parityUrl}?ref=pf-ref.png${q.size ? `&${q}` : ""}"`
        );
        script.push("```");
        script.push("");
        script.push("Отчёт вернётся текстом: метрики, горячие блоки, смещения ранов.");
      } else {
        script.push("```");
        script.push("");
        script.push(
          "Дальше позови parity_check ещё раз с " +
            "`referenceFile: \"/tmp/pf-ref.png\", localFile: \"/tmp/pf-local.png\"`."
        );
      }
      script.push("");
      script.push(
        "ВАЖНО: скриншот снимается после паузы — канон-ревил (0.5s + задержки стаггера) " +
          "должен завершиться. Если снять раньше, получишь ложный сдвиг всей страницы " +
          "на несколько px (см. read_knowledge verification)."
      );
      return ok(script);
    }
  );
}
