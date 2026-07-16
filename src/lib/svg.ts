/* Санитайзер SVG из Figma-экспортов. Чистки:
   1) fill="var(--fill-0, X)" → fill="X" — в <img> CSS-переменные не
      работают, иконка становится невидимой;
   2) удаление фонового path (эвристика: полноразмерный прямоугольник
      первым элементом);
   3) предупреждение о fill-opacity (в CSS-маске даёт двойную
      полупрозрачность — см. design-system.md). */

export interface SvgSanitizeResult {
  svg: string;
  changes: string[];
  warnings: string[];
}

/* Резолв Figma-переменных в конкретные цвета: var(--fill-N, fallback) →
   fallback (атрибуты fill/stroke и style). Нужно и санитайзеру (в <img>
   var() не работают), и растеризации (librsvg не резолвит CSS-переменные —
   без этого цвета «схлопнутся» в чёрный/пусто). Возвращает изменённый svg
   и число замен. */
export function resolveSvgVars(src: string): { svg: string; count: number } {
  let svg = src;
  let count = 0;
  const varRe = /(fill|stroke)="var\(--[\w-]+,\s*([^)"]+)\)"/g;
  count += [...svg.matchAll(varRe)].length;
  svg = svg.replace(varRe, '$1="$2"');
  const styleVarRe = /(fill|stroke):\s*var\(--[\w-]+,\s*([^);"]+)\)/g;
  count += [...svg.matchAll(styleVarRe)].length;
  svg = svg.replace(styleVarRe, "$1:$2");
  return { svg, count };
}

/* Встроенный растр внутри SVG (<image href="data:…">) — типично для
   флагов/фото, запечённых дизайнером в svg. Такой файл бессмысленно
   держать как SVG: это условие для растеризации в PNG. */
export function hasEmbeddedRaster(src: string): boolean {
  return /<image\b/i.test(src);
}

export function sanitizeSvg(src: string): SvgSanitizeResult {
  const changes: string[] = [];
  const warnings: string[] = [];
  let svg = src;

  // 1) var(--fill-N, fallback) → fallback (fill и stroke, атрибуты и style)
  const { svg: resolved, count: varCount } = resolveSvgVars(svg);
  svg = resolved;
  if (varCount > 0) changes.push(`fill/stroke var(…) → конкретный цвет: ${varCount} шт.`);
  // var без фолбэка — заменить нечем, предупреждаем
  if (/(?:fill|stroke)="var\([^)]*\)"/.test(svg)) {
    warnings.push("остались var(--…) БЕЗ фолбэка — в <img> элемент будет невидим, нужен ручной цвет");
  }

  // 2) фоновый прямоугольник: первый path/rect размером с viewBox
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (vb) {
    const [w, h] = [parseFloat(vb[1]), parseFloat(vb[2])];
    // rect на весь viewBox
    const rectRe = new RegExp(
      `<rect(?=[^>]*width="${w}")(?=[^>]*height="${h}")(?![^>]*(?:mask|clip-path)=)[^>]*/?>(?:</rect>)?`
    );
    const firstEl = svg.match(/<(rect|path|circle|g)\b[^>]*>/);
    if (firstEl && firstEl[1] === "rect" && rectRe.test(firstEl[0])) {
      svg = svg.replace(firstEl[0], "");
      changes.push(`удалён фоновый <rect> ${w}×${h}`);
    }
    // path, рисующий полноразмерный прямоугольник: M0 0H{w}V{h}H0(V0)?Z
    const bgPathRe = new RegExp(
      `<path[^>]*d="M0[ ,]0[Hh]${w}[Vv]${h}[Hh]0(?:[Vv]0)?[Zz]"[^>]*/?>(?:</path>)?`
    );
    const bgPath = svg.match(bgPathRe);
    if (bgPath) {
      svg = svg.replace(bgPath[0], "");
      changes.push(`удалён фоновый <path> ${w}×${h}`);
    }
  }

  // 3) fill-opacity — двойная полупрозрачность при использовании в маске
  const foCount = [...svg.matchAll(/fill-opacity="([^"]+)"/g)].filter(
    (m) => parseFloat(m[1]) < 1
  ).length;
  if (foCount > 0) {
    warnings.push(
      `fill-opacity<1 на ${foCount} элементах — если SVG пойдёт в CSS-маску, ` +
        "вычистить (двойная полупрозрачность); в <img> — оставить"
    );
  }

  return { svg, changes, warnings };
}
