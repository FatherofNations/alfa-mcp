#!/usr/bin/env node
/* Smoke-тест HTTP-режима: Streamable HTTP (stateless) + /dl + /process.
   Запуск: node test/smoke-http.mjs (после npm run build). */

import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 8899;
const TOKEN = "smoke-test-token";
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alfa-mcp-http-"));

const server = spawn("node", [path.resolve("dist/server.js"), "--http", String(PORT)], {
  env: { ...process.env, PROTO_AUTH_TOKEN: TOKEN },
  stdio: ["ignore", "inherit", "inherit"],
});

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function rpc(method, params = {}, id = 1) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}
const text = (r) => r.content?.map((c) => c.text).join("\n") ?? "";

try {
  // ждём старт
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const health = await fetch(`${BASE}/healthz`);
  check("healthz", health.ok);

  // auth: без токена — 401
  const noAuth = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check("auth: 401 без токена", noAuth.status === 401);

  // initialize + tools/list (stateless: каждый запрос самодостаточен)
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-http", version: "0" },
  });
  check("initialize", init.serverInfo?.name === "alfa-mcp");
  check(
    "иконка коннектора (http: URL на сервере)",
    init.serverInfo?.icons?.some((i) => i.src === `${BASE}/icon.png`)
  );
  const iconRes = await fetch(`${BASE}/icon.png`);
  check("GET /icon.png = 200 png", iconRes.ok && iconRes.headers.get("content-type") === "image/png");
  const tools = await rpc("tools/list", {}, 2);
  check("tools/list = 11", tools.tools.length === 11, `получено ${tools.tools.length}`);

  // ── scaffold → тарбол через /dl ──
  const scaffold = await rpc(
    "tools/call",
    {
      name: "scaffold_project",
      arguments: { stack: "next", name: "http-proto", features: { toolsPanel: true }, installFonts: false },
    },
    3
  );
  const sOut = text(scaffold);
  const dlUrl = sOut.match(/curl -fsS -o http-proto\.tgz "([^"]+)"/)?.[1];
  check("scaffold: выдал /dl-ссылку", Boolean(dlUrl), sOut.slice(0, 300));
  if (dlUrl) {
    const tgz = await fetch(dlUrl);
    check("тарбол скачивается", tgz.ok);
    const tgzPath = path.join(tmp, "p.tgz");
    fs.writeFileSync(tgzPath, Buffer.from(await tgz.arrayBuffer()));
    execFileSync("tar", ["xzf", tgzPath, "-C", tmp]);
    check(
      "тарбол: проект с панелью",
      fs.existsSync(path.join(tmp, "http-proto/components/tools/ToolsPanel.tsx")) &&
        fs.existsSync(path.join(tmp, "http-proto/app/page.tsx"))
    );
    const gone = await fetch(dlUrl.replace(/dl\/[0-9a-f-]+/, `dl/${crypto.randomUUID()}`));
    check("чужой id → 404", gone.status === 404);
  }

  // ── process round-trip ──
  const assets = path.join(tmp, "assets");
  fs.mkdirSync(assets);
  fs.writeFileSync(
    path.join(assets, "icon.svg"),
    '<svg viewBox="0 0 24 24"><path fill="var(--fill-0, #EF3124)" d="M4 4h16"/></svg>'
  );
  // флаг → форсим растеризацию через query ?raster=flag
  fs.writeFileSync(
    path.join(assets, "flag.svg"),
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="var(--fill-0, #3C3B6E)"/></svg>'
  );
  const inTgz = path.join(tmp, "in.tgz");
  execFileSync("tar", ["-C", assets, "-czf", inTgz, "."]);
  const suffix = "-" + crypto.createHash("sha256").update(TOKEN).digest("hex").slice(0, 16);
  const procRes = await fetch(`${BASE}/process${suffix}?raster=flag`, {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: fs.readFileSync(inTgz),
  });
  check("process: 200", procRes.ok, String(procRes.status));
  const outTgz = path.join(tmp, "out.tgz");
  fs.writeFileSync(outTgz, Buffer.from(await procRes.arrayBuffer()));
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir);
  execFileSync("tar", ["xzf", outTgz, "-C", outDir]);
  check("process: svg почищен", fs.readFileSync(path.join(outDir, "icon.svg"), "utf8").includes('fill="#EF3124"'));
  check(
    "process: флаг растеризован (raster=)",
    (fs.existsSync(path.join(outDir, "flag.webp")) || fs.existsSync(path.join(outDir, "flag.png"))) &&
      !fs.existsSync(path.join(outDir, "flag.svg"))
  );
  check("process: _report.txt внутри", fs.existsSync(path.join(outDir, "_report.txt")));
  const badProc = await fetch(`${BASE}/process`, { method: "POST", body: "x" });
  check("process без суффикса → 404", badProc.status === 404);

  // ── /digest: сырой текст выдачи Figma MCP → дайджест текстом ──
  const bigSrc = Array.from(
    { length: 6 },
    (_, i) =>
      `<div className="absolute h-[49px] left-[6px] right-[6px] rounded-[12px] top-[${109 + i * 49}px]" ` +
      `data-name="[D] BodyRow :: Wide">` +
      `<div className="flex w-[132px] pl-[10px]" data-name="[D] BodyCell :: Wide">` +
      `<p className="x">строка ${i + 1}</p></div></div>`
  ).join("\n");
  const digRes = await fetch(`${BASE}/digest${suffix}?mode=rows`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: bigSrc,
  });
  check("digest: 200", digRes.ok, String(digRes.status));
  const digText = await digRes.text();
  check("digest: повтор найден", digText.includes("«[D] BodyRow :: Wide» × 6"));
  check("digest: тексты строк", digText.includes("строка 6"));
  check("digest: сжатие посчитано", /сжато .+ → /.test(digText));
  const digEmpty = await fetch(`${BASE}/digest${suffix}`, { method: "POST", body: "" });
  check("digest: пустое тело → 400", digEmpty.status === 400);
  check("digest без суффикса → 404", (await fetch(`${BASE}/digest`, { method: "POST", body: "x" })).status === 404);

  // ── /parity: два PNG → отчёт. Готовим кадры сами, sharp уже в зависимостях ──
  const sharp = (await import("sharp")).default;
  const mkPng = async (file, shiftX) => {
    const w = 200;
    const h = 60;
    const bg = Buffer.alloc(w * h * 3, 255);
    // «текстовый» прямоугольник 60×20, сдвинутый на shiftX
    for (let y = 20; y < 40; y++) {
      for (let x = 40 + shiftX; x < 100 + shiftX; x++) {
        const i = (y * w + x) * 3;
        bg[i] = bg[i + 1] = bg[i + 2] = 0;
      }
    }
    await sharp(bg, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
  };
  const pdir = path.join(tmp, "parity");
  fs.mkdirSync(pdir);
  await mkPng(path.join(pdir, "a-ref.png"), 0);
  await mkPng(path.join(pdir, "b-local.png"), 25); // заведомый сдвиг на 25px
  // AppleDouble: имя на .png, картинки внутри нет — сервер обязан их
  // отбросить. Работает как проверка только на Linux (в CI): macOS-tar
  // склеивает «._*» обратно в xattr и в архив их не кладёт, поэтому
  // основное покрытие даёт юнит на pickPngPair в smoke.mjs.
  fs.writeFileSync(path.join(pdir, "._a-ref.png"), Buffer.from("Mac OS X mess"));
  fs.writeFileSync(path.join(pdir, "._b-local.png"), Buffer.from("Mac OS X mess"));
  const pTgz = path.join(tmp, "parity.tgz");
  execFileSync("tar", ["-C", pdir, "-czf", pTgz, "."]);
  const parRes = await fetch(`${BASE}/parity${suffix}?ref=a-ref.png`, {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: fs.readFileSync(pTgz),
  });
  check("parity: 200", parRes.ok, String(parRes.status));
  const parText = await parRes.text();
  check("parity: эталон определён", parText.includes("эталон: a-ref.png"));
  check(
    "parity: AppleDouble «._*» отброшены",
    parText.includes("локальный: b-local.png"),
    parText.slice(0, 200)
  );
  check("parity: сдвиг 25px найден", parText.includes("сдвиг +25px"), parText.slice(0, 400));
  // команды тула: без COPYFILE_DISABLE macOS-tar кладёт «._*» и ломает
  // sharp; в ветке «два готовых файла» query обязан начинаться с ?ref=
  const pCmd = await rpc(
    "tools/call",
    {
      name: "parity_check",
      arguments: { url: "http://localhost:3000/", reference: "https://example.test/r.png" },
    },
    8
  );
  check("parity_check: команда с COPYFILE_DISABLE", text(pCmd).includes("COPYFILE_DISABLE=1 tar czf"));
  const pFiles = await rpc(
    "tools/call",
    { name: "parity_check", arguments: { referenceFile: "a/ref.png", localFile: "b/loc.png" } },
    9
  );
  const pf = text(pFiles);
  check("parity_check (файлы): COPYFILE_DISABLE", pf.includes("COPYFILE_DISABLE=1 tar czf"));
  check("parity_check (файлы): query с ?ref=", pf.includes("/parity") && /\?ref=/.test(pf), pf.slice(0, 300));
  check("parity_check (файлы): нет «&ref=» без «?»", !/parity[a-z0-9-]*&ref=/.test(pf));

  const parBad = await fetch(`${BASE}/parity${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: Buffer.from("не тарбол"),
  });
  check("parity: мусор на входе → 400", parBad.status === 400);

  // ── register_dashboard + preset (http): тарбол через /dl ──
  const rp = await rpc(
    "tools/call",
    { name: "register_dashboard", arguments: { name: "Бухгалтер", route: "/buh", preset: "accountant" } },
    7
  );
  const rpText = text(rp);
  const rpUrl = rpText.match(/curl -fsS -o dash\.tgz "([^"]+)"/)?.[1];
  check("register_dashboard preset (http): /dl-тарбол", Boolean(rpUrl), rpText.slice(0, 200));
  if (rpUrl) {
    const t = await fetch(rpUrl);
    check("  тарбол пресета скачивается", t.ok && (await t.arrayBuffer()).byteLength > 50000);
  }

  // ── extract_tokens: отдаёт контент, не пишет файлы ──
  const tok = await rpc(
    "tools/call",
    { name: "extract_tokens", arguments: { variableDefs: { "text/primary": "#111" } } },
    4
  );
  check("extract_tokens (http): контент css", text(tok).includes("--text-primary: #111;") && text(tok).includes("запиши"));

  // ── process_assets тул в http-режиме отдаёт curl-команду ──
  const pa = await rpc("tools/call", { name: "process_assets", arguments: {} }, 5);
  check("process_assets (http): curl-команда", text(pa).includes("curl -fsS -X POST") && text(pa).includes("/process"));
} catch (e) {
  failures++;
  console.error(`✗ ${e.message}`);
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\nFAIL (http): ${failures}` : "\nOK: http smoke-тест пройден");
process.exit(failures ? 1 : 0);
