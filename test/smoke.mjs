#!/usr/bin/env node
/* Smoke-тест proto-forge: поднимает сервер по stdio и гоняет JSON-RPC:
   initialize → tools/list → resources/list → resources/read →
   get_checklist → add_animation → scaffold_project (во временную папку) →
   register_dashboard → sanitize_svg → extract_tokens.
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
    "add_animation", "extract_tokens", "get_checklist", "import_figma_assets",
    "install_fonts", "register_dashboard", "sanitize_svg", "scaffold_project",
  ];
  check(`tools/list = 8 (${names.join(", ")})`, JSON.stringify(names) === JSON.stringify(expected));

  // ── resources ──
  const res = await rpc("resources/list");
  check(`resources/list = 11 документов`, res.resources.length === 11, `получено ${res.resources.length}`);
  const canon = await rpc("resources/read", { uri: "proto://knowledge/animation-canon" });
  check("resources/read animation-canon", canon.contents[0].text.includes("cubic-bezier(0.32, 0.72, 0, 1)"));

  // ── prompts ──
  const prompts = await rpc("prompts/list");
  check(`prompts/list = 5`, prompts.prompts.length === 5, `получено ${prompts.prompts.length}`);
  const ship = await rpc("prompts/get", { name: "ship", arguments: {} });
  check("prompts/get ship", ship.messages[0].content.text.includes("deploy-vercel"));

  // ── get_checklist ──
  const cl = await rpc("tools/call", { name: "get_checklist", arguments: { stage: "qa" } });
  check("get_checklist(qa)", text(cl).includes("naturalWidth"));

  // ── add_animation ──
  const anim = await rpc("tools/call", {
    name: "add_animation",
    arguments: { recipe: "stagger", selector: ".feed", params: { items: 4 } },
  });
  check("add_animation(stagger)", text(anim).includes(".feed > *:nth-child(4)"));

  // ── scaffold_project ──
  const scaffold = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: {
      name: "demo-proto",
      title: "Демо-прототип",
      dashboards: ["Главная", "Отчёты"],
      features: { toolsPanel: true, neuroBar: true, deepLinks: true, mobileGate: true },
    },
  });
  const sOut = text(scaffold);
  check("scaffold_project выполнен", !scaffold.isError, sOut.slice(0, 300));
  const proj = path.join(tmp, "demo-proto");
  const mustExist = [
    "package.json", "app/layout.tsx", "app/page.tsx", "app/otchety/page.tsx",
    "components/dashboards/Otchety.tsx", "components/tools/ToolsProvider.tsx",
    "components/neuro/NeuroBar.tsx", "styles/canon.css", "styles/tools.css",
    "lib/dashboards.ts", "scripts/verify.mjs", "vercel.json", ".gitignore",
  ];
  for (const f of mustExist) check(`  файл ${f}`, fs.existsSync(path.join(proj, f)));
  const pkg = JSON.parse(fs.readFileSync(path.join(proj, "package.json"), "utf8"));
  check("  плейсхолдер имени", pkg.name === "demo-proto");
  const reg = fs.readFileSync(path.join(proj, "lib/dashboards.ts"), "utf8");
  check("  реестр: 2 дашборда", reg.includes('route: "/"') && reg.includes('route: "/otchety"'));
  const layout = fs.readFileSync(path.join(proj, "app/layout.tsx"), "utf8");
  check("  маркеры фич вычищены", !layout.includes("proto:if") && !layout.includes("proto:else"));
  check("  ToolsProvider в layout (фича on)", layout.includes("<ToolsProvider>"));

  // скаффолд с выключенными фичами
  const scaffold2 = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: {
      name: "bare-proto",
      dashboards: ["Один"],
      features: { toolsPanel: false, neuroBar: false, deepLinks: false, mobileGate: false },
    },
  });
  check("scaffold_project (все фичи off)", !scaffold2.isError, text(scaffold2).slice(0, 300));
  const bare = path.join(tmp, "bare-proto");
  check("  нет components/tools", !fs.existsSync(path.join(bare, "components/tools")));
  check("  нет components/neuro", !fs.existsSync(path.join(bare, "components/neuro")));
  const bareLayout = fs.readFileSync(path.join(bare, "app/layout.tsx"), "utf8");
  check("  layout без ToolsProvider", !bareLayout.includes("ToolsProvider") && bareLayout.includes("<main>{children}</main>"));
  const bareProvider = fs.existsSync(path.join(bare, "styles/tools.css"));
  check("  нет styles/tools.css", !bareProvider);

  // ── register_dashboard ──
  const regDash = await rpc("tools/call", {
    name: "register_dashboard",
    arguments: {
      name: "Бухгалтер",
      route: "/accountant",
      cardTitle: "Бухгалтер",
      cardSubtitle: "Актуальный",
      targetDir: "demo-proto",
    },
  });
  check("register_dashboard", !regDash.isError, text(regDash).slice(0, 300));
  check("  роут создан", fs.existsSync(path.join(proj, "app/accountant/page.tsx")));
  check(
    "  карточка в реестре",
    fs.readFileSync(path.join(proj, "lib/dashboards.ts"), "utf8").includes('"/accountant"')
  );

  // ── sanitize_svg ──
  const svgPath = path.join(tmp, "icon.svg");
  fs.writeFileSync(
    svgPath,
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="24" height="24" fill="#fff"/>' +
      '<path d="M4 4h16" fill="var(--fill-0, #EF3124)" fill-opacity="0.5"/></svg>'
  );
  const san = await rpc("tools/call", { name: "sanitize_svg", arguments: { files: ["icon.svg"] } });
  const sanText = text(san);
  const sanitized = fs.readFileSync(svgPath, "utf8");
  check("sanitize_svg: var → цвет", sanitized.includes('fill="#EF3124"'));
  check("sanitize_svg: фоновый rect удалён", !sanitized.includes("<rect"));
  check("sanitize_svg: warning про fill-opacity", sanText.includes("fill-opacity"));

  // ── extract_tokens ──
  const tok = await rpc("tools/call", {
    name: "extract_tokens",
    arguments: {
      variableDefs: {
        "text/primary": "rgba(3, 3, 6, 0.88)",
        "Accent Primary": { r: 0.937, g: 0.192, b: 0.141, a: 1 },
        spacing: { "gap-m": 16 },
      },
      targetDir: "demo-proto",
    },
  });
  check("extract_tokens", !tok.isError, text(tok).slice(0, 300));
  const tokens = fs.readFileSync(path.join(proj, "styles/tokens.css"), "utf8");
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

console.log(failures ? `\nFAIL: ${failures}` : "\nOK: smoke-тест пройден");
process.exit(failures ? 1 : 0);
