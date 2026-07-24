/* Поведение страницы — vanilla JS, без сборки.
   Правила (см. alfa://knowledge/animation-canon и pixel-perfect):
   - тайминги/кривые — только канон (классы в styles/canon.css);
   - слушатели — именованными функциями (снимать при необходимости);
   - данные захардкожены рядом с использованием, не читаются из DOM. */

(() => {
  "use strict";

  // канон-ревил контента при загрузке: снять .pf-hidden со стаггер-контейнеров
  const reveal = () => {
    document
      .querySelectorAll(".pf-reveal.pf-hidden")
      .forEach((el) => el.classList.remove("pf-hidden"));
  };
  // кадр на отрисовку скрытого состояния → проявление по канону
  requestAnimationFrame(() => setTimeout(reveal, 60));

  // сюда — обработчики страницы, например:
  // const cta = document.querySelector(".hero-cta");
  // if (cta) cta.addEventListener("click", onCtaClick);
})();
