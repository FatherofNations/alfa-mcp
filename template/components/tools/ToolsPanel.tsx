"use client";
import { useTools, ProtoState } from "./ToolsProvider";
import { DASHBOARDS } from "@/lib/dashboards";

/* Панель прототипа: карточки-селектор дашбордов, секции параметров.
   Динамическая часть (.twk-dyn) ремаунтится по key → пункты проявляются
   из блюра сверху вниз по канону. См. proto://knowledge/tools-panel. */

// iOS-свитч (стили .twk-sw в tools.css)
function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="twk-sw">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </span>
  );
}

function Row({ label, k }: { label: string; k: keyof ProtoState }) {
  const { state, setParam } = useTools();
  return (
    <label className="twk-row">
      <span className="lb">{label}</span>
      <Switch on={state[k]} onChange={(v) => setParam(k, v)} />
    </label>
  );
}

export default function ToolsPanel() {
  const { dashboard, panelOpen, setPanelOpen, swapTo } = useTools();

  return (
    <>
      <aside className="twk" aria-hidden={!panelOpen}>
        {/* ── селектор дашборда: своп через диссолв борда (swapTo) ── */}
        <div className="twk-cards">
          {DASHBOARDS.map((d) => (
            <button
              key={d.id}
              className={"twk-card" + (dashboard === d.id ? " active" : "")}
              onClick={() => swapTo(d.route)}
            >
              <span className="twk-card-t">{d.title}</span>
              <span className="twk-card-s">{d.subtitle}</span>
            </button>
          ))}
        </div>

        {/* ── динамическая часть: ремаунт по key → стаггер-проявление ──
              Секции ниже — ЗАГЛУШКИ. Замените на состояния своего прототипа. */}
        <div className="twk-dyn" key={dashboard}>
          <p className="twk-sec">Параметры</p>
          <Row label="Параметр 1" k="param1" />
          <Row label="Параметр 2" k="param2" />
          <p className="twk-hint">
            Свитчи выше — заглушки. Добавьте свои состояния в{" "}
            <b>ProtoState</b> (ToolsProvider) и строки здесь — deep-links
            подхватятся автоматически.
          </p>
        </div>
      </aside>

      {/* ── плавающая кнопка (иконка морфится в крестик) ── */}
      <button
        className="twk-fab"
        aria-label="Инструменты"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <svg className="sliders" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M2 5.5h7.5M16.5 5.5h1.5M2 14.5h1.5M10.5 14.5h7.5"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="13" cy="5.5" r="2.2" stroke="#fff" strokeWidth="1.8" />
          <circle cx="7" cy="14.5" r="2.2" stroke="#fff" strokeWidth="1.8" />
        </svg>
        <svg className="x" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M4.5 4.5l11 11M15.5 4.5l-11 11"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  );
}
