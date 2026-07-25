#!/usr/bin/env node
/* Smoke-тест alfa-mcp (stdio): JSON-RPC через стандартные потоки.
   Запуск: node test/smoke.mjs (после npm run build). */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alfa-mcp-smoke-"));
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
  check("initialize", init.serverInfo?.name === "alfa-mcp");
  check("title/имя — Альфа (агент опознаёт по-русски)", init.serverInfo?.title?.startsWith("Альфа"));
  const pkgVersion = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  check(
    `serverInfo.version == package.json (${pkgVersion})`,
    init.serverInfo?.version === pkgVersion,
    `serverInfo=${init.serverInfo?.version}`
  );
  check(
    "инструкции: нет данных из Figma MCP → спросить пользователя",
    init.instructions?.includes("СТОП: не верстать по скриншоту молча") &&
      init.instructions?.includes("порекомендовать включить Figma MCP")
  );
  check(
    "иконка коннектора (stdio: data-URI)",
    init.serverInfo?.icons?.[0]?.src?.startsWith("data:image/svg+xml;base64,")
  );
  notify("notifications/initialized");

  // ── tools ──
  const tools = await rpc("tools/list");
  const names = tools.tools.map((t) => t.name).sort();
  const expected = [
    "add_animation", "digest_design_context", "extract_tokens", "get_checklist",
    "install_fonts", "parity_check", "process_assets", "read_knowledge",
    "register_dashboard", "sanitize_svg", "scaffold_project",
  ];
  check(`tools/list = 11 (${names.join(", ")})`, JSON.stringify(names) === JSON.stringify(expected));

  // ── resources / prompts ──
  const res = await rpc("resources/list");
  check("resources/list = 13 документов", res.resources.length === 13, `получено ${res.resources.length}`);
  const stackDoc = await rpc("resources/read", { uri: "alfa://knowledge/stack-choice" });
  check("stack-choice: спросить пользователя + core-ds", stackDoc.contents[0].text.includes("@alfalab/core-components"));
  const canon = await rpc("resources/read", { uri: "alfa://knowledge/animation-canon" });
  check("resources/read animation-canon", canon.contents[0].text.includes("cubic-bezier(0.32, 0.72, 0, 1)"));
  const fimport = await rpc("resources/read", { uri: "alfa://knowledge/figma-import" });
  check("figma-import: быстрый пайплайн, без токенов", fimport.contents[0].text.includes("process_assets") && !fimport.contents[0].text.includes("import_figma_assets"));
  check(
    "figma-import: правило №2 (нет MCP → стоп + спросить + рекомендовать)",
    fimport.contents[0].text.includes("Правило №2") &&
      fimport.contents[0].text.includes("не переключаться\nмолча на вёрстку по скриншоту") &&
      fimport.contents[0].text.includes("Порекомендовать включить Figma MCP")
  );
  const prompts = await rpc("prompts/list");
  check("prompts/list = 5", prompts.prompts.length === 5, `получено ${prompts.prompts.length}`);

  // ── read_knowledge: каноны тулом (ресурсы читают не все клиенты) ──
  const kIndex = await rpc("tools/call", { name: "read_knowledge", arguments: {} });
  check("read_knowledge() = оглавление", text(kIndex).includes("table-import"));
  const kTable = await rpc("tools/call", { name: "read_knowledge", arguments: { name: "table-import" } });
  check("read_knowledge(table-import)", text(kTable).includes("Полоса ячеек шире карточки"));
  const kBad = await rpc("tools/call", { name: "read_knowledge", arguments: { name: "нет-такого" } });
  check("read_knowledge: неизвестный документ → ошибка со списком", text(kBad).includes("Доступные:"));

  // ── digest_design_context: сжатие выдачи Figma MCP ──
  const rowsSrc = `
    <div className="absolute bg-[rgba(38,55,88,0.04)] h-[49px] left-[6px] right-[6px] rounded-[12px] top-[109px]" data-name="[D] BodyRow :: Wide">
      <div className="flex w-[52.001px] pl-[16px] pr-[12px] py-[12px]" data-name="[D] BodyControlCell :: Wide"></div>
      <div className="flex flex-[1_0_0] pl-[10px] pr-[12px] py-[12px]" data-name="[D] BodyCell :: Wide"><p className="x">ООО «Ромашка»</p></div>
      <div className="flex w-[132px] pl-[10px] pr-[12px] py-[12px]" data-name="[D] BodyCell :: Wide"><p className="x">15.01.2025</p></div>
    </div>
    <div className="absolute h-[49px] left-0 right-[-2px] top-[158px]" data-name="[D] BodyRow :: Wide">
      <div className="flex w-[52.001px]" data-name="[D] BodyControlCell :: Wide"></div>
      <div className="flex flex-[1_0_0]" data-name="[D] BodyCell :: Wide"><p className="x">ЗАО «Вектор»</p></div>
      <div className="flex w-[132px]" data-name="[D] BodyCell :: Wide"><p className="x">20.02.2025</p></div>
    </div>
    <div className="absolute h-[49px] left-[6px] right-[6px] top-[207px]" data-name="[D] BodyRow :: Wide">
      <div className="flex w-[52.001px]" data-name="[D] BodyControlCell :: Wide"></div>
      <div className="flex flex-[1_0_0]" data-name="[D] BodyCell :: Wide"><p className="x">ИП «Куб»</p></div>
      <div className="flex w-[132px]" data-name="[D] BodyCell :: Wide"><p className="x">10.04.2025</p></div>
    </div>`;
  const dRows = await rpc("tools/call", {
    name: "digest_design_context",
    arguments: { content: rowsSrc, mode: "rows" },
  });
  check("digest(rows): нашёл повтор строк", text(dRows).includes("«[D] BodyRow :: Wide» × 3"));
  check("digest(rows): ширины ячеек не съехали", text(dRows).includes("ширина 52.001px"));
  check("digest(rows): матрица текстов", text(dRows).includes("ЗАО «Вектор»"));
  check("digest(rows): зебра видна по подложке", text(dRows).includes("rgba(38,55,88,0.04)"));

  const layoutSrc = [
    '<frame id="1:1" name="Root" x="0" y="0" width="1600" height="900">',
    '  <frame id="1:2" name="Row" x="0" y="0" width="100" height="49">',
    '  </frame>',
    '  <frame id="1:3" name="Row" x="0" y="49" width="100" height="49">',
    '  </frame>',
    '  <frame id="1:4" name="Row" x="0" y="98" width="100" height="49">',
    '  </frame>',
    "</frame>",
  ].join("\n");
  const dLayout = await rpc("tools/call", {
    name: "digest_design_context",
    arguments: { content: layoutSrc, mode: "layout" },
  });
  check("digest(layout): повторы схлопнуты", text(dLayout).includes("3× frame «Row»"));
  check("digest(layout): шаг посчитан", text(dLayout).includes("шаг y=49"));

  const textSrc =
    `<p className="font-['Alfa_Interface_Sans:Medium'] leading-[20px] text-[14px] ` +
    `text-[color:var(--text/primary,rgba(3,3,6,0.88))] tracking-[var(--medium_letter_spacing/14,0.07px)]">Выписка</p>`;
  const dText = await rpc("tools/call", {
    name: "digest_design_context",
    arguments: { content: textSrc, mode: "text" },
  });
  check("digest(text): сигнатура шрифта", text(dText).includes("Alfa Interface Sans Medium · 14/20"));

  const dNoInput = await rpc("tools/call", { name: "digest_design_context", arguments: {} });
  check("digest: без file/content → внятная ошибка", text(dNoInput).includes("передай file"));

  // ── parity_check: без входа объясняет, что нужно ──
  const pNoInput = await rpc("tools/call", { name: "parity_check", arguments: {} });
  check("parity_check: без входа → подсказка", text(pNoInput).includes("get_screenshot"));
  const pScript = await rpc("tools/call", {
    name: "parity_check",
    arguments: { url: "http://localhost:3000/", reference: "https://example.test/ref.png", width: 1600, height: 1411 },
  });
  check("parity_check: отдал скрипт со снятием кадров", text(pScript).includes("--window-size=1600,1411"));
  check("parity_check: предупредил про ревил", text(pScript).includes("канон-ревил"));

  /* Выбор пары кадров — напрямую: через тарбол это не проверить, на macOS
     bsdtar склеивает «._*» обратно в xattr и на записи, и на чтении, так
     что подложить их в архив системным tar невозможно. */
  const { pickPngPair } = await import("../dist/lib/parity.js");
  const pair = pickPngPair(["._b-local.png", "._a-ref.png", "a-ref.png", "b-local.png"], "a-ref.png");
  check(
    "pickPngPair: AppleDouble «._*» отброшены",
    pair.ref === "a-ref.png" && pair.local === "b-local.png",
    JSON.stringify(pair)
  );
  check(
    "pickPngPair: ?ref= выбирает эталон, а не порядок",
    JSON.stringify(pickPngPair(["a.png", "b.png"], "b.png")) === '{"ref":"b.png","local":"a.png"}'
  );
  check(
    "pickPngPair: неизвестный ref → первый по алфавиту",
    pickPngPair(["a.png", "b.png"], "нет.png").ref === "a.png"
  );
  let pairErr = "";
  try {
    pickPngPair(["._a.png", "a.png"], "a.png");
  } catch (e) {
    pairErr = e.message;
  }
  check("pickPngPair: один живой PNG → ошибка", pairErr.includes("пришло 1"), pairErr);

  // ── get_checklist / add_animation ──
  const cl = await rpc("tools/call", { name: "get_checklist", arguments: { stage: "qa" } });
  check("get_checklist(qa)", text(cl).includes("naturalWidth"));
  const clImport = await rpc("tools/call", { name: "get_checklist", arguments: { stage: "import" } });
  check("get_checklist(import): нет Figma MCP → спросить", text(clImport).includes("СТОП: спросить пользователя"));
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
  check("  контент центрирован, max-width 1248", accCss.includes("max-width: 1248px") && /\.cur-content[^}]*margin:\s*0\s+auto/.test(accCss));

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
