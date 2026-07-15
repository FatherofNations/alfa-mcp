import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServerCtx } from "./lib/ctx.js";
import { PKG_ROOT } from "./lib/paths.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { registerScaffold } from "./tools/scaffold.js";
import { registerAssets } from "./tools/assets.js";
import { registerFonts } from "./tools/fonts.js";
import { registerTokens } from "./tools/tokens.js";
import { registerAnimations } from "./tools/animations.js";
import { registerDashboards } from "./tools/dashboards.js";
import { registerChecklist } from "./tools/checklist.js";

/* Сборка MCP-сервера (общая для stdio и http). В http-режиме инстанс
   создаётся на каждый запрос (stateless) — все тулы без состояния. */

/* Аватарка коннектора (MCP icons): логотип Альфа-Банка из шапки дашборда.
   http-режим — абсолютные URL (раздаются в src/http.ts); stdio — data-URI
   (локальному серверу некуда ссылаться). */
function serverIcons(ctx: ServerCtx) {
  if (ctx.mode === "http") {
    return [
      { src: `${ctx.baseUrl}/icon.png`, mimeType: "image/png", sizes: ["256x256"] },
      { src: `${ctx.baseUrl}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ];
  }
  const svg = fs.readFileSync(path.join(PKG_ROOT, "brand/icon.svg"));
  return [
    {
      src: `data:image/svg+xml;base64,${svg.toString("base64")}`,
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ];
}

export function buildServer(ctx: ServerCtx): McpServer {
  const server = new McpServer(
    {
      name: "proto-forge",
      title: "proto-forge — прототипы Альфа-Бизнеса",
      version: "0.3.0",
      icons: serverIcons(ctx),
      websiteUrl: "https://github.com/FatherofNations/proto-forge",
    },
    {
      instructions: `proto-forge: экспертиза и автоматизация прототипов по Figma-макетам.
Работает В ПАРЕ с официальным Figma MCP: данные и ассеты макета — оттуда
(get_design_context / get_variable_defs / download_assets), обработка и
каноны — отсюда. Токены Figma не нужны.
ПЕРЕД scaffold_project ОБЯЗАТЕЛЬНО спроси пользователя, на чём собирать
прототип (не выбирай сам): чистый HTML/CSS (static — максимальная
скорость pixel-perfect) или React/Next.js (next — масштабируемость,
панель tools, компоненты core-ds). Критерии: proto://knowledge/stack-choice.
Перед задачей читай гайд: начни с proto://knowledge/index.
Типовой старт: (вопрос про стек) → scaffold_project (шрифты ставятся
сразу) → extract_tokens → download_assets → process_assets → вёрстка.
Панель tools в скаффолде — ТОЛЬКО по явной просьбе пользователя.
Чек-лист перед сдачей стадии: get_checklist.`,
    }
  );

  registerResources(server);
  registerPrompts(server);
  registerScaffold(server, ctx);
  registerAssets(server, ctx);
  registerFonts(server, ctx);
  registerTokens(server, ctx);
  registerAnimations(server);
  registerDashboards(server, ctx);
  registerChecklist(server);
  return server;
}
