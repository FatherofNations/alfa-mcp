import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

/* Корень пакета proto-forge: dist/lib/paths.js → ../../ (рядом лежат
   knowledge/ и template/, они шипятся в пакете как есть, без сборки). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(HERE, "..", "..");

export const KNOWLEDGE_DIR = path.join(PKG_ROOT, "knowledge");

/* Шаблон можно переопределить (форк под другую дизайн-систему) через env. */
export const TEMPLATE_DIR =
  process.env.PROTO_TEMPLATE_DIR && fs.existsSync(process.env.PROTO_TEMPLATE_DIR)
    ? process.env.PROTO_TEMPLATE_DIR
    : path.join(PKG_ROOT, "template");

/* Все пути в аргументах тулов — относительно cwd процесса-клиента
   (Claude Code запускает сервер в корне проекта агента). Абсолютные
   пути пропускаем как есть. */
export function resolveInProject(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}
