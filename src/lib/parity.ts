import sharp from "sharp";

/* Бленд-дифф эталона Figma и локального рендера.

   Зачем именно так, а не «посмотреть картинки рядом»: на реальном макете
   пять дефектов из пяти оказались невидимы глазом, потому что каждый из
   них выглядел правдоподобно —

     суммы выровнены по левому краю ячейки, а не по правому   75 px
     шрифт пунктов меню 14, а не 16                           ширина 118 против 133
     иллюстрация без внутреннего трансформа (105.23% + сдвиг)  ~4 px
     потерян замыкающий пробел в «49 720 000,00 RUB »          3 px
     сжатая колонка «Сумма» обрезается не тем элементом        семантика

   Первый — показательный: колонка «выглядит правильной», потому что все
   суммы одинаковой длины. Ловится только замером позиций текстовых ранов.

   Поэтому здесь три уровня: интегральная метрика (есть ли вообще
   расхождение), карта горячих блоков (где) и сравнение текстовых ранов
   (на сколько пикселей и что именно уехало). */

export interface ParityOptions {
  /** порог |Δ| яркости, выше которого пиксель считается расходящимся */
  threshold: number;
  /** прямоугольники, которые не сравниваем: x,y,w,h (хром прототипа, FAB, осознанные отступления) */
  ignore: { x: number; y: number; w: number; h: number }[];
  /** максимум строк в отчёте по ранам */
  maxRuns: number;
  /** порог расхождения рана, с которого он попадает в отчёт */
  runTolerance: number;
}

export const DEFAULT_PARITY: ParityOptions = {
  threshold: 32,
  ignore: [],
  maxRuns: 40,
  runTolerance: 2,
};

interface Gray {
  data: Uint8Array;
  w: number;
  h: number;
}

async function toGray(buf: Buffer): Promise<Gray> {
  const img = sharp(buf).greyscale().removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

const at = (g: Gray, x: number, y: number) => g.data[y * g.w + x];

/** горизонтальные полосы, где вообще есть тёмный контент (строки текста) */
function textBands(g: Gray, darkThr = 170): { y0: number; y1: number }[] {
  const rowHas = new Uint8Array(g.h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (at(g, x, y) < darkThr) {
        rowHas[y] = 1;
        break;
      }
    }
  }
  const bands: { y0: number; y1: number }[] = [];
  let start = -1;
  for (let y = 0; y < g.h; y++) {
    if (rowHas[y] && start < 0) start = y;
    if ((!rowHas[y] || y === g.h - 1) && start >= 0) {
      const end = rowHas[y] ? y : y - 1;
      if (end - start >= 4) bands.push({ y0: start, y1: end });
      start = -1;
    }
  }
  return bands;
}

/** колоночные раны тёмных пикселей внутри полосы (слова/блоки текста).
   gap=16: склеиваем слова в блоки. При маленьком gap сегментация нестабильна —
   один и тот же текст в двух рендерах распадается на разное число кусков, и
   отчёт заполняется ложным «разное число блоков». */
function runsInBand(g: Gray, y0: number, y1: number, darkThr = 170, gap = 16): [number, number][] {
  const colHas = new Uint8Array(g.w);
  for (let y = y0; y <= y1 && y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (at(g, x, y) < darkThr) colHas[x] = 1;
    }
  }
  const runs: [number, number][] = [];
  let s = -1;
  let lastOn = -1;
  for (let x = 0; x < g.w; x++) {
    if (colHas[x]) {
      if (s < 0) s = x;
      lastOn = x;
    } else if (s >= 0 && x - lastOn > gap) {
      runs.push([s, lastOn]);
      s = -1;
    }
  }
  if (s >= 0) runs.push([s, lastOn]);
  return runs;
}

export interface ParityReport {
  lines: string[];
  /** доля расходящихся пикселей — по ней удобно ставить порог в CI */
  diffRatio: number;
  meanAbs: number;
}

