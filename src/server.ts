#!/usr/bin/env node
/* alfa-mcp — MCP-сервер для скоростной разработки интерактивных
   прототипов по Figma-макетам.

   Режимы:
   - stdio (default) — сервер на машине агента, файловые тулы пишут напрямую;
   - http (env PROTO_HTTP_PORT или --http [port]) — командный хостинг:
     Streamable HTTP + эндпоинты /dl (артефакты) и /process (ассеты).

   alfa-mcp НЕ проксирует официальный Figma MCP, НЕ требует Figma-токенов
   и НЕ деплоит/не трогает git — это решения агента/человека. */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./app.js";
import { stdioCtx } from "./lib/ctx.js";

const argPort = (() => {
  const i = process.argv.indexOf("--http");
  if (i === -1) return null;
  return Number(process.argv[i + 1]) || 8811;
})();
const httpPort = argPort ?? (process.env.PROTO_HTTP_PORT ? Number(process.env.PROTO_HTTP_PORT) : null);

if (httpPort) {
  const { startHttp } = await import("./http.js");
  startHttp(httpPort);
} else {
  const server = buildServer(stdioCtx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout занят протоколом — служебные сообщения только в stderr
  console.error("alfa-mcp MCP server: stdio transport ready");
}
