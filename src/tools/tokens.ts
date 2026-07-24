import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveInProject } from "../lib/paths.js";
import { Report, fail } from "../lib/report.js";
import { ServerCtx } from "../lib/ctx.js";
import { writeFileEnsured } from "../lib/template.js";

/* extract_tokens — styles/tokens.css из выдачи get_variable_defs (Figma MCP).
   Агент передаёт JSON как есть; имена Figma → kebab-case CSS-переменные. */

/* "text/primary" | "Text Primary" | "ls/16 Regular" → "text-primary" */
function toVarName(figmaName: string): string {
  return (
    figmaName
      .trim()
      .replace(/[\/\s_.]+/g, "-")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "token"
  );
}

/* значение переменной Figma → CSS-значение */
function toCssValue(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isInteger(v) ? `${v}px` : `${v}`;
  if (typeof v === "boolean") return null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // {r,g,b,a} в диапазоне 0..1 (формат Figma API)
    if (typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number") {
      const to255 = (x: number) => Math.round(x * 255);
      const a = typeof o.a === "number" ? o.a : 1;
      return a >= 1
        ? `rgb(${to255(o.r)}, ${to255(o.g)}, ${to255(o.b)})`
        : `rgba(${to255(o.r)}, ${to255(o.g)}, ${to255(o.b)}, ${Math.round(a * 100) / 100})`;
    }
    if (typeof o.value !== "undefined") return toCssValue(o.value);
  }
  return null;
}

/* get_variable_defs отдаёт плоский {имя: значение} или вложенные структуры —
   разбираем оба случая. */
function flatten(defs: unknown, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  if (!defs || typeof defs !== "object") return out;
  for (const [key, val] of Object.entries(defs as Record<string, unknown>)) {
    const name = prefix ? `${prefix}/${key}` : key;
    const css = toCssValue(val);
    if (css !== null) out.push([name, css]);
    else if (val && typeof val === "object") out.push(...flatten(val, name));
  }
  return out;
}

export function registerTokens(server: McpServer, ctx: ServerCtx) {
  server.registerTool(
    "extract_tokens",
    {
      title: "Токены Figma → tokens.css",
      description:
        "Конвертирует выдачу get_variable_defs (Figma MCP) в styles/tokens.css: " +
        "CSS-переменные в :root, имена Figma → kebab-case. Передавай JSON как есть.",
      inputSchema: {
        variableDefs: z
          .record(z.string(), z.unknown())
          .describe("выдача get_variable_defs как есть (JSON-объект)"),
        targetDir: z.string().default(".").describe("корень проекта-прототипа"),
        append: z
          .boolean()
          .default(false)
          .describe("true: дописать к существующему tokens.css (default: перезаписать)"),
      },
    },
    async ({ variableDefs, targetDir, append }) => {
      const root = resolveInProject(targetDir ?? ".");
      const pairs = flatten(variableDefs);
      if (pairs.length === 0) {
        return fail("в variableDefs не нашлось ни одного токена — передай выдачу get_variable_defs как есть");
      }
      const r = new Report();

      const seen = new Map<string, string>();
      const dupes: string[] = [];
      for (const [figmaName, css] of pairs) {
        const name = toVarName(figmaName);
        if (seen.has(name) && seen.get(name) !== css) dupes.push(name);
        seen.set(name, css);
      }

      const lines = [...seen.entries()].map(([name, css]) => `  --${name}: ${css};`);
      const body = `/* Токены из Figma variable defs — сгенерировано alfa-mcp extract_tokens.
   Не редактировать руками без нужды: при обновлении макета перегенерировать. */
:root {
${lines.join("\n")}

  --font: 'Alfa Interface Sans', -apple-system, 'SF Pro Text', system-ui,
    'Segoe UI', Roboto, sans-serif;
}
`;
      if (ctx.mode === "http") {
        // файлов агента не видим — отдаём готовый контент
        r.add(`# extract_tokens: ${seen.size} переменных — запиши в styles/tokens.css${append ? " (допиши в конец)" : ""}`);
        r.add("```css");
        r.add(body);
        r.add("```");
        if (dupes.length) {
          r.add(`⚠ конфликтующие имена (взято последнее значение): ${[...new Set(dupes)].join(", ")}`);
        }
        return r.toResult();
      }

      const cssPath = path.join(root, "styles/tokens.css");
      if (append && fs.existsSync(cssPath)) {
        fs.appendFileSync(cssPath, `\n${body}`, "utf8");
        r.add(`✓ styles/tokens.css: дописано ${seen.size} переменных`);
      } else {
        writeFileEnsured(cssPath, body);
        r.add(`✓ styles/tokens.css: записано ${seen.size} переменных`);
      }
      if (dupes.length) {
        r.add(`⚠ конфликтующие имена (взято последнее значение): ${[...new Set(dupes)].join(", ")}`);
      }
      r.add("");
      r.add("Маппинг имён: Figma `text/primary` → CSS `--text-primary`.");
      r.add("Letter-spacing переносится как есть (--ls-*) — не округлять (design-system.md).");
      return r.toResult();
    }
  );
}
