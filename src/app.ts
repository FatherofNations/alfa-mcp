import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServerCtx } from "./lib/ctx.js";
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

export function buildServer(ctx: ServerCtx): McpServer {
  const server = new McpServer(
    { name: "proto-forge", version: "0.2.0" },
    {
      instructions: `proto-forge: экспертиза и автоматизация прототипов по Figma-макетам.
Работает В ПАРЕ с официальным Figma MCP: данные и ассеты макета — оттуда
(get_design_context / get_variable_defs / download_assets), обработка и
каноны — отсюда. Токены Figma не нужны.
Перед задачей читай гайд: начни с proto://knowledge/index.
Типовой старт: scaffold_project (шрифты ставятся сразу) → extract_tokens
→ download_assets → process_assets → вёрстка по гайдам.
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
