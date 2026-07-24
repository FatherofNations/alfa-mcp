/* Компрессор выдачи Figma MCP.

   Проблема, ради которой это написано: get_design_context разворачивает
   КАЖДОГО повторяющегося ребёнка целиком. Дашборд Альфа-Бизнеса — это
   таблицы, то есть 7…20 копий одного и того же поддерева ячеек. Реальные
   замеры на одном макете (283:196383):

     get_metadata корня          101 160 символов
     «Счета» (7 строк)            75 419
     [D] SideMenu (14 пунктов)    87 233
     строки «Ленты» (14 строк)   131 865
     ————————————————————————————————————
     итого ~396 000, полезного   ~8 000 (2%)

   Каждый такой ответ не влезает в лимит, падает в файл, и агент пишет под
   него разовый экстрактор. Здесь эти экстракторы сведены в один тул.

   Всё ниже — эвристики над ТЕКСТОМ выдачи (React+Tailwind или XML
   метаданных), а не парсер Figma. Поэтому отчёт всегда честно помечает,
   что это дайджест, и подсказывает, за чем идти в исходник. */

export type DigestMode = "auto" | "layout" | "rows" | "text" | "assets";

/* ── нормализация входа ────────────────────────────────────────────────
   Клиент сохраняет слишком большой ответ тула как JSON [{type,text}].
   Принимаем и его, и сырой текст. */
export function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const joined = arr
        .map((x) => (typeof x === "string" ? x : (x?.text ?? "")))
        .filter(Boolean)
        .join("\n");
      if (joined) return joined;
    } catch {
      /* не JSON — работаем с сырым текстом */
    }
  }
  return raw;
}

