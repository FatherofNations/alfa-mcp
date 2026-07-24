import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok } from "../lib/report.js";

/* add_animation — генерирует канон-рецепт из animation-canon под конкретный
   селектор. Значения по умолчанию — канонические, менять только осознанно.
   Тул НЕ пишет в файлы: агент вставляет CSS в нужный файл сам (обычно
   styles/app.css) — так рецепт попадает в правильное место каскада. */

interface Params {
  items?: number;
  delayBase?: number;
  delayStep?: number;
  blur?: number;
  shift?: number;
  radius?: number;
}

const APPEAR = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const STRUCT = "cubic-bezier(0.32, 0.72, 0, 1)";

function staggerVars(selector: string, items: number): string {
  return Array.from(
    { length: items },
    (_, i) => `${selector} > *:nth-child(${i + 1}) { --i: ${i}; }`
  ).join("\n");
}

const RECIPES: Record<string, (sel: string, p: Params) => { css: string; howto: string[] }> = {
  "blur-reveal": (sel, p) => {
    const blur = p.blur ?? 12;
    const shift = p.shift ?? 8;
    return {
      css: `/* канон: появление из блюра (скрытие — асимметрично быстрое) */
${sel} {
  opacity: 1; filter: blur(0); transform: translateY(0);
  transition: opacity 0.5s ${APPEAR}, filter 0.5s ${APPEAR},
              transform 0.55s ${STRUCT};
}
${sel}.hidden {
  opacity: 0; filter: blur(${blur}px); transform: translateY(${shift}px);
  pointer-events: none;
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
  transition-delay: 0s;
}`,
      howto: [
        "Элемент стартует с классом hidden; JS снимает его для проявления (setTimeout/rAF после маунта).",
        "Скрытие — вернуть hidden: быстро (0.22s), без задержки.",
        "ВНИМАНИЕ: filter создаёт контекст наложения — z-index дропдаунов на контейнер выше.",
      ],
    };
  },
  stagger: (sel, p) => {
    const items = p.items ?? 8;
    const base = p.delayBase ?? 120;
    const step = p.delayStep ?? 30;
    return {
      css: `/* канон: стаггер детей сверху вниз (${base}ms + i*${step}ms) */
${sel} > * {
  transition: opacity 0.5s ${APPEAR}, filter 0.5s ${APPEAR},
              transform 0.55s ${STRUCT};
  transition-delay: calc(${base}ms + var(--i, 0) * ${step}ms);
}
${sel}.hidden > * {
  opacity: 0; filter: blur(12px); transform: translateY(8px);
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
  transition-delay: 0s;
}
${staggerVars(sel, items)}`,
      howto: [
        `Контейнер стартует с hidden, JS снимает — дети проявляются каскадом (${items} шт. через nth-child; больше — проставь --i из данных).`,
        "Скрытие всего контейнера — одновременное (без задержек), это канон.",
      ],
    };
  },
  "pane-switch": (sel) => ({
    css: `/* канон: переключение пейнов — оба absolute в одной точке */
${sel} { position: relative; }
${sel} > .pane { position: absolute; inset: 0; }
${sel} > .pane.hidden {
  opacity: 0; filter: blur(12px); transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
}
${sel} > .pane:not(.hidden) {
  transition: opacity 0.5s ${APPEAR}, filter 0.5s ${APPEAR},
              transform 0.55s ${STRUCT};
  transition-delay: 0.12s;
}`,
    howto: [
      "Старому пейну — hidden; НОВОМУ снять hidden сразу (задержка 0.12s уже в CSS).",
      "Если контент подменяется в одном пейне — свап данных строго в момент полной прозрачности (~220ms).",
      "Высоту контейнера держать по активному пейну (JS или min-height).",
    ],
  }),
  "content-dissolve": (sel) => ({
    css: `/* канон: своп целых страниц — растворяется ТОЛЬКО наполнение,
   фрейм (подложка+рамка) неподвижен. См. tools-panel.md (.board-body). */
${sel} {
  transition: opacity 0.5s ${APPEAR}, filter 0.5s ${APPEAR},
              transform 0.55s ${STRUCT};
  transition-delay: 0.12s;
}
${sel}.dash-out {
  opacity: 0; filter: blur(12px); transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.22s ease-in, filter 0.22s ease-in, transform 0.22s ease-in;
  transition-delay: 0s;
}`,
    howto: [
      "Роут менять по таймеру 250ms после навешивания dash-out (контент уже прозрачен).",
      "По приезде снять класс через двойной requestAnimationFrame.",
      "НЕ анимировать равномерным блюром без ухода в 0 — подмена контента видна (проверено).",
    ],
  }),
  "tab-pill": (sel) => ({
    css: `/* канон: скользящая капсула табов */
${sel} { position: absolute; top: 0; bottom: 0; border-radius: 999px;
  transition: left 0.55s ${STRUCT}, width 0.55s ${STRUCT}; }
${sel}.fly { animation: pf-cap-squish 0.55s ${STRUCT}; }
@keyframes pf-cap-squish {
  0% { transform: scaleX(1); } 50% { transform: scaleX(0.9); } 100% { transform: scaleX(1); }
}`,
    howto: [
      "left/width ставить JS-ом по getBoundingClientRect (суб-пиксель, не offsetLeft).",
      "Перемер на document.fonts.ready с временным transition:none (шрифт доехал — ширины изменились).",
      "Класс fly на время перелёта (снять по animationend).",
    ],
  }),
  ticker: (sel) => ({
    css: `/* канон: вертикальный тикер строк */
${sel} { position: relative; overflow: hidden;
  transition: width 0.45s ${STRUCT}; }
${sel} > .line { position: absolute; left: 0; top: 0;
  transition: transform 0.45s ${STRUCT}; }
${sel} > .line.out { transform: translateY(-100%); }
${sel} > .line.in-from-below { transform: translateY(100%); transition: none; }`,
    howto: [
      "Новая строка монтируется с in-from-below, кадром позже transform → 0; старой — out.",
      "Ширину контейнера двигать JS по rect новой строки (плавно за счёт transition width).",
    ],
  }),
  "spin-ring": (sel) => ({
    css: `/* канон: вращающаяся обводка с «передышкой» */
@property --pf-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
${sel} { position: relative; }
${sel}::before {
  content: ""; position: absolute; inset: -2px; border-radius: inherit; padding: 2px;
  background: conic-gradient(from var(--pf-angle), transparent 10%, currentColor 50%, transparent 90%);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: pf-ring-spin 3s linear infinite;
  pointer-events: none;
}
@keyframes pf-ring-spin {
  0% { --pf-angle: 0deg; } 50% { --pf-angle: 360deg; } 100% { --pf-angle: 360deg; }
}`,
    howto: [
      "Цикл: 0→50% оборот, 50→100% пауза; 360deg ≡ 0deg — петля бесшовна.",
      "Цвет обводки — через currentColor родителя.",
    ],
  }),
  magnet: (sel, p) => {
    const radius = p.radius ?? 210;
    return {
      css: `/* канон: магнит к курсору — транслируется одним transform */
${sel} { transform: translate(var(--mx, 0px), var(--my, 0px)); }`,
      howto: [
        `JS: mousemove + rAF-троттл; радиус ${radius}px; смещение dx*0.06*f с clamp ±8/±6px; писать в --mx/--my.`,
        "Выключать при :active и при открытых оверлеях.",
        "Если на элементе есть keyframe с transform (pop) — обнулить --mx/--my ПЕРЕД запуском.",
        "Готовый JS-сниппет — в alfa://knowledge/animation-canon, рецепт 11.",
      ],
    };
  },
  "stream-reveal": (sel) => ({
    css: `/* канон: blur-стриминг текста (блоки + слова) */
${sel} .rv-block {
  opacity: 0; filter: blur(10px); transform: translateY(8px);
  transition: opacity 0.5s ${APPEAR}, filter 0.5s ${APPEAR},
              transform 0.55s ${STRUCT};
}
${sel} .rv-word { opacity: 0; filter: blur(6px);
  transition: opacity 0.35s ease, filter 0.35s ease; }
${sel} .rv-block.in, ${sel} .rv-word.in { opacity: 1; filter: blur(0); transform: none; }`,
    howto: [
      "JS проставляет .in по мере «печати» (блоки ~450ms шагом, слова ~40-60ms).",
      "transform на inline не работает — слова только opacity+blur, подъём на блоке.",
    ],
  }),
};

