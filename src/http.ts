import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./app.js";
import { ServerCtx } from "./lib/ctx.js";
import { PKG_ROOT } from "./lib/paths.js";
import { processAssetsDir, ProcessOptions } from "./lib/process.js";
import { digest, DigestMode } from "./lib/digest.js";
import { parity } from "./lib/parity.js";

/* Streamable HTTP хостинг (stateless): один сервер на команду.
   Дополнительные эндпоинты:
   - GET /dl/<id>/<name>  — скачивание артефактов (тарбол скаффолда), TTL 30 мин;
   - POST /process        — round-trip обработка папки ассетов (tar.gz → tar.gz);
   - POST /digest         — сжатие выдачи Figma MCP (текст → текст);
   - POST /parity         — бленд-дифф двух PNG (tar.gz → текст);
   - GET /healthz.
   Auth: env PROTO_AUTH_TOKEN → Bearer на /mcp; /dl и /process защищены
   неугадываемыми путями (uuid / суффикс из хеша токена), чтобы curl-команды
   агента работали без прокидывания заголовков. */

const DL_TTL_MS = 30 * 60 * 1000;
interface DlEntry {
  path: string;
  name: string;
  expires: number;
}
const downloads = new Map<string, DlEntry>();
setInterval(() => {
  const now = Date.now();
  for (const [id, e] of downloads) {
    if (e.expires < now) {
      fs.rmSync(path.dirname(e.path), { recursive: true, force: true });
      downloads.delete(id);
    }
  }
}, 60_000).unref();

