"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { DASHBOARDS, dashboardByPath } from "@/lib/dashboards";
import ToolsPanel from "./ToolsPanel";

/* Контекст прототипа — живёт в root layout (переживает смену роута →
   панель не закрывается при свопе дашбордов). Держит: текущий дашборд
   (из pathname), состояния прототипа, открытость панели, своп-диссолв.
   См. proto://knowledge/tools-panel. */

/* Состояния прототипа: ПРИМЕР. Замените поля под свой макет (варианты
   меню, тогглы стека и т.п.) — панель и deep-links уже подключены. */
export interface ProtoState {
  demo: boolean;
}
const DEFAULT_STATE: ProtoState = { demo: false };
const STATE_KEYS = Object.keys(DEFAULT_STATE) as (keyof ProtoState)[];

interface ToolsCtx {
  dashboard: string; // id текущего дашборда
  state: ProtoState;
  setParam: (k: keyof ProtoState, v: boolean) => void;
  panelOpen: boolean;
  setPanelOpen: (o: boolean) => void;
  swapTo: (route: string) => void;
}

// своп дашбордов: сколько ждём растворения борда до смены роута
// (= transition 0.22s ease-in класса dash-out + кадр запаса)
const SWAP_OUT_MS = 250;

const Ctx = createContext<ToolsCtx | null>(null);
export const useTools = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTools must be used within ToolsProvider");
  return c;
};

export default function ToolsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dashboard = dashboardByPath(pathname).id;

  const [state, setState] = useState<ProtoState>(DEFAULT_STATE);
  const [panelOpen, setPanelOpen] = useState(false);
  const setParam = useCallback(
    (k: keyof ProtoState, v: boolean) => setState((s) => ({ ...s, [k]: v })),
    []
  );

  /* ── плавный своп дашбордов: рецепт content-dissolve из канона ──
     Карточка панели зовёт swapTo: наполнение борда растворяется в блюр
     (класс dash-out, 0.22s ease-in — канон скрытия), роут меняется, когда
     контент ПОЛНОСТЬЮ прозрачен, по приезде класс снимается — новый
     дашборд проявляется из блюра (канон появления, 0.5s + 120ms). */
  const [swapping, setSwapping] = useState(false);
  const swappingRef = useRef(false);
  const setSwap = useCallback((v: boolean) => {
    swappingRef.current = v;
    setSwapping(v);
  }, []);

  const swapTo = useCallback(
    (route: string) => {
      const target = dashboardByPath(route).id;
      if (swappingRef.current || target === dashboard) return;
      setSwap(true);
      window.setTimeout(() => router.push(route), SWAP_OUT_MS);
      // страховка: если навигация не случилась (оффлайн и т.п.) — вернуть борд
      window.setTimeout(() => {
        if (swappingRef.current) setSwap(false);
      }, 2500);
    },
    [dashboard, router, setSwap]
  );

  // приезд нового дашборда: кадр на отрисовку в прозрачности → проявление
  useEffect(() => {
    if (!swappingRef.current) return;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !swappingRef.current) return;
        setSwap(false);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [dashboard, setSwap]);

  // все роуты статичные — префетчим, чтобы под блюром не ждать сеть
  useEffect(() => {
    for (const d of DASHBOARDS) router.prefetch(d.route);
  }, [router]);

  /* proto:if deepLinks */
  /* ── состояние в URL (см. proto://knowledge/deep-links) ──
     Дашборд уже в пути; параметры пишем в query через replaceState. */
  const urlSynced = useRef(false);

  // старт: применяем параметры из ссылки один раз (теми же сеттерами, что UI)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setState((s) => {
      const next = { ...s };
      for (const k of STATE_KEYS) if (sp.has(k)) next[k] = sp.get(k) === "1";
      return next;
    });
    urlSynced.current = true;
  }, []);

  // синхронизация: пишем текущее состояние в адресную строку без перезагрузки
  useEffect(() => {
    if (!urlSynced.current) return;
    const sp = new URLSearchParams();
    for (const k of STATE_KEYS) {
      if (state[k] !== DEFAULT_STATE[k]) sp.set(k, state[k] ? "1" : "0");
    }
    const q = sp.toString();
    const url = (pathname || "/") + (q ? `?${q}` : ""); // дефолт — чистая ссылка
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [state, pathname]);
  /* proto:endif */

  // класс дашборда на body (скоуп для page-specific правил)
  useEffect(() => {
    for (const d of DASHBOARDS) {
      document.body.classList.toggle(`dash-${d.id}`, d.id === dashboard);
    }
  }, [dashboard]);

  // открытая панель: рамка-обрезка (чистый CSS, styles/tools.css)
  useEffect(() => {
    document.body.classList.toggle("twk-open", panelOpen);
    document.documentElement.classList.toggle("twk-open", panelOpen); // фон полей на html
    if (panelOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setPanelOpen(false);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [panelOpen]);

  return (
    <Ctx.Provider
      value={{ dashboard, state, setParam, panelOpen, setPanelOpen, swapTo }}
    >
      {/* .board — неподвижный фрейм (подложка+рамка); при свопе растворяется
          только наполнение .board-body (скролл-контейнер) */}
      <div className="board">
        <div className={swapping ? "board-body dash-out" : "board-body"}>
          {children}
        </div>
      </div>
      <ToolsPanel />
    </Ctx.Provider>
  );
}
