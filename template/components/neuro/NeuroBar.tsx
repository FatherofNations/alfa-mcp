"use client";
import { memo } from "react";
import { useNeuroBar, NEURO_REPLY } from "./useNeuroBar";
import "@/styles/neuro.css";

/* Умная строка (нейропомощник): пилюля снизу по центру.
   Клик → разворот (хлопок-морф + магнит к курсору), Enter → фуллскрин-чат
   с blur-стримингом захардкоженного ответа. Esc-цепочка: чат → строка.
   Весь моушен — канон (proto://knowledge/animation-canon, рецепты 7/11/12).
   Оверлеи fixed → компонент подключать СИБЛИНГОМ контента, не внутрь
   transform-предка (proto://knowledge/react-patterns). */

function NeuroBarInner() {
  useNeuroBar();
  return (
    <>
      {/* пилюля: магнит пишет --mx/--my, разворот — width-морф */}
      <div className="nbar pf-magnet" role="search">
        <button className="nbar-orb" aria-label="Нейропомощник" />
        <input
          className="nbar-input"
          placeholder="Спросите о чём угодно…"
          aria-label="Запрос нейропомощнику"
        />
      </div>

      {/* фуллскрин-чат: блоки ответа стримятся blur-ревилом */}
      <div className="nchat" aria-hidden="true">
        <div className="nchat-scroll">
          <p className="nchat-q rv-block" />
          <div className="nchat-a">
            {NEURO_REPLY.map((_, i) => (
              <p className="rv-block" key={i} />
            ))}
          </div>
        </div>
        <p className="nchat-esc">Esc — закрыть</p>
      </div>
    </>
  );
}

/* memo: апдейты контекста tools не должны перерисовывать строку —
   JS-выставленные --mx/--my и классы состояний живут в DOM. */
export default memo(NeuroBarInner);
