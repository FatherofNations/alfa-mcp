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
  check(
    "иконка коннектора (stdio: data-URI)",
    init.serverInfo?.icons?.[0]?.src?.startsWith("data:image/svg+xml;base64,")
  );
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
  check("resources/list = 12 документов", res.resources.length === 12, `получено ${res.resources.length}`);
  const stackDoc = await rpc("resources/read", { uri: "proto://knowledge/stack-choice" });
  check("stack-choice: спросить пользователя + core-ds", stackDoc.contents[0].text.includes("@alfalab/core-components"));
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

  // ── scaffold_project: без stack → ошибка (агент обязан спросить пользователя) ──
  let noStackFailed = false;
  try {
    const ns = await rpc("tools/call", {
      name: "scaffold_project",
      arguments: { name: "no-stack", installFonts: false },
    });
    noStackFailed = Boolean(ns.isError);
  } catch {
    noStackFailed = true;
  }
  check("scaffold без stack отвергнут", noStackFailed && !fs.existsSync(path.join(tmp, "no-stack")));

  // ── scaffold_project (next): дефолт = минимальный (БЕЗ панели tools) ──
  const scaffold = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: { stack: "next", name: "demo-proto", title: "Демо", installFonts: false },
  });
  check("scaffold_project (дефолты)", !scaffold.isError, text(scaffold).slice(0, 300));
  const proj = path.join(tmp, "demo-proto");
  for (const f of ["package.json", "app/layout.tsx", "app/page.tsx", "styles/canon.css", "scripts/verify.mjs", "vercel.json", ".gitignore"]) {
    check(`  файл ${f}`, fs.existsSync(path.join(proj, f)));
  }
  check("  БЕЗ панели tools (дефолт)", !fs.existsSync(path.join(proj, "components/tools")) && !fs.existsSync(path.join(proj, "styles/tools.css")) && !fs.existsSync(path.join(proj, "lib/dashboards.ts")));
  check("  БЕЗ neuro (удалён из шаблона)", !fs.existsSync(path.join(proj, "components/neuro")) && !fs.existsSync(path.join(proj, "styles/neuro.css")));
  const layout = fs.readFileSync(path.join(proj, "app/layout.tsx"), "utf8");
  check("  layout: AppChrome без ToolsProvider, маркеры вычищены", layout.includes("<AppChrome />") && !layout.includes("ToolsProvider") && !/proto:(if|else|endif)/.test(layout));
  check("  хром: компонент + ассеты + css (дефолт on)", fs.existsSync(path.join(proj, "components/chrome/AppChrome.tsx")) && fs.existsSync(path.join(proj, "public/assets/chrome/logo.svg")) && fs.existsSync(path.join(proj, "styles/chrome.css")));
  const chromeCss = fs.readFileSync(path.join(proj, "styles/chrome.css"), "utf8");
  check("  меню — medium (500)", /chrome-cell-t\s*{[^}]*font-weight:\s*500/s.test(chromeCss));
  check("  один дашборд «Главная» на /", fs.readFileSync(path.join(proj, "app/page.tsx"), "utf8").includes("Glavnaya"));

  // chrome можно выключить
  const noChrome = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: { stack: "next", name: "no-chrome", features: { chrome: false }, installFonts: false },
  });
  check("scaffold с chrome:false", !noChrome.isError);
  const nc = path.join(tmp, "no-chrome");
  check("  без хрома: нет компонента/ассетов/css", !fs.existsSync(path.join(nc, "components/chrome")) && !fs.existsSync(path.join(nc, "public/assets/chrome")) && !fs.existsSync(path.join(nc, "styles/chrome.css")));
  check("  layout без AppChrome", !fs.readFileSync(path.join(nc, "app/layout.tsx"), "utf8").includes("AppChrome"));

  // ── scaffold_project: панель tools по явной просьбе ──
  const scaffold2 = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: {
      stack: "next",
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

  // ── scaffold_project (static): html/css/js без сборки ──
  const scaffoldS = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: {
      stack: "static",
      name: "static-proto",
      dashboards: ["Главная", "Отчёты"],
      features: { toolsPanel: true }, // недоступно в static → ждём предупреждение
      installFonts: false,
    },
  });
  const ssOut = text(scaffoldS);
  check("scaffold_project (static)", !scaffoldS.isError, ssOut.slice(0, 300));
  const sproj = path.join(tmp, "static-proto");
  for (const f of ["index.html", "otchety.html", "js/app.js", "styles/canon.css", "styles/app.css", "scripts/serve.py", ".gitignore"]) {
    check(`  файл ${f}`, fs.existsSync(path.join(sproj, f)));
  }
  check("  БЕЗ package.json (нет сборки)", !fs.existsSync(path.join(sproj, "package.json")));
  const indexHtml = fs.readFileSync(path.join(sproj, "index.html"), "utf8");
  check("  html: заголовок и mobile-gate", indexHtml.includes("<h1 class=\"page-title\">Главная</h1>") && indexHtml.includes("mgate"));
  check("  html: маркеры вычищены", !/proto:(if|else|endif)/.test(indexHtml));
  check("  html: хром (сайдбар+шапка) на странице", indexHtml.includes("chrome-side") && indexHtml.includes("chrome-header") && fs.existsSync(path.join(sproj, "assets/chrome/logo.svg")));
  check(
    "  предупреждение про панель в static",
    ssOut.includes("панель tools доступна ТОЛЬКО в next") && ssOut.includes("НЕ мигрируй")
  );

  // register_dashboard в static-проект → новая html-страница (наследует хром)
  const regStatic = await rpc("tools/call", {
    name: "register_dashboard",
    arguments: { name: "Бухгалтер", route: "/accountant", targetDir: "static-proto" },
  });
  check("register_dashboard (static)", !regStatic.isError && fs.existsSync(path.join(sproj, "accountant.html")), text(regStatic).slice(0, 200));
  check("  новая страница наследует хром", fs.readFileSync(path.join(sproj, "accountant.html"), "utf8").includes("chrome-side"));

  // ── пресет accountant: static-скаффолд с готовой главной ──
  const accS = await rpc("tools/call", {
    name: "scaffold_project",
    arguments: { stack: "static", name: "acc-static", preset: "accountant", installFonts: false },
  });
  check("scaffold static + preset accountant", !accS.isError, text(accS).slice(0, 300));
  const aproj = path.join(tmp, "acc-static");
  const accHtml = fs.readFileSync(path.join(aproj, "index.html"), "utf8");
  check("  блоки на странице", accHtml.includes("cur-qa") && accHtml.includes("cur-balance") && accHtml.includes("cur-tablo") && accHtml.includes("cur-table"));
  check("  заглушка заменена, body.cur", !accHtml.includes("demo-grid") && accHtml.includes('<body class="cur">'));
  check("  css + ассеты пресета", fs.existsSync(path.join(aproj, "styles/accountant.css")) && fs.existsSync(path.join(aproj, "assets/accountant/curBalPlus.svg")));
  const accCss = fs.readFileSync(path.join(aproj, "styles/accountant.css"), "utf8");
  check("  относительные пути в css", accCss.includes("url(../assets/accountant/"));
  check("  относительные src в html", accHtml.includes('src="assets/accountant/') && !accHtml.includes('src="/assets/accountant/'));
  check("  контент прибит влево (без margin:0 auto)", !/margin:\s*0\s+auto/.test(accCss));

  // ── пресет accountant: register_dashboard в next-проект ──
  const accN = await rpc("tools/call", {
    name: "register_dashboard",
    arguments: { name: "Бухгалтер", route: "/buh", targetDir: "panel-proto", preset: "accountant" },
  });
  check("register_dashboard + preset (next)", !accN.isError, text(accN).slice(0, 300));
  const pn = path.join(tmp, "panel-proto");
  check("  компонент-пресет + партиал", fs.readFileSync(path.join(pn, "components/dashboards/Buh.tsx"), "utf8").includes("ACCOUNTANT_HTML") && fs.existsSync(path.join(pn, "components/dashboards/accountantHtml.ts")));
  check("  css + ассеты (next)", fs.existsSync(path.join(pn, "styles/accountant.css")) && fs.existsSync(path.join(pn, "public/assets/accountant/curTblRub.svg")));
  check("  карточка в реестре", fs.readFileSync(path.join(pn, "lib/dashboards.ts"), "utf8").includes('"/buh"'));

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
  // флаг с var() — форсим растеризацию по имени; var резолвится ДО (цвет не чернеет)
  fs.writeFileSync(
    path.join(assetsDir, "flag.svg"),
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="12" cy="12" r="12" fill="var(--fill-0, #3C3B6E)"/>' +
      '<rect x="2" y="10" width="20" height="4" fill="#B22234"/></svg>'
  );
  // svg со встроенным растром — растеризуется АВТОМАТИЧЕСКИ
  fs.writeFileSync(
    path.join(assetsDir, "embed.svg"),
    '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" width="16" height="16"/></svg>'
  );
  const pa = await rpc("tools/call", { name: "process_assets", arguments: { dir: "assets", rasterize: ["flag"] } });
  const paText = text(pa);
  check("process_assets: svg почищен", fs.readFileSync(path.join(assetsDir, "icon.svg"), "utf8").includes('fill="#EF3124"'));
  check("process_assets: png → webp", fs.existsSync(path.join(assetsDir, "solid.webp")) && !fs.existsSync(path.join(assetsDir, "solid.png")));
  check("process_assets: пустой экспорт пойман", paText.includes("ПУСТОЙ") && fs.existsSync(path.join(assetsDir, "empty.png")));
  const flagOut = fs.existsSync(path.join(assetsDir, "flag.webp")) || fs.existsSync(path.join(assetsDir, "flag.png"));
  check("process_assets: флаг растеризован (svg удалён)", flagOut && !fs.existsSync(path.join(assetsDir, "flag.svg")), paText);
  const embedOut = fs.existsSync(path.join(assetsDir, "embed.webp")) || fs.existsSync(path.join(assetsDir, "embed.png"));
  check("process_assets: встроенный растр авто-растеризован", embedOut && !fs.existsSync(path.join(assetsDir, "embed.svg")), paText);
  // цвет флага корректен (var зарезолвлен, не чёрный): есть navy-подобный пиксель
  const flagFile = fs.existsSync(path.join(assetsDir, "flag.webp")) ? "flag.webp" : "flag.png";
  const flagStat = await sharp(path.join(assetsDir, flagFile)).stats();
  check("process_assets: цвет флага сохранён (не чёрный)", flagStat.channels[2].max > 60, `blueMax=${flagStat.channels[2]?.max}`);

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
