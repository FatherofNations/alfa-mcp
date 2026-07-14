/* Загрузка шрифтов дизайн-системы из публичного core-ds и генерация
   fonts.css. Используется скаффолдом (шрифты ставятся сразу) и тулом
   install_fonts. Шрифты не вшиты в пакет (лицензия) — качаются в момент
   установки. */

export const CORE_DS_RAW =
  "https://raw.githubusercontent.com/core-ds/core-components/HEAD/.storybook/public/fonts";

export interface FontFile {
  file: string;
  family: string;
  weight: number;
}

export const FAMILIES: Record<string, FontFile[]> = {
  "alfa-interface-sans": [
    { file: "alfa-interface-sans_regular.woff2", family: "Alfa Interface Sans", weight: 400 },
    { file: "alfa-interface-sans_medium.woff2", family: "Alfa Interface Sans", weight: 500 },
    { file: "alfa-interface-sans_bold.woff2", family: "Alfa Interface Sans", weight: 700 },
  ],
  "styrene-ui": [
    { file: "styrene-ui_regular.woff2", family: "Styrene UI", weight: 400 },
    { file: "styrene-ui_medium.woff2", family: "Styrene UI", weight: 500 },
    { file: "styrene-ui_bold.woff2", family: "Styrene UI", weight: 700 },
  ],
};

export const DEFAULT_FAMILIES = ["alfa-interface-sans", "styrene-ui"];

export function fontFaceCss(fonts: FontFile[]): string {
  const blocks = fonts.map(
    (f) => `@font-face {
  font-family: '${f.family}';
  src: url('/fonts/${f.file}') format('woff2');
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
}`
  );
  return `/* Сгенерировано proto-forge (источник: core-ds).
   См. proto://knowledge/design-system — почему @font-face, а не next/font. */

${blocks.join("\n\n")}
`;
}

/** Качает один woff2; null при ошибке сети/валидации (magic 'wOF2'). */
export async function downloadFont(f: FontFile): Promise<Buffer | null> {
  try {
    const res = await fetch(`${CORE_DS_RAW}/${f.file}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf.toString("ascii", 0, 4) !== "wOF2") return null;
    return buf;
  } catch {
    return null;
  }
}

export function preloadList(fonts: FontFile[]): string {
  return fonts.map((f) => `  "/fonts/${f.file}",`).join("\n");
}
