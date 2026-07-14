#!/usr/bin/env node
/* proto-forge — MCP-сервер для скоростной разработки интерактивных
   прототипов по Figma-макетам.

   Слои (см. docs в knowledge/):
   - resources proto://knowledge/* — база знаний (конденсат best practices);
   - tools — скаффолд, ассеты, шрифты, токены, канон-анимации, чек-листы;
   - prompts — готовые сценарии (new-dashboard, parity-qa, ship, …).

   proto-forge НЕ проксирует официальный Figma MCP (кроме batch-экспорта
   через REST) и НЕ деплоит/не трогает git — это решения агента/человека. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { registerScaffold } from "./tools/scaffold.js";
import { registerAssets } from "./tools/assets.js";
import { registerFonts } from "./tools/fonts.js";
import { registerTokens } from "./tools/tokens.js";
import { registerAnimations } from "./tools/animations.js";
import { registerDashboards } from "./tools/dashboards.js";
import { registerChecklist } from "./tools/checklist.js";

const server = new McpServer(
  { name: "proto-forge", version: "0.1.0" },
  {
    instructions: `proto-forge: экспертиза и автоматизация прототипов по Figma-макетам.
Работает В ПАРЕ с официальным Figma MCP (данные макета — оттуда).
Перед задачей читай гайд: начни с proto://knowledge/index (какой документ когда).
Типовой старт: scaffold_project → install_fonts → extract_tokens → вёрстка по гайдам.
Чек-лист перед сдачей стадии: get_checklist.`,
  }
);

registerResources(server);
registerPrompts(server);
registerScaffold(server);
registerAssets(server);
registerFonts(server);
registerTokens(server);
registerAnimations(server);
registerDashboards(server);
registerChecklist(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout занят протоколом — служебные сообщения только в stderr
console.error("proto-forge MCP server: stdio transport ready");