export async function parity(
  referencePng: Buffer,
  localPng: Buffer,
  opts: Partial<ParityOptions> = {}
): Promise<ParityReport> {
  const o = { ...DEFAULT_PARITY, ...opts };
  const a = await toGray(referencePng);
  let b = await toGray(localPng);

  const lines: string[] = [];
  lines.push(`# parity_check`);
  lines.push(`эталон ${a.w}×${a.h}, локальный ${b.w}×${b.h}`);

  if (a.w !== b.w || a.h !== b.h) {
    lines.push(
      `⚠ РАЗМЕРЫ НЕ СОВПАЛИ — привожу локальный к эталону. Это уже дефект: ` +
        `снимай скриншот ровно во вьюпорте макета (--window-size=${a.w},${a.h}).`
    );
    const resized = await sharp(localPng).resize(a.w, a.h, { fit: "fill" }).greyscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    b = { data: new Uint8Array(resized.data), w: resized.info.width, h: resized.info.height };
  }

  // маска игнора
  const ignored = new Uint8Array(a.w * a.h);
  for (const r of o.ignore) {
    for (let y = Math.max(0, r.y); y < Math.min(a.h, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(a.w, r.x + r.w); x++) ignored[y * a.w + x] = 1;
    }
  }

  // интегральные метрики
  let sum = 0;
  let over = 0;
  let counted = 0;
  const diff = new Uint8Array(a.w * a.h);
  for (let i = 0; i < diff.length; i++) {
    if (ignored[i]) continue;
    const d = Math.abs(a.data[i] - b.data[i]);
    diff[i] = d;
    sum += d;
    if (d > o.threshold) over++;
    counted++;
  }
  const meanAbs = counted ? sum / counted : 0;
  const diffRatio = counted ? over / counted : 0;
  lines.push("");
  lines.push(`## Метрики`);
  lines.push(`средняя |Δ| ${meanAbs.toFixed(2)}`);
  lines.push(`пикселей с |Δ|>${o.threshold}: ${(100 * diffRatio).toFixed(2)}% (${over})`);
  lines.push(
    diffRatio < 0.005
      ? "→ практически совпадает."
      : diffRatio < 0.03
        ? "→ норма для «сглаживание + растровые иллюстрации», но раны ниже проверить."
        : "→ есть структурное расхождение, смотри горячие блоки."
  );

  // карта горячих блоков 100×100
  const bs = 100;
  const hot: { n: number; y: number; x: number }[] = [];
  for (let y = 0; y < a.h; y += bs) {
    for (let x = 0; x < a.w; x += bs) {
      let n = 0;
      for (let yy = y; yy < Math.min(y + bs, a.h); yy++) {
        for (let xx = x; xx < Math.min(x + bs, a.w); xx++) {
          if (diff[yy * a.w + xx] > o.threshold) n++;
        }
      }
      if (n > 600) hot.push({ n, y, x });
    }
  }
  hot.sort((p, q) => q.n - p.n);
  lines.push("");
  lines.push(`## Горячие блоки 100×100 (>600 расходящихся пикселей)`);
  if (!hot.length) lines.push("нет");
  else for (const h of hot.slice(0, 14)) lines.push(`  ${String(h.n).padStart(5)} px  @ x=${h.x} y=${h.y}`);

  // сравнение текстовых ранов — главный детектор смещений.
  // Игнор-зоны забеливаем в ОБЕИХ картинках, иначе осознанные отступления
  // (например футер меню) лезут в раны и топят настоящие находки.
  const white = (g: Gray): Gray => {
    if (!o.ignore.length) return g;
    const d = new Uint8Array(g.data);
    for (let i = 0; i < d.length; i++) if (ignored[i]) d[i] = 255;
    return { data: d, w: g.w, h: g.h };
  };
  const am = white(a);
  const bm = white(b);

  lines.push("");
  lines.push(`## Смещения текстовых ранов (|Δ| > ${o.runTolerance}px)`);
  const bands = textBands(am);
  const found: string[] = [];
  let unmatched = 0;
  for (const band of bands) {
    if (found.length >= o.maxRuns) break;
    const ra = runsInBand(am, band.y0, band.y1);
    const rb = runsInBand(bm, band.y0, band.y1);
    const used = new Set<number>();
    for (let i = 0; i < ra.length; i++) {
      const [s, e] = ra[i];
      const wRef = e - s;
      // узкие раны (иконки, чекбоксы, разделители) сегментируются нестабильно
      // и дают шум; смещения ищем по текстовым блокам
      if (wRef < 20) continue;
      // пара для эталонного рана: ближайший по началу среди похожих по ширине.
      // Окно 200px, потому что реальные дефекты бывают и в 75px (колонка сумм).
      let best = -1;
      let bestDist = Infinity;
      for (let j = 0; j < rb.length; j++) {
        if (used.has(j)) continue;
        const wLoc = rb[j][1] - rb[j][0];
        if (Math.abs(wLoc - wRef) > Math.max(12, wRef * 0.35)) continue;
        const dist = Math.abs(rb[j][0] - s);
        if (dist < bestDist) {
          bestDist = dist;
          best = j;
        }
      }
      if (best < 0 || bestDist > 200) {
        unmatched++;
        continue;
      }
      used.add(best);
      const dStart = rb[best][0] - s;
      const dW = rb[best][1] - rb[best][0] - wRef;
      if (Math.abs(dStart) > o.runTolerance || Math.abs(dW) > o.runTolerance) {
        found.push(
          `y=${band.y0}..${band.y1}: эталон ${s}..${e}, локальный ${rb[best][0]}..${rb[best][1]}` +
            `  →  сдвиг ${dStart >= 0 ? "+" : ""}${dStart}px` +
            (Math.abs(dW) > o.runTolerance ? `, ширина ${dW >= 0 ? "+" : ""}${dW}px` : "")
        );
      }
    }
  }
  if (unmatched) {
    lines.push(
      `(${unmatched} блоков эталона не нашли пары — либо элемент отсутствует, ` +
        `либо уехал больше чем на 200px; смотри горячие блоки)`
    );
  }
  if (!found.length) lines.push("нет — все текстовые блоки на своих местах");
  else {
    lines.push(...found.slice(0, o.maxRuns));
    if (found.length > o.maxRuns) lines.push(`… и ещё ${found.length - o.maxRuns}`);
    lines.push("");
    lines.push("Как читать:");
    lines.push("  сдвиг у ОДНОГО блока в строке      → выравнивание/паддинг этой ячейки");
    lines.push("  «ширина +N» и растёт с длиной строки → не тот размер шрифта или letter-spacing");
    lines.push("  сдвиг у ВСЕХ блоков одинаковый     → уехал контейнер, а не содержимое");
    lines.push("  разное число блоков                 → потерян элемент или склейка от смещения");
  }

  lines.push("");
  lines.push(
    "ПЕРЕД замером: снимать локальный скриншот ПОСЛЕ завершения канон-ревила, " +
      "иначе транзишен даст ложный сдвиг (в фоновой вкладке и headless транзишены " +
      "заморожены — см. alfa://knowledge/verification)."
  );
  return { lines, diffRatio, meanAbs };
}

/** Выбор пары кадров из распакованного тарбола.
    Отдельной функцией, потому что тут два подвоха, и оба ловятся только
    тестом, а не глазами:
    - «._имя» — AppleDouble от macOS-tar (`tar czf` без COPYFILE_DISABLE
      кладёт их рядом с каждым файлом, у которого есть xattr). Имя
      кончается на .png, картинки внутри нет, sharp падает с
      «unsupported image format». Отсекаем любые точечные файлы;
    - тарбол мог быть собран человеком в любом порядке, поэтому эталон
      выбираем по имени из ?ref=, а не по позиции. */
export function pickPngPair(files: string[], refName?: string) {
  const pngs = files.filter((f) => /\.png$/i.test(f) && !f.startsWith(".")).sort();
  if (pngs.length < 2) throw new Error(`нужны два PNG, пришло ${pngs.length}`);
  const ref = refName && pngs.includes(refName) ? refName : pngs[0];
  return { ref, local: pngs.find((f) => f !== ref)! };
}
