import fs from "node:fs";
import path from "node:path";
import { sanitizeSvg } from "./svg.js";
import { analyzePng, floodFillClean, getSharp, roundedMask, toWebpIfSmaller } from "./images.js";

/* Пост-процессинг папки ассетов, скачанных официальным Figma MCP
   (download_assets). Одна операция на всю папку — ключ к скорости:
   агент не гоняет чистки по файлу.

   SVG: санитайзер (CSS-переменные → цвет, фоновые path, предупреждения).
   PNG: детект пустых экспортов (alpha=0 / 1×1) → в отчёт с советом;
        опционально flood-fill чистка фона и rounded-маска (по именам);
        lossless WebP, если он меньше (png при этом удаляется — ссылки
        в коде ещё не написаны, переименование безопасно). */

export interface ProcessOptions {
  webp?: boolean; // default true
  cleanBackground?: string[]; // basenames (без расширения) для flood-fill
  rounded?: { file: string; radius: number }[]; // basenames для маски
}

export async function processAssetsDir(
  dir: string,
  opts: ProcessOptions = {}
): Promise<string[]> {
  const report: string[] = [];
  const webp = opts.webp !== false;
  const cleanSet = new Set((opts.cleanBackground ?? []).map((n) => n.replace(/\.\w+$/, "")));
  const roundedMap = new Map(
    (opts.rounded ?? []).map((r) => [r.file.replace(/\.\w+$/, ""), r.radius])
  );
  if (!fs.existsSync(dir)) return [`✗ нет директории ${dir}`];
  // скрытые и служебные файлы (в т.ч. macOS AppleDouble ._* из tar) не трогаем
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("_") && !f.startsWith("."));
  if (!(await getSharp())) report.push("⚠ sharp недоступен — PNG-обработка пропущена");

  for (const file of files.sort()) {
    const p = path.join(dir, file);
    if (!fs.statSync(p).isFile()) continue;
    const base = file.replace(/\.\w+$/, "");
    const ext = path.extname(file).toLowerCase();

    if (ext === ".svg") {
      const { svg, changes, warnings } = sanitizeSvg(fs.readFileSync(p, "utf8"));
      if (changes.length) fs.writeFileSync(p, svg, "utf8");
      report.push(`${changes.length ? "✓" : "•"} ${file}${changes.length ? ` — ${changes.join("; ")}` : " — чисто"}`);
      warnings.forEach((w) => report.push(`  ⚠ ${w}`));
      continue;
    }

    if (ext === ".png") {
      // битый/не-png файл не должен валить всю пачку — ошибка пофайлово
      try {
      let buf: Buffer = fs.readFileSync(p);
      const analysis = await analyzePng(buf);
      if (analysis?.empty) {
        report.push(
          `✗ ${file}: ПУСТОЙ экспорт (${analysis.width}×${analysis.height}) — перевыгрузи ` +
            "узел-родитель через download_assets и обрежь (proto://knowledge/figma-import)"
        );
        continue;
      }
      const applied: string[] = [];
      if (cleanSet.has(base)) {
        const cleaned = await floodFillClean(buf);
        if (cleaned) {
          buf = cleaned;
          applied.push("flood-fill чистка фона");
        }
      }
      if (roundedMap.has(base)) {
        const masked = await roundedMask(buf, roundedMap.get(base)!);
        if (masked) {
          buf = masked;
          applied.push(`rounded-маска r=${roundedMap.get(base)}`);
        }
      }
      if (applied.length) fs.writeFileSync(p, buf);
      if (webp) {
        const w = await toWebpIfSmaller(buf);
        if (w) {
          fs.writeFileSync(path.join(dir, `${base}.webp`), w);
          fs.unlinkSync(p);
          applied.push(
            `→ ${base}.webp (${(w.length / 1024).toFixed(1)} KB, было ${(buf.length / 1024).toFixed(1)} KB png)`
          );
        }
      }
      report.push(
        `${applied.length ? "✓" : "•"} ${file}${analysis ? ` (${analysis.width}×${analysis.height})` : ""}${applied.length ? ` — ${applied.join("; ")}` : ""}`
      );
      } catch (e) {
        report.push(`✗ ${file}: не обработан (${e instanceof Error ? e.message : e}) — файл оставлен как есть`);
      }
      continue;
    }

    report.push(`• ${file} — без обработки`);
  }
  if (files.length === 0) report.push("(папка пуста)");
  return report;
}
