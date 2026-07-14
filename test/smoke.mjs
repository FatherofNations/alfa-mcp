#!/usr/bin/env node
/* Smoke-тест proto-forge (stdio): JSON-RPC через стандартные потоки.
   Запуск: node test/smoke.mjs (после npm run build). */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proto-forge-smoke-"));
const server = spawn("node", [path.resolve("dist/server.js")], {
  cwd: tmp, // тулы резолвят пути от cwd процесса
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
const pending = new Map();
server.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) =>
      msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result)
    );
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) reject(new Error(`${method}: таймаут 30s`));
    }, 30000);
  });
}
function notify(method, params = {}) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const text = (r) => r.content?.map((c) => c.text).join("\n") ?? "";

try {
  // ── handshake ──
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  check("initialize", init.serverInfo?.name === "proto-forge");
  notify("notifications/initialized");

  // ── tools ──
  const tools = await rpc("tools/list");
  const names = tools.tools.map((t) => t.name).sort();
  const expected = [
    "add_animation", "extract_tokens", "get_checklist", "install_fonts",
    "process_assets", "register_dashboard", "sanitize_svg", "scaffold_project",
  ];
  check(`tools/list = 8 (${names.join(", ")})`, JSON.stringify(names) === JSON.stringify(expected));

  // ── resources / prompts ──
  const res = await rpc("resources/list");
  check("resources/list = 11 документов", res.resources.length === 11, `получено ${res.resources.length}`);
  const canon = await rpc("resources/read", { uri: "proto://knowledge/animation-canon" });
  check("resources/read animation-canon", canon.contents[0].text.includes("cubic-bezier(0.32, 0.72, 0, 1)"));
  const fimport = await rpc("resources/read", { uri: "proto://knowledge/figma-import" });
  check("figma-import: быстрый пайплайн, без токенов", fimport.contents[0].text.includes("process_assets") && !fimport.contents[0].text.includes("import_figma_assets"));
  const prompts = await rpc("prompts/list");
  check("prompts/list = 5", prompts.prompts.length === 5, `получено ${prompts.prompts.length}`);

  // ── get_checklist / add_animation ──
  const cl = await rpc("tools/call", { name: "get_checklist", arguments: { stage: "qa" } });
  check("get_checklist(qa)", text(cl).includes("naturalWidth"));
  const anim = await rpc("tools/call", {
    name: "add_animation",
    arguments: { recipe: "stagger", selector: ".feed", params: { items: 4 } },
  });
  check("add_animation(stagger)", text(anim).includes(".feed > *:nth-child(4)"));

  // ── scaffold_project: дефолт = минимальный (БЕЗ панели tools) ──
  const scaffold = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: { name: "demo-proto", title: "Демо", installFonts: false },
  });
  check("scaffold_project (дефолты)", !scaffold.isError, text(scaffold).slice(0, 300));
  const proj = path.join(tmp, "demo-proto");
  for (const f of ["package.json", "app/layout.tsx", "app/page.tsx", "styles/canon.css", "scripts/verify.mjs", "vercel.json", ".gitignore"]) {
    check(`  файл ${f}`, fs.existsSync(path.join(proj, f)));
  }
  check("  БЕЗ панели tools (дефолт)", !fs.existsSync(path.join(proj, "components/tools")) && !fs.existsSync(path.join(proj, "styles/tools.css")) && !fs.existsSync(path.join(proj, "lib/dashboards.ts")));
  check("  БЕЗ neuro (удалён из шаблона)", !fs.existsSync(path.join(proj, "components/neuro")) && !fs.existsSync(path.join(proj, "styles/neuro.css")));
  const layout = fs.readFileSync(path.join(proj, "app/layout.tsx"), "utf8");
  check("  layout: <main>, без ToolsProvider и маркеров", layout.includes("<main>{children}</main>") && !layout.includes("ToolsProvider") && !/proto:(if|else|endif)/.test(layout));
  check("  один дашборд «Главная» на /", fs.readFileSync(path.join(proj, "app/page.tsx"), "utf8").includes("Glavnaya"));

  // ── scaffold_project: панель tools по явной просьбе ──
  const scaffold2 = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: {
      name: "panel-proto",
      dashboards: ["Главная", "Отчёты"],
      features: { toolsPanel: true },
      installFonts: false,
    },
  });
  check("scaffold_project (toolsPanel: true)", !scaffold2.isError, text(scaffold2).slice(0, 300));
  const pproj = path.join(tmp, "panel-proto");
  check("  есть ToolsProvider/Panel + tools.css", fs.existsSync(path.join(pproj, "components/tools/ToolsProvider.tsx")) && fs.existsSync(path.join(pproj, "styles/tools.css")));
  const reg = fs.readFileSync(path.join(pproj, "lib/dashboards.ts"), "utf8");
  check("  реестр: 2 дашборда", reg.includes('route: "/"') && reg.includes('route: "/otchety"'));
  const panel = fs.readFileSync(path.join(pproj, "components/tools/ToolsPanel.tsx"), "utf8");
  check("  заглушки «Параметр 1/2»", panel.includes("Параметр 1") && panel.includes("Параметр 2") && !panel.includes("Демо-состояние"));
  const playout = fs.readFileSync(path.join(pproj, "app/layout.tsx"), "utf8");
  check("  layout с ToolsProvider", playout.includes("<ToolsProvider>"));

  // ── register_dashboard ──
  const regDash = await rpc("tools/call", {
    name: "register_dashboard",
    arguments: { name: "Бухгалтер", route: "/accountant", targetDir: "panel-proto" },
  });
  check("register_dashboard", !regDash.isError, text(regDash).slice(0, 300));
  check("  роут создан", fs.existsSync(path.join(pproj, "app/accountant/page.tsx")));
  check("  карточка в реестре", fs.readFileSync(path.join(pproj, "lib/dashboards.ts"), "utf8").includes('"/accountant"'));

  // ── process_assets: svg-санитайз + png→webp + детект пустых ──
  const assetsDir = path.join(tmp, "assets");
  fs.mkdirSync(assetsDir);
  fs.writeFileSync(
    path.join(assetsDir, "icon.svg"),
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="24" height="24" fill="#fff"/>' +
      '<path d="M4 4h16" fill="var(--fill-0, #EF3124)" fill-opacity="0.5"/></svg>'
  );
  // картинки готовим sharp-ом из node_modules сервера
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 239, g: 49, b: 36, alpha: 1 } } })
    .png().toFile(path.join(assetsDir, "solid.png"));
  await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().toFile(path.join(assetsDir, "empty.png"));
  const pa = await rpc("tools/call", { name: "process_assets", arguments: { dir: "assets" } });
  const paText = text(pa);
  check("process_assets: svg почищен", fs.readFileSync(path.join(assetsDir, "icon.svg"), "utf8").includes('fill="#EF3124"'));
  check("process_assets: png → webp", fs.existsSync(path.join(assetsDir, "solid.webp")) && !fs.existsSync(path.join(assetsDir, "solid.png")));
  check("process_assets: пустой экспорт пойман", paText.includes("ПУСТОЙ") && fs.existsSync(path.join(assetsDir, "empty.png")));

  // ── sanitize_svg: inline-режим ──
  const san = await rpc("tools/call", {
    name: "sanitize_svg",
    arguments: { svgs: [{ name: "a.svg", content: '<svg viewBox="0 0 24 24"><path fill="var(--fill-0, #111)" d="M0 0"/></svg>' }] },
  });
  check("sanitize_svg (inline)", text(san).includes('fill="#111"'));

  // ── extract_tokens ──
  const tok = await rpc("tools/call", {
    name: "extract_tokens",
    arguments: {
      variableDefs: {
        "text/primary": "rgba(3, 3, 6, 0.88)",
        "Accent Primary": { r: 0.937, g: 0.192, b: 0.141, a: 1 },
        spacing: { "gap-m": 16 },
      },
      targetDir: "panel-proto",
    },
  });
  check("extract_tokens", !tok.isError, text(tok).slice(0, 300));
  const tokens = fs.readFileSync(path.join(pproj, "styles/tokens.css"), "utf8");
  check("  kebab-case имена", tokens.includes("--text-primary: rgba(3, 3, 6, 0.88);"));
  check("  rgb из {r,g,b}", tokens.includes("--accent-primary: rgb(239, 49, 36);"));
  check("  вложенность + px", tokens.includes("--spacing-gap-m: 16px;"));
} catch (e) {
  failures++;
  console.error(`✗ ${e.message}`);
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\nFAIL (stdio): ${failures}` : "\nOK: stdio smoke-тест пройден");
process.exit(failures ? 1 : 0);
