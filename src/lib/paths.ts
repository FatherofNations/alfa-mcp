import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

/* Корень пакета alfa-mcp: dist/lib/paths.js → ../../ (рядом лежат
   knowledge/ и template/, они шипятся в пакете как есть, без сборки). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(HERE, "..", "..");

export const KNOWLEDGE_DIR = path.join(PKG_ROOT, "knowledge");

/* Версия — единственный источник истины package.json. Раньше она дублировалась
   строкой в app.ts и разъехалась (0.6.3 в пакете против 0.6.2 в serverInfo),
   из-за чего проверка деплоя по serverInfo.version врала. */
export const PKG_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")
).version;

/* Шаблоны можно переопределить (форк под другую дизайн-систему) через env. */
export const TEMPLATE_DIR =
  process.env.PROTO_TEMPLATE_DIR && fs.existsSync(process.env.PROTO_TEMPLATE_DIR)
    ? process.env.PROTO_TEMPLATE_DIR
    : path.join(PKG_ROOT, "template");

export const STATIC_TEMPLATE_DIR =
  process.env.PROTO_TEMPLATE_STATIC_DIR && fs.existsSync(process.env.PROTO_TEMPLATE_STATIC_DIR)
    ? process.env.PROTO_TEMPLATE_STATIC_DIR
    : path.join(PKG_ROOT, "template-static");

/* Все пути в аргументах тулов — относительно cwd процесса-клиента
   (Claude Code запускает сервер в корне проекта агента). Абсолютные
   пути пропускаем как есть. */
export function resolveInProject(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}
