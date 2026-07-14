import fs from "node:fs";
import path from "node:path";

/* Обработка шаблона: копирование дерева, подстановка плейсхолдеров,
   фич-маркеры proto:if / proto:else / proto:endif (построчно, работают
   в TS/TSX/CSS — маркер должен быть отдельной строкой в любом виде
   комментария: /* … *​/, // …, {/* … *​/}). */

export type Features = {
  toolsPanel: boolean;
  neuroBar: boolean;
  deepLinks: boolean;
  mobileGate: boolean;
};

const IF_RE = /proto:if\s+([a-zA-Z]+)/;
const ELSE_RE = /proto:else\b/;
const ENDIF_RE = /proto:endif\b/;

/* Вырезает блоки выключенных фич, у включённых убирает строки-маркеры. */
export function applyFeatureMarkers(src: string, features: Features): string {
  const out: string[] = [];
  // стек условий: активна ли текущая ветка
  const stack: { keep: boolean; seenElse: boolean }[] = [];
  const active = () => stack.every((s) => s.keep);

  for (const line of src.split("\n")) {
    const ifm = line.match(IF_RE);
    if (ifm) {
      const flag = ifm[1] as keyof Features;
      stack.push({ keep: features[flag] ?? true, seenElse: false });
      continue; // строка-маркер не попадает в результат
    }
    if (ELSE_RE.test(line) && stack.length) {
      const top = stack[stack.length - 1];
      if (!top.seenElse) {
        top.keep = !top.keep;
        top.seenElse = true;
      }
      continue;
    }
    if (ENDIF_RE.test(line) && stack.length) {
      stack.pop();
      continue;
    }
    if (active()) out.push(line);
  }
  return out.join("\n");
}

export function applyPlaceholders(src: string, vars: Record<string, string>): string {
  let s = src;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`__${k}__`, v);
  return s;
}

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".css", ".mjs", ".js", ".json", ".md", ".yml", ".yaml",
  ".svg", ".py", ".txt", ".html",
]);

export function isTextFile(file: string): boolean {
  return TEXT_EXT.has(path.extname(file)) || path.basename(file) === "_gitignore";
}

/* Рекурсивный список файлов шаблона (относительные пути). */
export function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

export function writeFileEnsured(dest: string, content: string | Buffer) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (typeof content === "string") fs.writeFileSync(dest, content, "utf8");
  else fs.writeFileSync(dest, content);
}

/* slug для роута/директории из произвольного имени дашборда */
export function slugify(name: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh",
    щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return name
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dash";
}

/* PascalCase имя компонента из slug */
export function componentName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}