export function startHttp(port: number) {
  const authToken = process.env.PROTO_AUTH_TOKEN || "";
  // стабильный неугадываемый суффикс для /process при включённом auth
  const processSuffix = authToken
    ? "-" + crypto.createHash("sha256").update(authToken).digest("hex").slice(0, 16)
    : "";
  const processRoute = `/process${processSuffix}`;
  const digestRoute = `/digest${processSuffix}`;
  const parityRoute = `/parity${processSuffix}`;

  const app = express();
  app.disable("x-powered-by");
  // За reverse-proxy (Traefik терминирует TLS) — доверяем первому хопу,
  // чтобы req.protocol брался из X-Forwarded-Proto (=https). Иначе URL
  // для /dl и /process сгенерятся как http:// и curl без -L упадёт на
  // редиректе HTTP→HTTPS.
  app.set("trust proxy", 1);

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!authToken) return next();
    const h = req.headers.authorization ?? "";
    if (h === `Bearer ${authToken}`) return next();
    res.status(401).json({ error: "unauthorized" });
  };

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, server: "alfa-mcp", transport: "streamable-http" });
  });

  // ── аватарка коннектора (публично, без auth): логотип из brand/ ──
  for (const [route, file, mime] of [
    ["/icon.svg", "brand/icon.svg", "image/svg+xml"],
    ["/icon.png", "brand/icon.png", "image/png"],
    ["/favicon.ico", "brand/icon.png", "image/png"],
  ] as const) {
    app.get(route, (_req, res) => {
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(path.join(PKG_ROOT, file)).pipe(res);
    });
  }

  // ── MCP (stateless: инстанс на запрос) ──
  app.post("/mcp", requireAuth, express.json({ limit: "8mb" }), async (req, res) => {
    const base = `${req.protocol}://${req.headers.host}`;
    const ctx: ServerCtx = {
      mode: "http",
      baseUrl: base,
      processUrl: `${base}${processRoute}`,
      digestUrl: `${base}${digestRoute}`,
      parityUrl: `${base}${parityRoute}`,
      publish: (filePath, name) => {
        const id = crypto.randomUUID();
        downloads.set(id, { path: filePath, name, expires: Date.now() + DL_TTL_MS });
        return `${base}/dl/${id}/${encodeURIComponent(name)}`;
      },
    };
    const server = buildServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: String(e) },
          id: null,
        });
      }
    }
  });
  // stateless-режим: GET (SSE-стрим) и DELETE (сессии) не поддерживаем
  app.all("/mcp", (_req, res) => {
    res.status(405).json({ error: "stateless server: POST only" });
  });

  // ── скачивание артефактов ──
  app.get("/dl/:id/:name", (req, res) => {
    const e = downloads.get(req.params.id);
    if (!e || e.expires < Date.now()) {
      res.status(404).send("not found or expired");
      return;
    }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${e.name}"`);
    fs.createReadStream(e.path).pipe(res);
  });

  // ── round-trip обработка ассетов: tar.gz → обработка → tar.gz ──
  app.post(
    processRoute,
    express.raw({ type: () => true, limit: "300mb" }),
    async (req, res) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-process-"));
      try {
        const inTgz = path.join(tmp, "in.tgz");
        fs.writeFileSync(inTgz, req.body as Buffer);
        const work = path.join(tmp, "assets");
        fs.mkdirSync(work);
        execFileSync("tar", ["xzf", inTgz, "-C", work]);

        const q = req.query;
        const opts: ProcessOptions = {
          webp: q.webp !== "0",
          cleanBackground: typeof q.clean === "string" && q.clean ? q.clean.split(",") : [],
          rounded:
            typeof q.round === "string" && q.round
              ? q.round.split(",").map((pair) => {
                  const [file, radius] = pair.split(":");
                  return { file, radius: Number(radius) || 12 };
                })
              : [],
          rasterize: typeof q.raster === "string" && q.raster ? q.raster.split(",") : [],
        };
        const report = await processAssetsDir(work, opts);
        fs.writeFileSync(path.join(work, "_report.txt"), report.join("\n") + "\n", "utf8");

        const outTgz = path.join(tmp, "out.tgz");
        execFileSync("tar", ["-C", work, "-czf", outTgz, "."]);
        res.setHeader("Content-Type", "application/gzip");
        fs.createReadStream(outTgz).on("end", () => {
          fs.rmSync(tmp, { recursive: true, force: true });
        }).pipe(res);
      } catch (e) {
        fs.rmSync(tmp, { recursive: true, force: true });
        res.status(400).send(`process failed: ${String(e)}`);
      }
    }
  );

  // ── сжатие выдачи Figma MCP: сырой текст → дайджест текстом ──
  app.post(
    digestRoute,
    express.raw({ type: () => true, limit: "64mb" }),
    (req, res) => {
      try {
        const raw = (req.body as Buffer).toString("utf8");
        if (!raw.trim()) {
          res.status(400).type("text/plain; charset=utf-8").send("пустое тело запроса");
          return;
        }
        const mode = (typeof req.query.mode === "string" ? req.query.mode : "auto") as DigestMode;
        const depth = Number(req.query.depth) || 3;
        res
          .type("text/plain; charset=utf-8")
          .send(digest(raw, mode, depth).join("\n") + "\n");
      } catch (e) {
        res.status(400).type("text/plain; charset=utf-8").send(`digest failed: ${String(e)}`);
      }
    }
  );

  // ── бленд-дифф: tar.gz с двумя PNG → текстовый отчёт ──
  app.post(
    parityRoute,
    express.raw({ type: () => true, limit: "100mb" }),
    async (req, res) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-parity-"));
      try {
        const inTgz = path.join(tmp, "in.tgz");
        fs.writeFileSync(inTgz, req.body as Buffer);
        const work = path.join(tmp, "png");
        fs.mkdirSync(work);
        execFileSync("tar", ["xzf", inTgz, "-C", work]);

        const pngs = fs
          .readdirSync(work)
          .filter((f) => /\.png$/i.test(f))
          .sort();
        if (pngs.length < 2) throw new Error(`нужны два PNG, пришло ${pngs.length}`);
        const refName = typeof req.query.ref === "string" ? req.query.ref : pngs[0];
        const ref = pngs.includes(refName) ? refName : pngs[0];
        const local = pngs.find((f) => f !== ref)!;

        const ignore =
          typeof req.query.ignore === "string" && req.query.ignore
            ? req.query.ignore.split(";").map((r) => {
                const [x, y, w, h] = r.split(",").map(Number);
                return { x, y, w, h };
              })
            : [];
        const report = await parity(
          fs.readFileSync(path.join(work, ref)),
          fs.readFileSync(path.join(work, local)),
          { threshold: Number(req.query.thr) || 32, ignore }
        );
        res
          .type("text/plain; charset=utf-8")
          .send(
            [`эталон: ${ref}, локальный: ${local}`, ...report.lines].join("\n") + "\n"
          );
      } catch (e) {
        res.status(400).type("text/plain; charset=utf-8").send(`parity failed: ${String(e)}`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  );

  app.listen(port, () => {
    console.error(
      `alfa-mcp MCP server: http://0.0.0.0:${port}/mcp (streamable, stateless)` +
        (authToken ? " [auth: bearer]" : " [auth: OFF]")
    );
  });
}