export function detectMode(src: string): Exclude<DigestMode, "auto"> {
  if (/<frame\s+id=|<instance\s+id=|<text\s+id=/.test(src)) return "layout";
  if (countRepeats(src).length) return "rows";
  if (/const\s+img\w+\s*=\s*"/.test(src)) return "assets";
  return "text";
}

/* ── общие утилиты ─────────────────────────────────────────────────── */

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** тексты внутри чанка: обычные <p>…</p> и шаблонные {`…`} */
function textsIn(chunk: string): string[] {
  const out: string[] = [];
  for (const m of chunk.matchAll(/>\s*([^<>{][^<>]*?)\s*<\/p>/g)) out.push(m[1]);
  for (const m of chunk.matchAll(/\{`([^`]*)`\}/g)) out.push(m[1].trim());
  return out.filter((t) => t.length > 0);
}

/** экранируем невидимые пробелы, чтобы они были видны в отчёте */
export function showInvisible(s: string): string {
  return s
    .replace(/ /g, "⎵") // medium math space — им набраны разряды в Альфе
    .replace(/ /g, "⎸") // thin space — вокруг ₽
    .replace(/ /g, "⍽");
}

/* ── mode=layout: дерево get_metadata со схлопыванием повторов ──────── */

interface Node {
  indent: number;
  tag: string;
  id: string;
  name: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  hidden: boolean;
}

function parseLayout(src: string): Node[] {
  const nodes: Node[] = [];
  for (const line of src.split("\n")) {
    const m = line.match(
      /^(\s*)<(\w+)\s+id="([^"]+)"\s+name="([^"]*)"(?:\s+x="([-\d.]+)")?(?:\s+y="([-\d.]+)")?(?:\s+width="([-\d.]+)")?(?:\s+height="([-\d.]+)")?/
    );
    if (!m) continue;
    nodes.push({
      indent: m[1].length,
      tag: m[2],
      id: m[3],
      name: m[4],
      x: num(m[5]),
      y: num(m[6]),
      w: num(m[7]),
      h: num(m[8]),
      hidden: /hidden="true"/.test(line),
    });
  }
  return nodes;
}

/** имя без хвостового номера: «Frame 2147238271» и «Frame 2147238263» — одно семейство */
const family = (n: Node) => `${n.tag}:${n.name.replace(/\s*\d{3,}\s*$/, "").trim()}:${n.w}×${n.h}`;

function digestLayout(src: string, maxDepth: number): string[] {
  const nodes = parseLayout(src);
  if (!nodes.length) return ["Не похоже на выдачу get_metadata (нет <frame id=…>)."];

  const base = Math.min(...nodes.map((n) => n.indent));
  const out: string[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    const depth = (n.indent - base) / 2;
    if (depth > maxDepth) {
      i++;
      continue;
    }
    // сколько подряд идущих сиблингов того же семейства на том же уровне
    const run: Node[] = [n];
    let j = i + 1;
    while (j < nodes.length) {
      const c = nodes[j];
      if (c.indent < n.indent) break; // вышли из родителя
      if (c.indent === n.indent) {
        if (family(c) !== family(n)) break;
        run.push(c);
      }
      j++;
    }
    const pad = "  ".repeat(depth);
    const geo = (m: Node) =>
      `x=${m.x ?? "?"} y=${m.y ?? "?"} ${m.w ?? "?"}×${m.h ?? "?"}`;
    if (run.length >= 3) {
      // повтор — схлопываем. Направление раскладки определяем по шагу:
      // вертикальный ряд — это строки таблицы, горизонтальный — карточки.
      const d = (k: "x" | "y") =>
        run[1][k] !== undefined && run[0][k] !== undefined
          ? +(run[1][k]! - run[0][k]!).toFixed(2)
          : 0;
      const dy = d("y");
      const dx = d("x");
      const vertical = Math.abs(dy) > Math.abs(dx);
      const axis = vertical ? `шаг y=${dy}` : `шаг x=${dx}`;
      const start = vertical ? `первый y=${run[0].y ?? "?"}` : `первый x=${run[0].x ?? "?"}`;
      // зебра — только для вертикального ряда, где x прыгает между 2 значениями
      // (в макетах Альфы подложка вставлена на 6px, поэтому x строк чередуется)
      const xs = [...new Set(run.map((m) => m.x))];
      const zebra =
        vertical && xs.length === 2
          ? `, x чередуется ${xs.join("/")} ← подложка зебры вставлена внутрь`
          : "";
      out.push(
        `${pad}${run.length}× ${n.tag} «${n.name}» ${n.w ?? "?"}×${n.h ?? "?"}, ${axis}, ${start}${zebra}`
      );
      out.push(
        `${pad}  id первого: ${run[0].id} — геометрию брать по нему, ` +
          `остальные ${run.length - 1} такие же`
      );
      i = j;
      continue;
    }
    out.push(
      `${pad}${n.tag} ${n.id} «${n.name}» ${geo(n)}${n.hidden ? " [hidden]" : ""}`
    );
    i++;
  }
  return out;
}

/* ── mode=rows: таблица — геометрия одной строки + матрица текстов ──── */

/** Открывающие теги с data-name, по индексу в исходнике.
   className в выдаче Figma стоит ДО data-name внутри того же тега, поэтому
   резать текст по вхождению data-name нельзя — класс уедет в предыдущий
   кусок (и ширины ячеек сдвинутся на одну). Разбираем тег целиком. */
interface Tagged {
  name: string;
  cls: string;
  start: number;
}
function findTagged(src: string, filter: (name: string) => boolean): Tagged[] {
  const out: Tagged[] = [];
  for (const m of src.matchAll(/<div\s([^>]*)>/g)) {
    const attrs = m[1];
    const name = attrs.match(/data-name="([^"]+)"/)?.[1];
    if (!name || !filter(name)) continue;
    out.push({
      name,
      cls: attrs.match(/className="([^"]*)"/)?.[1] ?? "",
      start: m.index!,
    });
  }
  return out;
}

/** какие data-name повторяются ≥3 раз — кандидаты на «строку» */
function countRepeats(src: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of src.matchAll(/data-name="([^"]+)"/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** ширины/паддинги ячейки из tailwind-классов */
function cellGeometry(cls: string): string {
  const w = cls.match(/\bw-\[([\d.]+)px\]/)?.[1];
  const flex = /flex-\[1_0_0\]|flex-1\b/.test(cls) ? "flex" : undefined;
  const pl = cls.match(/\bpl-\[([\d.]+)px\]/)?.[1];
  const pr = cls.match(/\bpr-\[([\d.]+)px\]/)?.[1];
  const py = cls.match(/\bpy-\[([\d.]+)px\]/)?.[1];
  const px = cls.match(/\bpx-\[([\d.]+)px\]/)?.[1];
  const align = /items-end/.test(cls)
    ? "items-end"
    : /items-center/.test(cls)
      ? "items-center"
      : "items-start";
  const shrink0 = /shrink-0/.test(cls) ? " shrink-0" : "";
  const parts = [
    `ширина ${w ? w + "px" : (flex ?? "auto")}`,
    `pad ${pl ?? px ?? 0}/${pr ?? px ?? 0}/${py ?? 0}`,
    align + shrink0,
  ];
  return parts.join(", ");
}

function digestRows(src: string): string[] {
  const repeats = countRepeats(src);
  if (!repeats.length) return ["Повторяющихся data-name (≥3) не нашлось — это не таблица."];

  // «строка» — самый частый повтор, но не служебные обёртки
  const rowName =
    repeats.find((r) => /row/i.test(r.name))?.name ??
    repeats.find((r) => /cell/i.test(r.name) === false)?.name ??
    repeats[0].name;

  const rowTags = findTagged(src, (n) => n === rowName);
  const bounds = rowTags.map((t, i) => ({
    tag: t,
    body: src.slice(t.start, rowTags[i + 1]?.start ?? src.length),
  }));
  const out: string[] = [];
  out.push(`# Повтор: «${rowName}» × ${bounds.length}`);
  out.push("");

  // подложка строки — читается из className САМОЙ строки, не из детей
  out.push("## Подложка строки");
  for (const b of bounds.slice(0, 4)) {
    const c = b.tag.cls;
    const bg = c.match(/bg-\[([^\]]+)\]/)?.[1];
    const radius = c.match(/rounded-\[([^\]]+)\]/)?.[1];
    const h = c.match(/\bh-\[([\d.]+)px\]/)?.[1];
    const top = c.match(/\btop-\[([-\d.]+)px\]/)?.[1];
    const inset = c.match(/left-\[([-\d.]+)px\][\s\S]*?right-\[([-\d.]+)px\]/);
    out.push(
      `  строка ${bounds.indexOf(b) + 1}: h=${h ?? "?"}` +
        (top ? `, top=${top}` : "") +
        `, фон ${bg ?? "нет"}, скругление ${radius ?? "нет"}` +
        (inset ? `, инсет ${inset[1]}/${inset[2]}` : "")
    );
  }
  out.push(
    "  (фон есть не у всех строк — это зебра; инсет left/right = насколько " +
      "подложка вставлена внутрь карточки)"
  );
  out.push("");

  // геометрия ячеек ПЕРВОЙ строки
  const cellTags = findTagged(
    bounds[0].body,
    (n) => /cell/i.test(n) && n.toLowerCase() !== "cells"
  );
  if (cellTags.length) {
    out.push("## Геометрия ячеек (по первой строке)");
    let total = 0;
    cellTags.forEach((t, i) => {
      const body = bounds[0].body.slice(t.start, cellTags[i + 1]?.start ?? bounds[0].body.length);
      const w = t.cls.match(/\bw-\[([\d.]+)px\]/)?.[1];
      if (w) total += Number(w);
      const txt = textsIn(body).slice(0, 2).map(showInvisible).join(" + ");
      out.push(`${i + 1}. ${t.name} — ${cellGeometry(t.cls)}${txt ? `  → «${txt}»` : ""}`);
    });
    out.push(
      `  сумма фиксированных ширин ${total}px; остаток забирает колонка flex — ` +
        "сверь с шириной карточки, разница обычно и есть переполнение из макета"
    );
    out.push("");
  }

  // матрица текстов
  out.push("## Тексты строк");
  bounds.forEach((b, i) => {
    const t = textsIn(b.body).map(showInvisible);
    out.push(`${String(i + 1).padStart(2)} | ${t.join(" | ")}`);
  });
  out.push("");
  out.push(
    "Невидимые пробелы: ⎵ = U+205F (разряды), ⎸ = U+2009 (перед ₽), ⍽ = NBSP. " +
      "Переносить в код именно их, иначе разъедется ширина."
  );
  return out;
}

/* ── mode=text: инвентарь типографики ──────────────────────────────── */

function styleSignature(cls: string): string {
  const size = cls.match(/text-\[(\d+)px\]/)?.[1];
  const lh = cls.match(/leading-\[(\d+)px\]/)?.[1];
  const family = cls.match(/'([\w_ ]+):(\w+)'/);
  const color = cls.match(/text-\[color:var\(([^,)]+)/)?.[1]?.replace(/\\/g, "");
  const ls = cls.match(/tracking-\[(?:var\()?([^,)\]]+)/)?.[1]?.replace(/\\/g, "");
  return [
    family ? `${family[1].replace(/_/g, " ")} ${family[2]}` : "?",
    size && lh ? `${size}/${lh}` : (size ?? "?"),
    color ?? "",
    ls ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function digestText(src: string): string[] {
  const groups = new Map<string, string[]>();
  for (const m of src.matchAll(/<p className="([^"]*)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const sig = styleSignature(m[1]);
    const text = m[2].replace(/\{`([^`]*)`\}/g, "$1").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(showInvisible(text));
  }
  // текстовые блоки, где типографика висит на родительском div
  for (const m of src.matchAll(/<div className="([^"]*text-\[\d+px\][^"]*)"[^>]*>\s*<p className="([^"]*)">([^<]+)<\/p>/g)) {
    const sig = styleSignature(m[1] + " " + m[2]);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(showInvisible(m[3].trim()));
  }
  if (!groups.size) return ["Текстовых узлов не нашлось."];
  const out = ["# Типографика по стилям", ""];
  // группы без единого распознанного признака («? · ?») — это те же тексты,
  // подобранные фолбэком; они только шумят рядом с разобранными
  const useful = [...groups.entries()].filter(([sig]) => !/^\?\s*·\s*\?$/.test(sig));
  for (const [sig, texts] of (useful.length ? useful : [...groups.entries()]).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    const uniq = [...new Set(texts)];
    out.push(`## ${sig}  (${texts.length} узлов)`);
    out.push(uniq.slice(0, 24).map((t) => `«${t}»`).join(", ") + (uniq.length > 24 ? ", …" : ""));
    out.push("");
  }
  out.push(
    "ВАЖНО: шрифт контента может отличаться от шрифта хрома (в макетах Альфы " +
      "тело таблиц набрано SF Pro Text, а меню — Alfa Interface Sans). " +
      "Не предполагать — смотреть сигнатуру каждой зоны."
  );
  return out;
}

/* ── mode=assets: именованные ассеты + готовый curl ─────────────────── */

/** по имени константы и контексту использования предлагаем имя файла */
function guessName(constName: string, context: string, before: string): string {
  // ближайший data-name перед подстановкой src={imgX}
  const dataNames = [...context.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]);
  const dataName = dataNames.at(-1);
  // имя компонента, внутри которого лежит иконка: DotsHorizontal, Magnifier…
  // ищем по всему тексту до usage, а не в окне — объявление бывает далеко
  const fns = [...before.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]);
  const fnName = fns.at(-1);
  const generic = (s: string) =>
    /^(fixer|icon|content|union|vector|shape\w*|bg\w*|mask)\d*$/i.test(s);
  const named = dataNames.filter((n) => !generic(n)).at(-1);
  const raw =
    (dataName && !generic(dataName) ? dataName : undefined) ??
    (fnName && !generic(fnName) ? fnName : undefined) ??
    named ??
    constName.replace(/^img/, "");
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function digestAssets(src: string): string[] {
  const consts = [...src.matchAll(/const\s+(img\w+)\s*=\s*"([^"]+)"/g)].map((m) => ({
    name: m[1],
    url: m[2],
  }));
  if (!consts.length) {
    return [
      "Именованных ассетов (const imgX = \"…\") в выдаче нет.",
      "Если нужны иконки — зови get_design_context на узел, где они рендерятся:",
      "download_assets на контейнере вернёт БЕЗЫМЯННЫЕ url с обрезкой на 20 штук.",
    ];
  }
  const out = ["# Ассеты из design context", ""];
  const rows: { file: string; url: string; c: string }[] = [];
  for (const c of consts) {
    // контекст использования: 600 символов вокруг первой подстановки src={imgX}
    const useIdx = src.search(new RegExp(`\\b${c.name}\\b(?!\\s*=)`));
    const ctxStart = useIdx >= 0 ? Math.max(0, useIdx - 600) : 0;
    const context = useIdx >= 0 ? src.slice(ctxStart, useIdx + 60) : "";
    const before = useIdx >= 0 ? src.slice(0, useIdx) : "";
    let guessed = guessName(c.name, context, before);
    // одинаковые имена бывают (два размера одной иконки) — разводим суффиксом
    if (rows.some((r) => r.file === guessed)) {
      let n = 2;
      while (rows.some((r) => r.file === `${guessed}-${n}`)) n++;
      guessed = `${guessed}-${n}`;
    }
    rows.push({ file: guessed, url: c.url, c: c.name });
  }
  out.push("| константа | предлагаемое имя | url |");
  out.push("|---|---|---|");
  for (const r of rows) out.push(`| ${r.c} | ${r.file} | ${r.url} |`);
  out.push("");
  out.push("## Скачать (проверь имена глазами — они угаданы по data-name)");
  out.push("```bash");
  out.push("mkdir -p public/assets/figma && cd public/assets/figma");
  for (const r of rows) {
    out.push(`curl -fsSL -o ${r.file}.svg "${r.url}"`);
  }
  out.push('file * | sed "s/;.*//"   # проверить, что svg — это svg, а png — png');
  out.push("```");
  out.push("");
  out.push(
    "Расширение угадано как .svg — Figma отдаёт по этим url тот формат, который " +
      "у узла; после скачивания сверить `file` и переименовать. Дальше — process_assets."
  );
  return out;
}

/* ── точка входа ───────────────────────────────────────────────────── */

export function digest(raw: string, mode: DigestMode, maxDepth = 3): string[] {
  const src = normalizeInput(raw);
  const resolved = mode === "auto" ? detectMode(src) : mode;
  const head = [
    `# digest_design_context — режим «${resolved}»${mode === "auto" ? " (авто)" : ""}`,
    `Вход: ${src.length.toLocaleString("ru-RU")} символов.`,
    "",
  ];
  let body: string[];
  switch (resolved) {
    case "layout":
      body = digestLayout(src, maxDepth);
      break;
    case "rows":
      body = digestRows(src);
      break;
    case "text":
      body = digestText(src);
      break;
    case "assets":
      body = digestAssets(src);
      break;
  }
  const out = [...head, ...body];
  const size = out.join("\n").length;
  out.push("");
  out.push(
    `— сжато ${src.length.toLocaleString("ru-RU")} → ${size.toLocaleString("ru-RU")} ` +
      `(${((100 * size) / Math.max(1, src.length)).toFixed(1)}%). ` +
      "Это ДАЙДЖЕСТ по эвристикам, не полная выдача: за точным значением " +
      "конкретного узла идти в get_design_context на этот узел."
  );
  return out;
}
