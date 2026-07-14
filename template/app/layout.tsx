import type { Metadata } from "next";
import { preload } from "react-dom";
// Порядок CSS: tokens → fonts → canon → app → tools → mobile-gate
// (см. proto://knowledge/project-structure)
import "@/styles/tokens.css";
import "@/styles/fonts.css";
import "@/styles/canon.css";
import "@/styles/app.css";
/* proto:if toolsPanel */
import "@/styles/tools.css";
/* proto:endif */
/* proto:if mobileGate */
import "@/styles/mobile-gate.css";
/* proto:endif */
/* proto:if toolsPanel */
import ToolsProvider from "@/components/tools/ToolsProvider";
/* proto:endif */

export const metadata: Metadata = {
  title: "__PROJECT_TITLE__",
  // прототип: не индексировать (дублирует robots.ts)
  robots: { index: false, follow: false },
};

// Шрифты объявлены в styles/fonts.css (@font-face — глобальный CSS ссылается
// на имена семейств литералом, поэтому next/font/local не подходит, он
// хеширует имя). Preload убирает FOUT. crossOrigin обязателен: шрифты
// грузятся в CORS-режиме даже same-origin.
// Список заполняет install_fonts (см. proto://knowledge/design-system).
const FONTS: string[] = [
  /* proto-forge:fonts */
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  for (const f of FONTS) {
    preload(f, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <html lang="ru">
      <body>
        {/* proto:if toolsPanel */}
        <ToolsProvider>{children}</ToolsProvider>
        {/* proto:else */}
        <main>{children}</main>
        {/* proto:endif */}
        {/* proto:if mobileGate */}
        {/* заглушка <1024px: прототип десктопный (styles/mobile-gate.css) */}
        <div className="mgate" role="status">
          <img src="/icon.svg" alt="" width="64" height="64" />
          <p className="mgate-t">Прототип рассчитан на десктоп</p>
          <p className="mgate-s">
            Откройте эту ссылку на компьютере — мобильная версия ещё не
            свёрстана.
          </p>
        </div>
        {/* proto:endif */}
      </body>
    </html>
  );
}