export function registerAnimations(server: McpServer) {
  server.registerTool(
    "add_animation",
    {
      title: "Канон-анимация под селектор",
      description:
        "Генерирует CSS-рецепт из канона (alfa://knowledge/animation-canon) под " +
        "конкретный селектор + инструкцию подключения. Кривые/тайминги канонические. " +
        "CSS вставь в styles/app.css (или файл страницы).",
      inputSchema: {
        recipe: z
          .enum([
            "blur-reveal", "stagger", "pane-switch", "content-dissolve",
            "tab-pill", "ticker", "spin-ring", "magnet", "stream-reveal",
          ])
          .describe("рецепт из канона"),
        selector: z.string().min(1).describe("CSS-селектор цели (например .feed или .nbar)"),
        params: z
          .object({
            items: z.number().optional().describe("stagger: число детей (default 8)"),
            delayBase: z.number().optional().describe("stagger: база задержки, ms (default 120)"),
            delayStep: z.number().optional().describe("stagger: шаг, ms (default 30)"),
            blur: z.number().optional().describe("blur-reveal: блюр, px (default 12)"),
            shift: z.number().optional().describe("blur-reveal: сдвиг Y, px (default 8)"),
            radius: z.number().optional().describe("magnet: радиус действия, px (default 210)"),
          })
          .default({}),
      },
    },
    async ({ recipe, selector, params }) => {
      const gen = RECIPES[recipe];
      const { css, howto } = gen(selector, params ?? {});
      return ok([
        `# add_animation: ${recipe} → ${selector}`,
        "",
        "```css",
        css,
        "```",
        "",
        "## Подключение",
        ...howto.map((h, i) => `${i + 1}. ${h}`),
        "",
        "Значения канонические — не менять без фиксации в animation-canon.",
      ]);
    }
  );
}
