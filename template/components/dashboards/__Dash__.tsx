"use client";
import { memo } from "react";
import { demoStats } from "@/data/demo";
import { usePageBehavior } from "@/lib/usePageBehavior";

/* Дашборд «__DASH_TITLE__» — заготовка. Сюда верстается макет:
   - статичную разметку переносить byte-perfect (proto://knowledge/pixel-perfect);
   - при миграции больших кусков — dangerouslySetInnerHTML + memo
     (proto://knowledge/react-patterns);
   - демо-данные держать в data/*, не в разметке. */

function __DASH_COMPONENT__Inner() {
  usePageBehavior();
  return (
    /* chrome-main даёт отступы под сайдбар/шапку (no-op, если хром выключен) */
    <main className="page chrome-main">
      <div className="page-inner pf-reveal pf-stagger pf-hidden">
        <h1 className="page-title">__DASH_TITLE__</h1>
        <p className="page-sub">
          Заготовка дашборда. Замените содержимое вёрсткой по макету.
        </p>
        <div className="demo-grid">
          {demoStats.map((s) => (
            <section className="demo-card" key={s.label}>
              <p className="demo-card-v">{s.value}</p>
              <p className="demo-card-l">{s.label}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

/* memo обязателен, если внутри появится dangerouslySetInnerHTML:
   апдейт контекста panelOpen/state не должен пере-инжектить статику. */
export default memo(__DASH_COMPONENT__Inner);
