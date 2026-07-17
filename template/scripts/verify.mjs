#!/usr/bin/env node
/* parity-QA прототипа (см. proto://knowledge/verification).
   Запуск: node scripts/verify.mjs [baseUrl]   (дефолт http://localhost:3000)
   Сервер должен быть запущен (npm run dev или build+start).

   Уровень 1 (без зависимостей): роуты из lib/dashboards.ts отдают 200 и
   контент; все /assets|/fonts-ссылки из HTML существуют.
   Уровень 2 (если установлен playwright): битые <img> (naturalWidth===0),
   ошибки консоли/hydration, программный проклик панели tools. */

import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  failures++;
  console.error(`  ✗ ${m}`);
};

// ── роуты из реестра дашбордов (реестра нет без панели tools — тогда только /) ──
const regPath = path.resolve("lib/dashboards.ts");
const reg = fs.existsSync(regPath) ? fs.readFileSync(regPath, "utf8") : "";
const routes = [...reg.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
if (routes.length === 0) routes.push("/");

console.log(`verify: ${BASE}, роуты: ${routes.join(", ")}`);

// сервер жив?
try {
  await fetch(BASE, { redirect: "manual" });
} catch {
  console.error(`Сервер недоступен на ${BASE}. Запустите npm run dev (или build+start).`);
  process.exit(2);
}

// ── уровень 1: роуты + статические ссылки ──
const seenAssets = new Set();
for (const route of routes) {
  const res = await fetch(BASE + route);
  if (res.status !== 200) {
    bad(`${route} → HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  if (html.length < 500) {
    bad(`${route} → подозрительно пустой ответ (${html.length} байт)`);
    continue;
  }
  ok(`${route} → 200, ${html.length} байт`);
  for (const m of html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)) {
    seenAssets.add(m[1]);
  }
}
for (const asset of seenAssets) {
  const res = await fetch(BASE + asset, { method: "HEAD" });
  if (res.status !== 200) bad(`ассет ${asset} → HTTP ${res.status}`);
}
if (seenAssets.size) ok(`ассеты по ссылкам: ${seenAssets.size} шт. проверено`);

// ── уровень 2: браузерные проверки (опционально) ──
let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("  ⚠ playwright не установлен — браузерные проверки пропущены");
  console.log("    (npm i -D playwright && npx playwright install chromium)");
}
if (chromium) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    // битые картинки: браузер молча рендерит пустоту — ловим naturalWidth
    const broken = await page.$$eval("img", (imgs) =>
      imgs.filter((i) => i.naturalWidth === 0 && i.src).map((i) => i.src)
    );
    if (broken.length) bad(`${route}: битые <img>: ${broken.join(", ")}`);
    else ok(`${route}: 0 битых <img>`);

    // проклик панели tools программно (не «на глаз»)
    const fab = await page.$(".twk-fab");
    if (fab) {
      await page.evaluate(() =>
        document
          .querySelector(".twk-fab")
          .dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      await page.waitForTimeout(700);
      const open = await page.evaluate(() =>
        document.body.classList.contains("twk-open")
      );
      if (open) ok(`${route}: панель tools открывается`);
      else bad(`${route}: панель tools не открылась`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
  const hydration = consoleErrors.filter((e) => /hydrat/i.test(e));
  if (hydration.length) bad(`hydration-ошибки: ${hydration.length}`);
  if (consoleErrors.length) bad(`ошибки консоли (${consoleErrors.length}): ${consoleErrors[0]}`);
  else ok("консоль чистая");
  await browser.close();
}

console.log(failures ? `\nFAIL: ${failures} проблем` : "\nOK: все проверки пройдены");
process.exit(failures ? 1 : 0);
