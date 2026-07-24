"use client";
import { useEffect } from "react";

/* Заготовка хука поведения страницы — порт vanilla-паттерна.
   Правила (см. alfa://knowledge/react-patterns):
   - DOM опрашиваем в useEffect через document.querySelector;
   - ПОЛНЫЙ cleanup: StrictMode прогоняет эффекты дважды (dev);
   - данные, читаемые из DOM при маунте, — захардкодить;
   - тайминги/кривые — только из канона (alfa://knowledge/animation-canon). */

export function usePageBehavior() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(
      el: Element | null,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void
    ) => {
      if (!el) return;
      el.addEventListener(type, fn as EventListener);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener));
    };

    // канон-ревил контента при маунте: снять .pf-hidden со стаггер-контейнера
    const t = window.setTimeout(() => {
      document
        .querySelectorAll(".pf-reveal.pf-hidden")
        .forEach((el) => el.classList.remove("pf-hidden"));
    }, 60);
    cleanups.push(() => window.clearTimeout(t));

    // пример обработчика:
    // on(document.querySelector(".hero-cta"), "click", () => { … });
    void on;

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
